import type { MidiSourceId } from '#internal/model/ids'
import { assertModelInvariants, ModelInvariantError } from '#internal/model/invariant-validator'
import { ModelStore } from '#internal/model/model-store'
import type { StoredRecord } from '#internal/model/model-tables'
import { createProjectSession, type ProjectSession } from '#internal/session/project-session'
import { decodeProjectFile, type ProjectFile } from './project-file'
import { rejectData, type DataPath } from './stored-data'

function indexById<RecordType extends StoredRecord>(
  records: readonly RecordType[],
  path: DataPath,
): Map<RecordType['id'], RecordType> {
  const indexed = new Map<RecordType['id'], RecordType>()

  records.forEach((record, index) => {
    if (indexed.has(record.id)) {
      rejectData(`Duplicate ID ${JSON.stringify(record.id)}`, [...path, index])
    }

    indexed.set(record.id, record)
  })

  return indexed
}

function indexPartitions<RecordType extends StoredRecord>(
  partitions: Readonly<Record<string, readonly RecordType[]>>,
  path: DataPath,
): Map<MidiSourceId, Map<RecordType['id'], RecordType>> {
  return new Map(
    Object.entries(partitions).map(([sourceId, records]) => [
      sourceId as MidiSourceId,
      indexById(records, [...path, sourceId]),
    ]),
  )
}

/** @internal Builds a fresh Session from an already decoded file, e.g. one inside a Checkpoint. */
export function createSessionFromProjectFile(file: ProjectFile): ProjectSession {
  const store = new ModelStore({
    project: file.project,
    master: file.master,
    trackOrder: file.trackOrder,
    tracks: indexById(file.tracks, ['tracks']),
    clips: indexById(file.clips, ['clips']),
    midiSources: indexById(file.midiSources, ['midiSources']),
    tempoEvents: indexById(file.tempoEvents, ['tempoEvents']),
    timeSignatureEvents: indexById(file.timeSignatureEvents, ['timeSignatureEvents']),
    devices: indexById(file.devices, ['devices']),
    midiNotes: indexPartitions(file.midiNotes, ['midiNotes']),
    midiSustainPedalEvents: indexPartitions(file.midiSustainPedalEvents, [
      'midiSustainPedalEvents',
    ]),
  })

  try {
    assertModelInvariants(store)
  } catch (error) {
    if (!(error instanceof ModelInvariantError)) throw error
    rejectData('The file does not form a valid project', [], error)
  }

  return createProjectSession(store)
}

/** Creates a fresh Session, at revision 0 with empty History, from untrusted file data. */
export function createProjectSessionFromProjectFile(input: unknown): ProjectSession {
  return createSessionFromProjectFile(decodeProjectFile(input))
}
