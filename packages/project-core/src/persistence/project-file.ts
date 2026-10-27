import { parseMidiSourceId, parseTrackId } from '#internal/model/ids'
import {
  mapTables,
  PARTITIONED_TABLE_NAMES,
  RECORD_TABLE_NAMES,
  type PartitionedTableName,
  type RecordTableName,
} from '#internal/model/model-tables'
import {
  freezePartitions,
  type MidiSourcePartitions,
  type ProjectSnapshot,
  type ProjectTables,
} from '#internal/snapshots/project-snapshot'
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

/** A project as stored or exported: a Snapshot's tables, without revision, History or indexes. */
export type ProjectFile = ProjectTables & {
  readonly formatVersion: typeof PROJECT_FILE_FORMAT_VERSION
}

const PROJECT_FILE: Fields<ProjectFile> = {
  formatVersion: true,
  project: true,
  master: true,
  trackOrder: true,
  ...mapTables(RECORD_TABLE_NAMES, () => true as const),
  ...mapTables(PARTITIONED_TABLE_NAMES, () => true as const),
}

/** Writes a Snapshot without its revision; its tables are shared, nothing is copied. */
export function createProjectFile(snapshot: ProjectSnapshot): ProjectFile {
  const { modelRevision: _revision, ...tables } = snapshot
  return Object.freeze({ formatVersion: PROJECT_FILE_FORMAT_VERSION, ...tables })
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
): MidiSourcePartitions<RecordType> {
  return freezePartitions(
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
