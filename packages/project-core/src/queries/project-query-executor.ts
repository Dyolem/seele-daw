import type { NoteId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import {
  compareMidiNotesForQuery,
  midiNoteEndTick,
  midiNoteIntersectsQuery,
} from '#internal/queries/midi-note-query-semantics'
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
import type { ProjectSnapshot } from '#internal/snapshots/project-snapshot'
import type { Tick } from '#internal/time/tick'

/** One partition's Notes in query order, with the latest end among each prefix. */
interface MidiNoteRangeIndex {
  readonly byStart: readonly MidiNoteRecord[]
  readonly prefixMaxEnd: readonly Tick[]
}

const NO_NOTES = Object.freeze<MidiNoteRecord[]>([])

/**
 * Range indexes by Snapshot partition. A partition no commit touched is the same array in the
 * next Snapshot and keeps its index; a touched one is indexed on its first range query.
 */
const rangeIndexes = new WeakMap<readonly MidiNoteRecord[], MidiNoteRangeIndex>()

function rangeIndexOf(notes: readonly MidiNoteRecord[]): MidiNoteRangeIndex {
  const indexed = rangeIndexes.get(notes)
  if (indexed !== undefined) return indexed

  const byStart = [...notes].sort(compareMidiNotesForQuery)
  const prefixMaxEnd: Tick[] = []
  let maximumEnd: Tick | undefined

  for (const note of byStart) {
    const endTick = midiNoteEndTick(note)

    if (maximumEnd === undefined || endTick > maximumEnd) maximumEnd = endTick
    prefixMaxEnd.push(maximumEnd)
  }

  const index = Object.freeze({
    byStart: Object.freeze(byStart),
    prefixMaxEnd: Object.freeze(prefixMaxEnd),
  })
  rangeIndexes.set(notes, index)
  return index
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

function notesIntersecting(
  notes: readonly MidiNoteRecord[],
  query: MidiNotesIntersectingRangeQuery,
): readonly MidiNoteRecord[] {
  const { byStart, prefixMaxEnd } = rangeIndexOf(notes)
  const candidateStart = firstPrefixEndingAfter(prefixMaxEnd, query.startTick)
  const candidateEnd = firstNoteStartingAtOrAfter(byStart, query.endTick)
  const matches: MidiNoteRecord[] = []

  for (let index = candidateStart; index < candidateEnd; index += 1) {
    const note = byStart[index]!

    if (midiNoteIntersectsQuery(note, query)) matches.push(note)
  }

  return matches
}

/** Snapshot partitions are sorted by ID, so one Note is a binary search away. */
function noteById(notes: readonly MidiNoteRecord[], noteId: NoteId): MidiNoteRecord | undefined {
  let lower = 0
  let upper = notes.length

  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2)

    if (notes[middle]!.id < noteId) lower = middle + 1
    else upper = middle
  }

  const note = notes[lower]
  return note?.id === noteId ? note : undefined
}

function rejectUnhandledQuery(query: never): never {
  throw new Error(`Unhandled normalized ProjectQuery: ${String((query as ProjectQuery).type)}`)
}

/** Answers a query from one Snapshot, so the result belongs to that Snapshot's revision. */
export function executeProjectQuery<Query extends ProjectQuery>(
  snapshot: ProjectSnapshot,
  query: Query,
): ProjectQueryResultFor<Query> {
  const normalizedQuery = normalizeProjectQuery(query)
  const notes = snapshot.midiNotes[normalizedQuery.sourceId] ?? NO_NOTES
  let result: ProjectQueryResult

  switch (normalizedQuery.type) {
    case PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID:
      result = createMidiNoteByIdQueryResult(
        snapshot.modelRevision,
        noteById(notes, normalizedQuery.noteId),
      )
      break

    case PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE:
      result = createMidiNotesIntersectingRangeQueryResult(
        snapshot.modelRevision,
        notesIntersecting(notes, normalizedQuery),
      )
      break

    default:
      return rejectUnhandledQuery(normalizedQuery)
  }

  return result as ProjectQueryResultFor<Query>
}
