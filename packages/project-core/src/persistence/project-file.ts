import type { MasterChannelRecord } from '#internal/model/channel'
import {
  parseMidiSourceId,
  parseTrackId,
  type MidiSourceId,
  type TrackId,
} from '#internal/model/ids'
import {
  mapTables,
  PARTITIONED_TABLE_NAMES,
  RECORD_TABLE_NAMES,
  type PartitionedRecordOf,
  type PartitionedTableName,
  type RecordOf,
  type RecordTableName,
} from '#internal/model/model-tables'
import type { ProjectRecord } from '#internal/model/project'
import type { ProjectSnapshot } from '#internal/snapshots/project-snapshot'
import {
  decodeMaster,
  decodeProject,
  PARTITIONED_RECORD_DECODERS,
  RECORD_DECODERS,
  type RecordDecoder,
} from './record-decoders'
import {
  readField,
  readFields,
  readJson,
  readList,
  readObject,
  readValue,
  rejectData,
  type DataPath,
  type Fields,
} from './stored-data'

export const PROJECT_FILE_FORMAT_VERSION = 3

/**
 * A project as stored or exported: the ModelStore's tables holding the same records, without
 * revision, History or indexes. Record tables are arrays; a partitioned table maps each MIDI
 * Source ID to that Source's records.
 */
export type ProjectFile = {
  readonly formatVersion: typeof PROJECT_FILE_FORMAT_VERSION
  readonly project: ProjectRecord
  readonly master: MasterChannelRecord
  readonly trackOrder: readonly TrackId[]
} & { readonly [Name in RecordTableName]: readonly RecordOf<Name>[] } & {
  readonly [Name in PartitionedTableName]: Readonly<
    Record<MidiSourceId, readonly PartitionedRecordOf<Name>[]>
  >
}

const PROJECT_FILE: Fields<ProjectFile> = {
  formatVersion: true,
  project: true,
  master: true,
  trackOrder: true,
  ...mapTables(RECORD_TABLE_NAMES, () => true as const),
  ...mapTables(PARTITIONED_TABLE_NAMES, () => true as const),
}

function byPartition<RecordType>(
  partitions: readonly (readonly [MidiSourceId, readonly RecordType[]])[],
): Readonly<Record<MidiSourceId, readonly RecordType[]>> {
  return Object.freeze(Object.fromEntries(partitions))
}

/** Writes a Snapshot's records as they are; nothing is copied. */
export function createProjectFile(snapshot: ProjectSnapshot): ProjectFile {
  return Object.freeze({
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    project: snapshot.project,
    master: snapshot.master,
    trackOrder: snapshot.trackOrder,
    tracks: snapshot.tracks,
    clips: snapshot.clips,
    midiSources: snapshot.midiSources,
    tempoEvents: snapshot.tempoEvents,
    timeSignatureEvents: snapshot.timeSignatureEvents,
    devices: snapshot.devices,
    midiNotes: byPartition(
      snapshot.midiNotePartitions.map(({ sourceId, notes }) => [sourceId, notes] as const),
    ),
    midiSustainPedalEvents: byPartition(
      snapshot.midiSustainPedalEventPartitions.map(
        ({ sourceId, events }) => [sourceId, events] as const,
      ),
    ),
  })
}

function readRecords<RecordType>(
  value: unknown,
  decode: RecordDecoder<RecordType>,
  path: DataPath,
): readonly RecordType[] {
  return Object.freeze(
    readList(value, path).map((item, index) => {
      const itemPath = [...path, index]
      return readValue(itemPath, () => decode(item, itemPath))
    }),
  )
}

function readPartitions<RecordType>(
  value: unknown,
  decode: RecordDecoder<RecordType>,
  path: DataPath,
): Readonly<Record<MidiSourceId, readonly RecordType[]>> {
  return byPartition(
    Object.entries(readObject(value, path)).map(([sourceId, records]) => [
      readValue([...path, sourceId], () => parseMidiSourceId(sourceId)),
      readRecords(records, decode, [...path, sourceId]),
    ]),
  )
}

/** @internal Reads a project file that is already JSON data, e.g. inside a Checkpoint. */
export function readProjectFile(value: unknown, path: DataPath): ProjectFile {
  const formatVersion = readField(value, 'formatVersion', path)

  if (formatVersion !== PROJECT_FILE_FORMAT_VERSION) {
    rejectData(
      'unsupported-format-version',
      `Expected project file format ${PROJECT_FILE_FORMAT_VERSION}, found ${JSON.stringify(formatVersion)}`,
      [...path, 'formatVersion'],
    )
  }

  const file = readFields(value, PROJECT_FILE, path)
  const at = (field: string): DataPath => [...path, field]
  const records = <Name extends RecordTableName>(name: Name) =>
    readRecords(file[name], RECORD_DECODERS[name], at(name))
  const partitions = <Name extends PartitionedTableName>(name: Name) =>
    readPartitions(file[name], PARTITIONED_RECORD_DECODERS[name], at(name))

  return Object.freeze({
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    project: readValue(at('project'), () => decodeProject(file.project, at('project'))),
    master: readValue(at('master'), () => decodeMaster(file.master, at('master'))),
    trackOrder: Object.freeze(
      readList(file.trackOrder, at('trackOrder')).map((trackId, index) =>
        readValue([...at('trackOrder'), index], () => parseTrackId(trackId)),
      ),
    ),
    tracks: records('tracks'),
    clips: records('clips'),
    midiSources: records('midiSources'),
    tempoEvents: records('tempoEvents'),
    timeSignatureEvents: records('timeSignatureEvents'),
    devices: records('devices'),
    midiNotes: partitions('midiNotes'),
    midiSustainPedalEvents: partitions('midiSustainPedalEvents'),
  })
}

/** Reads untrusted structured data, such as parsed JSON, as a project file. */
export function decodeProjectFile(input: unknown): ProjectFile {
  return readProjectFile(readJson(input), [])
}
