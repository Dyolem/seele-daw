import {
  PROJECT_CHANGE_TYPE,
  type MidiClipAddedChange,
  type MidiClipRemovedChange,
  type MidiNoteAddedChange,
  type MidiNoteRemovedChange,
  type MidiNoteUpdatedChange,
} from '#internal/commit/project-change'
import type { ProjectDelta } from '#internal/commit/project-delta'
import type { MidiSourceId, NoteId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'
import {
  compareMidiNotesForQuery,
  midiNoteEndTick,
  midiNoteIntersectsQuery,
} from '#internal/queries/midi-note-query-semantics'
import { executeProjectQueryByScan } from '#internal/queries/project-query-executor'
import {
  PROJECT_QUERY_TYPE,
  createMidiNoteByIdQueryResult,
  createMidiNotesIntersectingRangeQueryResult,
  normalizeProjectQuery,
  type MidiNotesIntersectingRangeQuery,
  type ProjectQuery,
  type ProjectQueryResult,
  type ProjectQueryResultFor,
} from '#internal/queries/project-query'
import { nextModelRevision } from '#internal/model/model-revision'
import type { Tick } from '#internal/time/tick'

interface MidiNotePartitionIndex {
  readonly byId: ReadonlyMap<NoteId, MidiNoteRecord>
  readonly byStart: readonly MidiNoteRecord[]
  readonly prefixMaxEnd: readonly Tick[]
}

interface QueryIndexRoot {
  readonly modelRevision: ModelRevision
  readonly partitions: ReadonlyMap<MidiSourceId, MidiNotePartitionIndex>
}

type QueryIndexTransitionState = 'prepared' | 'staged' | 'rolled-back'
type MidiNoteChange = MidiNoteAddedChange | MidiNoteRemovedChange | MidiNoteUpdatedChange
type MidiClipChange = MidiClipAddedChange | MidiClipRemovedChange

export type QueryIndexErrorCode =
  | 'change-precondition-failed'
  | 'delta-revision-mismatch'
  | 'duplicate-note-id'
  | 'partition-missing'
  | 'transition-stale'
  | 'transition-state-invalid'
  | 'unsupported-change-type'

/** Internal consistency failure in a rebuildable derived QueryIndex. */
export class QueryIndexError extends Error {
  readonly code: QueryIndexErrorCode
  readonly changeIndex: number | null
  readonly noteId: NoteId | null
  readonly sourceId: MidiSourceId | null

  constructor(
    code: QueryIndexErrorCode,
    message: string,
    details: {
      readonly changeIndex?: number
      readonly noteId?: NoteId
      readonly sourceId?: MidiSourceId
    } = {},
  ) {
    super(message)
    this.name = 'QueryIndexError'
    this.code = code
    this.changeIndex = details.changeIndex ?? null
    this.noteId = details.noteId ?? null
    this.sourceId = details.sourceId ?? null
  }
}

export interface PreparedQueryIndexTransition {
  readonly modelRevision: ModelRevision

  stage(): void
  rollback(): void
}

function createMidiNotePartitionIndex(notes: Iterable<MidiNoteRecord>): MidiNotePartitionIndex {
  const byId = new Map<NoteId, MidiNoteRecord>()

  for (const note of notes) {
    if (byId.has(note.id)) {
      throw new QueryIndexError(
        'duplicate-note-id',
        `MIDI Note QueryIndex cannot contain duplicate Note ID ${note.id}`,
        { noteId: note.id },
      )
    }

    byId.set(note.id, note)
  }

  const byStart = [...byId.values()].sort(compareMidiNotesForQuery)
  const prefixMaxEnd: Tick[] = []
  let maximumEnd: Tick | undefined

  for (const note of byStart) {
    const endTick = midiNoteEndTick(note)

    if (maximumEnd === undefined || endTick > maximumEnd) maximumEnd = endTick
    prefixMaxEnd.push(maximumEnd)
  }

  return Object.freeze({
    byId,
    byStart: Object.freeze(byStart),
    prefixMaxEnd: Object.freeze(prefixMaxEnd),
  })
}

function createQueryIndexRoot(reader: ModelStoreReader): QueryIndexRoot {
  const partitions = new Map<MidiSourceId, MidiNotePartitionIndex>()

  for (const sourceId of reader.midiNotePartitionIds()) {
    const notes = Array.from(reader.midiNoteEntries(sourceId), ([, note]) => note)
    partitions.set(sourceId, createMidiNotePartitionIndex(notes))
  }

  return Object.freeze({ modelRevision: reader.modelRevision, partitions })
}

function firstNoteStartingAtOrAfter(notes: readonly MidiNoteRecord[], tick: Tick): number {
  let lower = 0
  let upper = notes.length

  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2)

    if (notes[middle]!.startTick < tick) lower = middle + 1
    else upper = middle
  }

  return lower
}

function firstPrefixEndingAfter(prefixMaxEnd: readonly Tick[], tick: Tick): number {
  let lower = 0
  let upper = prefixMaxEnd.length

  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2)

    if (prefixMaxEnd[middle]! <= tick) lower = middle + 1
    else upper = middle
  }

  return lower
}

function queryPartitionRange(
  partition: MidiNotePartitionIndex,
  query: MidiNotesIntersectingRangeQuery,
): readonly MidiNoteRecord[] {
  const candidateStart = firstPrefixEndingAfter(partition.prefixMaxEnd, query.startTick)
  const candidateEnd = firstNoteStartingAtOrAfter(partition.byStart, query.endTick)
  const matches: MidiNoteRecord[] = []

  for (let index = candidateStart; index < candidateEnd; index += 1) {
    const note = partition.byStart[index]!

    if (midiNoteIntersectsQuery(note, query)) matches.push(note)
  }

  return matches
}

function rejectChangePrecondition(
  change: MidiNoteChange,
  changeIndex: number,
  detail: string,
): never {
  throw new QueryIndexError(
    'change-precondition-failed',
    `ProjectChange ${change.type} at index ${changeIndex} ${detail}`,
    { changeIndex, sourceId: change.sourceId, noteId: change.noteId },
  )
}

function rejectClipChangePrecondition(
  change: MidiClipChange,
  changeIndex: number,
  detail: string,
): never {
  throw new QueryIndexError(
    'change-precondition-failed',
    `ProjectChange ${change.type} at index ${changeIndex} ${detail}`,
    { changeIndex, sourceId: change.sourceId },
  )
}

function applyAddedNote(
  notes: Map<NoteId, MidiNoteRecord>,
  change: MidiNoteAddedChange,
  changeIndex: number,
): void {
  if (change.after.id !== change.noteId || notes.has(change.noteId)) {
    rejectChangePrecondition(change, changeIndex, 'does not describe a new Note identity')
  }

  notes.set(change.noteId, change.after)
}

function applyRemovedNote(
  notes: Map<NoteId, MidiNoteRecord>,
  change: MidiNoteRemovedChange,
  changeIndex: number,
): void {
  if (change.before.id !== change.noteId || notes.get(change.noteId) !== change.before) {
    rejectChangePrecondition(change, changeIndex, 'does not match the indexed before Record')
  }

  notes.delete(change.noteId)
}

function applyUpdatedNote(
  notes: Map<NoteId, MidiNoteRecord>,
  change: MidiNoteUpdatedChange,
  changeIndex: number,
): void {
  if (
    change.before.id !== change.noteId ||
    change.after.id !== change.noteId ||
    notes.get(change.noteId) !== change.before
  ) {
    rejectChangePrecondition(change, changeIndex, 'does not match the indexed replacement')
  }

  notes.set(change.noteId, change.after)
}

function assertClipPlacementAddress(
  change: MidiClipAddedChange | MidiClipRemovedChange,
  placement: MidiClipAddedChange['after'] | MidiClipRemovedChange['before'],
  changeIndex: number,
): void {
  if (
    placement.clip.id !== change.clipId ||
    placement.clip.trackId !== change.trackId ||
    placement.clip.sourceId !== change.sourceId ||
    placement.source.id !== change.sourceId
  ) {
    rejectClipChangePrecondition(
      change,
      changeIndex,
      'does not match its MIDI Clip placement address',
    )
  }
}

function applyAddedMidiClip(
  root: QueryIndexRoot,
  workingPartitions: Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>,
  removedPartitionIds: Set<MidiSourceId>,
  change: MidiClipAddedChange,
  changeIndex: number,
): void {
  assertClipPlacementAddress(change, change.after, changeIndex)

  const sourceId = change.sourceId
  const partitionExists =
    !removedPartitionIds.has(sourceId) &&
    (workingPartitions.has(sourceId) || root.partitions.has(sourceId))

  if (partitionExists) {
    rejectClipChangePrecondition(
      change,
      changeIndex,
      `cannot add an existing MIDI Note partition for Source ${sourceId}`,
    )
  }

  removedPartitionIds.delete(sourceId)
  workingPartitions.set(sourceId, new Map(change.after.notes.map((note) => [note.id, note])))
}

function applyRemovedMidiClip(
  root: QueryIndexRoot,
  workingPartitions: Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>,
  removedPartitionIds: Set<MidiSourceId>,
  change: MidiClipRemovedChange,
  changeIndex: number,
): void {
  assertClipPlacementAddress(change, change.before, changeIndex)

  const sourceId = change.sourceId
  const working = workingPartitions.get(sourceId)
  const indexed = working ?? root.partitions.get(sourceId)?.byId

  if (
    removedPartitionIds.has(sourceId) ||
    indexed === undefined ||
    indexed.size !== change.before.notes.length ||
    change.before.notes.some((note) => indexed.get(note.id) !== note)
  ) {
    rejectClipChangePrecondition(
      change,
      changeIndex,
      `does not match the indexed MIDI Note partition for Source ${sourceId}`,
    )
  }

  workingPartitions.delete(sourceId)
  removedPartitionIds.add(sourceId)
}

function rejectUnsupportedChange(change: never, changeIndex: number): never {
  const type = (change as { readonly type?: unknown }).type

  throw new QueryIndexError(
    'unsupported-change-type',
    `ProjectChange at index ${changeIndex} has no QueryIndex semantics: ${String(type)}`,
    { changeIndex },
  )
}

function createIncrementalRoot(root: QueryIndexRoot, delta: ProjectDelta): QueryIndexRoot {
  const workingPartitions = new Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>()
  const removedPartitionIds = new Set<MidiSourceId>()

  const requireWorkingPartition = (
    change: MidiNoteChange,
    changeIndex: number,
  ): Map<NoteId, MidiNoteRecord> => {
    const existing = workingPartitions.get(change.sourceId)

    if (existing !== undefined) return existing
    if (removedPartitionIds.has(change.sourceId)) {
      throw new QueryIndexError(
        'partition-missing',
        `MIDI Note QueryIndex has no partition for Source ${change.sourceId}`,
        { changeIndex, sourceId: change.sourceId, noteId: change.noteId },
      )
    }

    const partition = root.partitions.get(change.sourceId)

    if (partition === undefined) {
      throw new QueryIndexError(
        'partition-missing',
        `MIDI Note QueryIndex has no partition for Source ${change.sourceId}`,
        { changeIndex, sourceId: change.sourceId, noteId: change.noteId },
      )
    }

    const notes = new Map(partition.byId)
    workingPartitions.set(change.sourceId, notes)
    return notes
  }

  for (const [changeIndex, change] of delta.changes.entries()) {
    switch (change.type) {
      case PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED:
      case PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED:
        break

      case PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED:
        applyAddedMidiClip(root, workingPartitions, removedPartitionIds, change, changeIndex)
        break

      case PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED:
        applyRemovedMidiClip(root, workingPartitions, removedPartitionIds, change, changeIndex)
        break

      case PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED:
        applyAddedNote(requireWorkingPartition(change, changeIndex), change, changeIndex)
        break

      case PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED:
        applyRemovedNote(requireWorkingPartition(change, changeIndex), change, changeIndex)
        break

      case PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED:
        applyUpdatedNote(requireWorkingPartition(change, changeIndex), change, changeIndex)
        break

      default:
        return rejectUnsupportedChange(change, changeIndex)
    }
  }

  const nextPartitions = new Map(root.partitions)

  for (const sourceId of removedPartitionIds) nextPartitions.delete(sourceId)

  for (const [sourceId, notes] of workingPartitions) {
    nextPartitions.set(sourceId, createMidiNotePartitionIndex(notes.values()))
  }

  return Object.freeze({
    modelRevision: delta.modelRevision,
    partitions: nextPartitions,
  })
}

function rejectUnhandledQuery(query: never): never {
  throw new Error(`Unhandled normalized ProjectQuery: ${String((query as ProjectQuery).type)}`)
}

function canRecoverByRebuild(error: unknown): boolean {
  return (
    error instanceof QueryIndexError &&
    (error.code === 'change-precondition-failed' || error.code === 'partition-missing')
  )
}

function executeIndexedQuery(root: QueryIndexRoot, query: ProjectQuery): ProjectQueryResult {
  switch (query.type) {
    case PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID:
      return createMidiNoteByIdQueryResult(
        root.modelRevision,
        root.partitions.get(query.sourceId)?.byId.get(query.noteId),
      )

    case PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE: {
      const partition = root.partitions.get(query.sourceId)
      const notes = partition === undefined ? [] : queryPartitionRange(partition, query)

      return createMidiNotesIntersectingRangeQueryResult(root.modelRevision, notes)
    }

    default:
      return rejectUnhandledQuery(query)
  }
}

/** Owns rebuildable query acceleration without becoming a second project truth. */
export class QueryIndex {
  #root: QueryIndexRoot

  constructor(reader: ModelStoreReader) {
    this.#root = createQueryIndexRoot(reader)
  }

  get modelRevision(): ModelRevision {
    return this.#root.modelRevision
  }

  /** Replaces the complete derived root only after a successful full rebuild. */
  rebuild(reader: ModelStoreReader): void {
    const nextRoot = createQueryIndexRoot(reader)
    this.#root = nextRoot
  }

  execute<Query extends ProjectQuery>(
    reader: ModelStoreReader,
    query: Query,
  ): ProjectQueryResultFor<Query> {
    const normalizedQuery = normalizeProjectQuery(query)

    // A derived cache may be discarded. Never expose a stale result while recovery
    // catches the index up to the authoritative ModelStore revision.
    if (this.#root.modelRevision !== reader.modelRevision) {
      return executeProjectQueryByScan(reader, normalizedQuery) as ProjectQueryResultFor<Query>
    }

    return executeIndexedQuery(this.#root, normalizedQuery) as ProjectQueryResultFor<Query>
  }

  prepare(reader: ModelStoreReader, delta: ProjectDelta): PreparedQueryIndexTransition {
    if (this.#root.modelRevision !== reader.modelRevision) this.rebuild(reader)

    const expectedModelRevision = nextModelRevision(reader.modelRevision)

    if (delta.modelRevision !== expectedModelRevision) {
      throw new QueryIndexError(
        'delta-revision-mismatch',
        `ProjectDelta revision ${delta.modelRevision} does not follow ModelStore revision ${reader.modelRevision}`,
      )
    }

    let expectedRoot = this.#root
    let nextRoot: QueryIndexRoot

    try {
      nextRoot = createIncrementalRoot(expectedRoot, delta)
    } catch (error) {
      if (!canRecoverByRebuild(error)) throw error

      // A derived-cache mismatch must not become another project truth. Rebuild the
      // current revision from ModelStore, then retry the still-uncommitted Delta once.
      this.rebuild(reader)
      expectedRoot = this.#root
      nextRoot = createIncrementalRoot(expectedRoot, delta)
    }

    let state: QueryIndexTransitionState = 'prepared'

    const stage = (): void => {
      if (state !== 'prepared') {
        throw new QueryIndexError(
          'transition-state-invalid',
          `QueryIndex transition cannot stage from state ${state}`,
        )
      }

      if (this.#root !== expectedRoot) {
        throw new QueryIndexError(
          'transition-stale',
          'QueryIndex transition no longer matches the current derived root',
        )
      }

      this.#root = nextRoot
      state = 'staged'
    }

    const rollback = (): void => {
      if (state !== 'staged') {
        throw new QueryIndexError(
          'transition-state-invalid',
          `QueryIndex transition cannot roll back from state ${state}`,
        )
      }

      if (this.#root !== nextRoot) {
        throw new QueryIndexError(
          'transition-stale',
          'QueryIndex rollback no longer owns the staged derived root',
        )
      }

      this.#root = expectedRoot
      state = 'rolled-back'
    }

    return Object.freeze({
      modelRevision: nextRoot.modelRevision,
      stage,
      rollback,
    })
  }
}
