/**
 * Builds a copy-on-write ModelStoreReader that previews a complete mutation sequence.
 * Local storage preconditions are checked per mutation; cross-entity invariants are
 * checked once after the final projected state exists. The base reader is never mutated.
 */
import type { MasterChannelRecord } from '#internal/model/channel'
import type { DeviceDescriptor } from '#internal/model/device'
import type {
  ClipId,
  DeviceId,
  MidiSourceId,
  NoteId,
  TempoEventId,
  TimeSignatureEventId,
  TrackId,
} from '#internal/model/ids'
import { assertModelInvariants } from '#internal/model/invariant-validator'
import type { ClipRecord } from '#internal/model/midi-clip'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'
import type { ProjectRecord } from '#internal/model/project'
import type { TrackRecord } from '#internal/model/track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'
import { MutationPlanError } from './mutation-plan-error'
import {
  MutationPreconditionError,
  type MutationPreconditionErrorCode,
} from './mutation-precondition-error'
import { PROJECT_MUTATION_TYPE, type ProjectMutationType } from './mutation-type'
import type { ProjectMutation } from './project-mutation'

const DELETED = Symbol('projected-deleted')

type EntryPosition = 'append' | 'base'

interface MutationContext {
  readonly index: number
  readonly type: ProjectMutationType
}

interface ProjectedEntry<RecordType> {
  readonly position: EntryPosition
  readonly value: RecordType
}

type TablePatch<RecordType> = ProjectedEntry<RecordType> | typeof DELETED

interface ProjectedNotePartition {
  readonly position: EntryPosition
  readonly notes: Map<NoteId, MidiNoteRecord>
}

type NotePartitionPatch = ProjectedNotePartition | typeof DELETED

function rejectPrecondition(
  code: MutationPreconditionErrorCode,
  context: MutationContext,
  detail: string,
): never {
  throw new MutationPreconditionError(code, context.index, context.type, detail)
}

function rejectUnknownMutation(mutation: never, index: number): never {
  const type = (mutation as { readonly type?: unknown }).type

  throw new MutationPlanError(
    'unknown-mutation-type',
    `Mutation at index ${index} has an unknown type: ${String(type)}`,
    index,
  )
}

class ProjectedEntityTable<Id extends string, RecordType extends { readonly id: Id }> {
  readonly #entityName: string
  readonly #getBase: (id: Id) => RecordType | undefined
  readonly #iterateBase: () => IterableIterator<readonly [Id, RecordType]>
  readonly #patches = new Map<Id, TablePatch<RecordType>>()

  constructor(
    entityName: string,
    getBase: (id: Id) => RecordType | undefined,
    iterateBase: () => IterableIterator<readonly [Id, RecordType]>,
  ) {
    this.#entityName = entityName
    this.#getBase = getBase
    this.#iterateBase = iterateBase
  }

  get(id: Id): RecordType | undefined {
    const patch = this.#patches.get(id)

    if (patch === DELETED) {
      return undefined
    }

    if (patch !== undefined) {
      return patch.value
    }

    return this.#getBase(id)
  }

  insert(after: RecordType, context: MutationContext): void {
    if (this.get(after.id) !== undefined) {
      rejectPrecondition(
        'insert-target-exists',
        context,
        `cannot insert existing ${this.#entityName} ${after.id}`,
      )
    }

    // Deleting first makes a delete-then-insert move to the real Map append position.
    this.#patches.delete(after.id)
    this.#patches.set(after.id, { position: 'append', value: after })
  }

  remove(before: RecordType, context: MutationContext): void {
    const current = this.get(before.id)

    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot remove missing ${this.#entityName} ${before.id}`,
      )
    }

    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `${this.#entityName} ${before.id} no longer matches the expected before record`,
      )
    }

    if (this.#getBase(before.id) === undefined) {
      this.#patches.delete(before.id)
    } else {
      this.#patches.set(before.id, DELETED)
    }
  }

  replace(before: RecordType, after: RecordType, context: MutationContext): void {
    const current = this.get(before.id)

    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot replace missing ${this.#entityName} ${before.id}`,
      )
    }

    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `${this.#entityName} ${before.id} no longer matches the expected before record`,
      )
    }

    const patch = this.#patches.get(before.id)
    const position = patch !== undefined && patch !== DELETED ? patch.position : 'base'

    // Keying by before.id lets final invariant validation catch a forged ID-changing replace.
    this.#patches.set(before.id, { position, value: after })
  }

  *entries(): IterableIterator<readonly [Id, RecordType]> {
    for (const [id, baseRecord] of this.#iterateBase()) {
      const patch = this.#patches.get(id)

      if (patch === DELETED || patch?.position === 'append') {
        continue
      }

      yield [id, patch?.value ?? baseRecord] as const
    }

    for (const [id, patch] of this.#patches) {
      if (patch !== DELETED && patch.position === 'append') {
        yield [id, patch.value] as const
      }
    }
  }
}

export class ProjectedModelStoreReader implements ModelStoreReader {
  readonly #base: ModelStoreReader
  #project: ProjectRecord
  #master: MasterChannelRecord
  #trackOrder: TrackId[] | undefined

  readonly #tracks: ProjectedEntityTable<TrackId, TrackRecord>
  readonly #clips: ProjectedEntityTable<ClipId, ClipRecord>
  readonly #midiSources: ProjectedEntityTable<MidiSourceId, MidiSourceRecord>
  readonly #tempoEvents: ProjectedEntityTable<TempoEventId, TempoEventRecord>
  readonly #timeSignatureEvents: ProjectedEntityTable<
    TimeSignatureEventId,
    TimeSignatureEventRecord
  >
  readonly #devices: ProjectedEntityTable<DeviceId, DeviceDescriptor>
  readonly #notePartitions = new Map<MidiSourceId, NotePartitionPatch>()

  /** Mutations must be the normalized forward entries produced by createMutationPlan. */
  constructor(base: ModelStoreReader, mutations: readonly ProjectMutation[]) {
    this.#base = base
    this.#project = base.project
    this.#master = base.master

    this.#tracks = new ProjectedEntityTable(
      'Track',
      (id) => base.getTrack(id),
      () => base.trackEntries(),
    )
    this.#clips = new ProjectedEntityTable(
      'Clip',
      (id) => base.getClip(id),
      () => base.clipEntries(),
    )
    this.#midiSources = new ProjectedEntityTable(
      'MIDI Source',
      (id) => base.getMidiSource(id),
      () => base.midiSourceEntries(),
    )
    this.#tempoEvents = new ProjectedEntityTable(
      'Tempo Event',
      (id) => base.getTempoEvent(id),
      () => base.tempoEventEntries(),
    )
    this.#timeSignatureEvents = new ProjectedEntityTable(
      'Time Signature Event',
      (id) => base.getTimeSignatureEvent(id),
      () => base.timeSignatureEventEntries(),
    )
    this.#devices = new ProjectedEntityTable(
      'Device',
      (id) => base.getDevice(id),
      () => base.deviceEntries(),
    )

    mutations.forEach((mutation, index) => this.#applyMutation(mutation, index))

    // Intermediate steps may be relationally incomplete; only the final view is validated.
    assertModelInvariants(this)
  }

  get modelRevision(): ModelRevision {
    return this.#base.modelRevision
  }

  get project(): ProjectRecord {
    return this.#project
  }

  get master(): MasterChannelRecord {
    return this.#master
  }

  orderedTrackIds(): IterableIterator<TrackId> {
    if (this.#trackOrder === undefined) {
      return this.#base.orderedTrackIds()
    }

    return this.#trackOrder.values()
  }

  getTrack(id: TrackId): TrackRecord | undefined {
    return this.#tracks.get(id)
  }

  trackEntries(): IterableIterator<readonly [TrackId, TrackRecord]> {
    return this.#tracks.entries()
  }

  getClip(id: ClipId): ClipRecord | undefined {
    return this.#clips.get(id)
  }

  clipEntries(): IterableIterator<readonly [ClipId, ClipRecord]> {
    return this.#clips.entries()
  }

  getMidiSource(id: MidiSourceId): MidiSourceRecord | undefined {
    return this.#midiSources.get(id)
  }

  midiSourceEntries(): IterableIterator<readonly [MidiSourceId, MidiSourceRecord]> {
    return this.#midiSources.entries()
  }

  hasMidiNotePartition(sourceId: MidiSourceId): boolean {
    const patch = this.#notePartitions.get(sourceId)

    if (patch === DELETED) {
      return false
    }

    if (patch !== undefined) {
      return true
    }

    return this.#base.hasMidiNotePartition(sourceId)
  }

  *midiNotePartitionIds(): IterableIterator<MidiSourceId> {
    for (const sourceId of this.#base.midiNotePartitionIds()) {
      const patch = this.#notePartitions.get(sourceId)

      if (patch === DELETED || patch?.position === 'append') {
        continue
      }

      yield sourceId
    }

    for (const [sourceId, patch] of this.#notePartitions) {
      if (patch !== DELETED && patch.position === 'append') {
        yield sourceId
      }
    }
  }

  getMidiNote(sourceId: MidiSourceId, noteId: NoteId): MidiNoteRecord | undefined {
    const patch = this.#notePartitions.get(sourceId)

    if (patch === DELETED) {
      return undefined
    }

    if (patch !== undefined) {
      return patch.notes.get(noteId)
    }

    return this.#base.getMidiNote(sourceId, noteId)
  }

  *midiNoteEntries(sourceId: MidiSourceId): IterableIterator<readonly [NoteId, MidiNoteRecord]> {
    const patch = this.#notePartitions.get(sourceId)

    if (patch === DELETED) {
      return
    }

    if (patch !== undefined) {
      yield* patch.notes.entries()
      return
    }

    yield* this.#base.midiNoteEntries(sourceId)
  }

  getTempoEvent(id: TempoEventId): TempoEventRecord | undefined {
    return this.#tempoEvents.get(id)
  }

  tempoEventEntries(): IterableIterator<readonly [TempoEventId, TempoEventRecord]> {
    return this.#tempoEvents.entries()
  }

  getTimeSignatureEvent(id: TimeSignatureEventId): TimeSignatureEventRecord | undefined {
    return this.#timeSignatureEvents.get(id)
  }

  timeSignatureEventEntries(): IterableIterator<
    readonly [TimeSignatureEventId, TimeSignatureEventRecord]
  > {
    return this.#timeSignatureEvents.entries()
  }

  getDevice(id: DeviceId): DeviceDescriptor | undefined {
    return this.#devices.get(id)
  }

  deviceEntries(): IterableIterator<readonly [DeviceId, DeviceDescriptor]> {
    return this.#devices.entries()
  }

  #mutableTrackOrder(): TrackId[] {
    this.#trackOrder ??= [...this.#base.orderedTrackIds()]

    return this.#trackOrder
  }

  #insertTrackOrder(index: number, trackId: TrackId, context: MutationContext): void {
    const trackOrder = this.#mutableTrackOrder()

    if (!Number.isSafeInteger(index) || index < 0 || index > trackOrder.length) {
      rejectPrecondition(
        'track-order-index-out-of-bounds',
        context,
        `cannot insert Track ${trackId} at index ${index} for length ${trackOrder.length}`,
      )
    }

    trackOrder.splice(index, 0, trackId)
  }

  #removeTrackOrder(index: number, trackId: TrackId, context: MutationContext): void {
    const trackOrder = this.#mutableTrackOrder()

    if (!Number.isSafeInteger(index) || index < 0 || index >= trackOrder.length) {
      rejectPrecondition(
        'track-order-index-out-of-bounds',
        context,
        `cannot remove Track ${trackId} at index ${index} for length ${trackOrder.length}`,
      )
    }

    if (trackOrder[index] !== trackId) {
      rejectPrecondition(
        'track-order-entry-mismatch',
        context,
        `expected Track ${trackId} at index ${index}, found ${String(trackOrder[index])}`,
      )
    }

    trackOrder.splice(index, 1)
  }

  #insertNotePartition(
    sourceId: MidiSourceId,
    notes: readonly MidiNoteRecord[],
    context: MutationContext,
  ): void {
    if (this.hasMidiNotePartition(sourceId)) {
      rejectPrecondition(
        'insert-target-exists',
        context,
        `cannot insert existing MIDI Note partition ${sourceId}`,
      )
    }

    const noteTable = new Map<NoteId, MidiNoteRecord>()

    for (const note of notes) {
      if (noteTable.has(note.id)) {
        throw new MutationPlanError(
          'duplicate-note-id-in-partition',
          `Mutation at index ${context.index} contains duplicate MIDI Note ID ${note.id}`,
          context.index,
        )
      }

      noteTable.set(note.id, note)
    }

    this.#notePartitions.delete(sourceId)
    this.#notePartitions.set(sourceId, { position: 'append', notes: noteTable })
  }

  #removeNotePartition(
    sourceId: MidiSourceId,
    before: readonly MidiNoteRecord[],
    context: MutationContext,
  ): void {
    if (!this.hasMidiNotePartition(sourceId)) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot remove missing MIDI Note partition ${sourceId}`,
      )
    }

    if (!this.#notePartitionMatches(sourceId, before)) {
      rejectPrecondition(
        'note-partition-content-mismatch',
        context,
        `MIDI Note partition ${sourceId} no longer matches the expected before records`,
      )
    }

    if (this.#base.hasMidiNotePartition(sourceId)) {
      this.#notePartitions.set(sourceId, DELETED)
    } else {
      this.#notePartitions.delete(sourceId)
    }
  }

  #notePartitionMatches(sourceId: MidiSourceId, before: readonly MidiNoteRecord[]): boolean {
    const expectedNotes = new Map(before.map((note) => [note.id, note] as const))

    if (expectedNotes.size !== before.length) {
      return false
    }

    let currentSize = 0

    for (const [noteId, note] of this.midiNoteEntries(sourceId)) {
      currentSize += 1

      if (expectedNotes.get(noteId) !== note) {
        return false
      }
    }

    return currentSize === expectedNotes.size
  }

  #mutableNotePartition(
    sourceId: MidiSourceId,
    context: MutationContext,
  ): Map<NoteId, MidiNoteRecord> {
    const patch = this.#notePartitions.get(sourceId)

    if (patch !== undefined && patch !== DELETED) {
      return patch.notes
    }

    if (patch === DELETED || !this.#base.hasMidiNotePartition(sourceId)) {
      rejectPrecondition(
        'target-missing',
        context,
        `MIDI Note partition ${sourceId} does not exist`,
      )
    }

    const noteTable = new Map(this.#base.midiNoteEntries(sourceId))

    this.#notePartitions.set(sourceId, { position: 'base', notes: noteTable })

    return noteTable
  }

  #insertNote(sourceId: MidiSourceId, after: MidiNoteRecord, context: MutationContext): void {
    const noteTable = this.#mutableNotePartition(sourceId, context)

    if (noteTable.has(after.id)) {
      rejectPrecondition(
        'insert-target-exists',
        context,
        `cannot insert existing MIDI Note ${sourceId}/${after.id}`,
      )
    }

    noteTable.set(after.id, after)
  }

  #removeNote(sourceId: MidiSourceId, before: MidiNoteRecord, context: MutationContext): void {
    const noteTable = this.#mutableNotePartition(sourceId, context)
    const current = noteTable.get(before.id)

    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot remove missing MIDI Note ${sourceId}/${before.id}`,
      )
    }

    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `MIDI Note ${sourceId}/${before.id} no longer matches the expected before record`,
      )
    }

    noteTable.delete(before.id)
  }

  #replaceNote(
    sourceId: MidiSourceId,
    before: MidiNoteRecord,
    after: MidiNoteRecord,
    context: MutationContext,
  ): void {
    const noteTable = this.#mutableNotePartition(sourceId, context)
    const current = noteTable.get(before.id)

    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot replace missing MIDI Note ${sourceId}/${before.id}`,
      )
    }

    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `MIDI Note ${sourceId}/${before.id} no longer matches the expected before record`,
      )
    }

    noteTable.set(before.id, after)
  }

  #applyMutation(mutation: ProjectMutation, index: number): void {
    const context = { index, type: mutation.type }

    switch (mutation.type) {
      case PROJECT_MUTATION_TYPE.PROJECT.REPLACE:
        if (this.#project !== mutation.before) {
          rejectPrecondition(
            'before-reference-mismatch',
            context,
            'Project no longer matches the expected before record',
          )
        }
        this.#project = mutation.after
        return

      case PROJECT_MUTATION_TYPE.MASTER.REPLACE:
        if (this.#master !== mutation.before) {
          rejectPrecondition(
            'before-reference-mismatch',
            context,
            'Master Channel no longer matches the expected before record',
          )
        }
        this.#master = mutation.after
        return

      case PROJECT_MUTATION_TYPE.TRACK.INSERT:
        this.#tracks.insert(mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.TRACK.REMOVE:
        this.#tracks.remove(mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.TRACK.REPLACE:
        this.#tracks.replace(mutation.before, mutation.after, context)
        return

      case PROJECT_MUTATION_TYPE.CLIP.INSERT:
        this.#clips.insert(mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
        this.#clips.remove(mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.CLIP.REPLACE:
        this.#clips.replace(mutation.before, mutation.after, context)
        return

      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
        this.#midiSources.insert(mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE:
        this.#midiSources.remove(mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE:
        this.#midiSources.replace(mutation.before, mutation.after, context)
        return

      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
        this.#tempoEvents.insert(mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
        this.#tempoEvents.remove(mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
        this.#tempoEvents.replace(mutation.before, mutation.after, context)
        return

      case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT:
        this.#timeSignatureEvents.insert(mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE:
        this.#timeSignatureEvents.remove(mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE:
        this.#timeSignatureEvents.replace(mutation.before, mutation.after, context)
        return

      case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
        this.#devices.insert(mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.DEVICE.REMOVE:
        this.#devices.remove(mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
        this.#devices.replace(mutation.before, mutation.after, context)
        return

      case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
        this.#insertTrackOrder(mutation.index, mutation.trackId, context)
        return
      case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
        this.#removeTrackOrder(mutation.index, mutation.trackId, context)
        return

      case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
        this.#insertNotePartition(mutation.sourceId, mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
        this.#removeNotePartition(mutation.sourceId, mutation.before, context)
        return

      case PROJECT_MUTATION_TYPE.NOTE.INSERT:
        this.#insertNote(mutation.sourceId, mutation.after, context)
        return
      case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
        this.#removeNote(mutation.sourceId, mutation.before, context)
        return
      case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
        this.#replaceNote(mutation.sourceId, mutation.before, mutation.after, context)
        return

      default:
        return rejectUnknownMutation(mutation, index)
    }
  }
}
