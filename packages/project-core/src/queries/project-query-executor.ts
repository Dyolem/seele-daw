import type { ModelStoreReader } from '@/model/model-store'
import {
  compareMidiNotesForQuery,
  midiNoteIntersectsQuery,
} from '@/queries/midi-note-query-semantics'
import {
  PROJECT_QUERY_TYPE,
  createMidiNoteByIdQueryResult,
  createMidiNotesIntersectingRangeQueryResult,
  normalizeProjectQuery,
  type ProjectQuery,
  type ProjectQueryResult,
  type ProjectQueryResultFor,
} from '@/queries/project-query'

function rejectUnhandledQuery(query: never): never {
  throw new Error(`Unhandled normalized ProjectQuery: ${String((query as ProjectQuery).type)}`)
}

/**
 * Correctness-first execution path used when an internal index is stale and as
 * the full-scan oracle for rebuild and incremental-index verification.
 */
function executeNormalizedProjectQueryByScan(
  reader: ModelStoreReader,
  query: ProjectQuery,
): ProjectQueryResult {
  switch (query.type) {
    case PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID:
      return createMidiNoteByIdQueryResult(
        reader.modelRevision,
        reader.getMidiNote(query.sourceId, query.noteId),
      )

    case PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE: {
      const notes = []

      for (const [, note] of reader.midiNoteEntries(query.sourceId)) {
        if (midiNoteIntersectsQuery(note, query)) notes.push(note)
      }

      notes.sort(compareMidiNotesForQuery)

      return createMidiNotesIntersectingRangeQueryResult(reader.modelRevision, notes)
    }

    default:
      return rejectUnhandledQuery(query)
  }
}

export function executeProjectQueryByScan<Query extends ProjectQuery>(
  reader: ModelStoreReader,
  query: Query,
): ProjectQueryResultFor<Query> {
  const normalizedQuery = normalizeProjectQuery(query)

  return executeNormalizedProjectQueryByScan(
    reader,
    normalizedQuery,
  ) as ProjectQueryResultFor<Query>
}
