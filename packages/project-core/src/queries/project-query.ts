import { ProjectQueryError } from '#internal/queries/project-query-error'
import { parseMidiSourceId, parseNoteId, type MidiSourceId, type NoteId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { ModelRevision } from '#internal/model/model-revision'
import { parseMidiPitch, type MidiPitch } from '#internal/model/scalars'
import { parseTick, type Tick } from '#internal/time/tick'
import type { ValueOf } from '@seele-daw/type-utils'

/** Canonical runtime discriminants for read-only project queries. */
export const PROJECT_QUERY_TYPE = {
  MIDI_NOTE: {
    BY_ID: 'midi-note.by-id',
    INTERSECTING_RANGE: 'midi-note.intersecting-range',
  },
} as const

type ProjectQueryTypeGroup = ValueOf<typeof PROJECT_QUERY_TYPE>

export type ProjectQueryType = ValueOf<ProjectQueryTypeGroup>

interface ProjectQueryBase<Type extends ProjectQueryType> {
  readonly type: Type
  readonly sourceId: MidiSourceId
}

export interface MidiNoteByIdQuery extends ProjectQueryBase<
  typeof PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID
> {
  readonly noteId: NoteId
}

export interface MidiNotesIntersectingRangeQuery extends ProjectQueryBase<
  typeof PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE
> {
  readonly startTick: Tick
  readonly endTick: Tick
  readonly minimumPitch: MidiPitch
  readonly maximumPitch: MidiPitch
}

export type ProjectQuery = MidiNoteByIdQuery | MidiNotesIntersectingRangeQuery

export interface CreateMidiNoteByIdQueryInput {
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
}

export interface CreateMidiNotesIntersectingRangeQueryInput {
  readonly sourceId: MidiSourceId
  readonly startTick: Tick
  readonly endTick: Tick
  readonly minimumPitch: MidiPitch
  readonly maximumPitch: MidiPitch
}

export interface MidiNoteByIdQueryResult {
  readonly queryType: typeof PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID
  readonly modelRevision: ModelRevision
  readonly note: MidiNoteRecord | undefined
}

export interface MidiNotesIntersectingRangeQueryResult {
  readonly queryType: typeof PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE
  readonly modelRevision: ModelRevision
  readonly notes: readonly MidiNoteRecord[]
}

export type ProjectQueryResult = MidiNoteByIdQueryResult | MidiNotesIntersectingRangeQueryResult

export type ProjectQueryResultFor<Query extends ProjectQuery> = Query extends MidiNoteByIdQuery
  ? MidiNoteByIdQueryResult
  : Query extends MidiNotesIntersectingRangeQuery
    ? MidiNotesIntersectingRangeQueryResult
    : never

export function createMidiNoteByIdQuery(input: CreateMidiNoteByIdQueryInput): MidiNoteByIdQuery {
  return Object.freeze({
    type: PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID,
    sourceId: parseMidiSourceId(input.sourceId),
    noteId: parseNoteId(input.noteId),
  })
}

export function createMidiNotesIntersectingRangeQuery(
  input: CreateMidiNotesIntersectingRangeQueryInput,
): MidiNotesIntersectingRangeQuery {
  const sourceId = parseMidiSourceId(input.sourceId)
  const startTick = parseTick(input.startTick)
  const endTick = parseTick(input.endTick)
  const minimumPitch = parseMidiPitch(input.minimumPitch)
  const maximumPitch = parseMidiPitch(input.maximumPitch)

  if (endTick <= startTick) {
    throw new ProjectQueryError(
      'invalid-tick-range',
      'MIDI Note range Query requires endTick to be greater than startTick',
      { queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE, startTick, endTick },
    )
  }

  if (maximumPitch < minimumPitch) {
    throw new ProjectQueryError(
      'invalid-pitch-range',
      'MIDI Note range Query requires maximumPitch to be greater than or equal to minimumPitch',
      {
        queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE,
        minimumPitch,
        maximumPitch,
      },
    )
  }

  return Object.freeze({
    type: PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE,
    sourceId,
    startTick,
    endTick,
    minimumPitch,
    maximumPitch,
  })
}

function rejectUnknownQuery(query: never): never {
  const type = (query as { readonly type?: unknown }).type

  throw new ProjectQueryError(
    'unknown-query-type',
    `ProjectQuery has an unknown type: ${String(type)}`,
    { queryType: String(type) },
  )
}

/** @internal Revalidates structurally supplied queries before they read model state. */
export function normalizeProjectQuery(query: ProjectQuery): ProjectQuery {
  switch (query.type) {
    case PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID:
      return createMidiNoteByIdQuery(query)
    case PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE:
      return createMidiNotesIntersectingRangeQuery(query)
    default:
      return rejectUnknownQuery(query)
  }
}

/** @internal Creates a frozen single-entity result at one authoritative revision. */
export function createMidiNoteByIdQueryResult(
  modelRevision: ModelRevision,
  note: MidiNoteRecord | undefined,
): MidiNoteByIdQueryResult {
  return Object.freeze({
    queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID,
    modelRevision,
    note,
  })
}

/** @internal Copies and freezes a range result without cloning immutable domain Records. */
export function createMidiNotesIntersectingRangeQueryResult(
  modelRevision: ModelRevision,
  notes: readonly MidiNoteRecord[],
): MidiNotesIntersectingRangeQueryResult {
  return Object.freeze({
    queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE,
    modelRevision,
    notes: Object.freeze([...notes]),
  })
}
