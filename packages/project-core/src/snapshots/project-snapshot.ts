import type { MasterChannelRecord } from '#internal/model/channel'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'
import type {
  PartitionedRecordOf,
  PartitionedTableName,
  PartitionedTableView,
  RecordOf,
  RecordTableName,
  StoredRecord,
} from '#internal/model/model-tables'
import type { ProjectRecord } from '#internal/model/project'
import type { Tick } from '#internal/time/tick'

interface TimelineRecord extends StoredRecord {
  readonly tick: Tick
}

/** Each MIDI Source's records, keyed by its ID. The object has no prototype, so any ID is safe. */
export type MidiSourcePartitions<RecordType> = Readonly<Record<MidiSourceId, readonly RecordType[]>>

/**
 * The project's tables as a Snapshot holds them and a project file stores them. Record tables
 * are arrays in canonical order: by ID, or by Tick for timeline events.
 */
export type ProjectTables = {
  readonly project: ProjectRecord
  readonly master: MasterChannelRecord
  readonly trackOrder: readonly TrackId[]
} & { readonly [Name in RecordTableName]: readonly RecordOf<Name>[] } & {
  readonly [Name in PartitionedTableName]: MidiSourcePartitions<PartitionedRecordOf<Name>>
}

/** Every project fact at one ModelStore revision. */
export type ProjectSnapshot = ProjectTables & { readonly modelRevision: ModelRevision }

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function copySortedRecords<RecordType extends StoredRecord>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly RecordType[] {
  const records = Array.from(entries, ([, record]) => record)
  records.sort((left, right) => compareStrings(left.id, right.id))
  return Object.freeze(records)
}

function copySortedTimelineRecords<RecordType extends TimelineRecord>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly RecordType[] {
  const records = Array.from(entries, ([, record]) => record)
  records.sort((left, right) => left.tick - right.tick || compareStrings(left.id, right.id))
  return Object.freeze(records)
}

/** @internal Freezes partitions into a prototype-free object, in the order given. */
export function freezePartitions<RecordType>(
  partitions: Iterable<readonly [MidiSourceId, readonly RecordType[]]>,
): MidiSourcePartitions<RecordType> {
  const frozen = Object.create(null) as Record<MidiSourceId, readonly RecordType[]>
  for (const [sourceId, records] of partitions) frozen[sourceId] = records
  return Object.freeze(frozen)
}

function copyPartitions<RecordType extends StoredRecord>(
  table: PartitionedTableView<RecordType>,
  copyRecords: (entries: Iterable<readonly [string, RecordType]>) => readonly RecordType[],
): MidiSourcePartitions<RecordType> {
  return freezePartitions(
    [...table.partitionIds()]
      .sort(compareStrings)
      .map((sourceId) => [sourceId, copyRecords(table.entries(sourceId))] as const),
  )
}

/** @internal Copies the Store's tables once; records are shared, containers are frozen. */
export function createProjectSnapshot(reader: ModelStoreReader): ProjectSnapshot {
  return Object.freeze({
    modelRevision: reader.modelRevision,
    project: reader.project,
    master: reader.master,
    trackOrder: Object.freeze([...reader.orderedTrackIds()]),
    tracks: copySortedRecords(reader.trackEntries()),
    clips: copySortedRecords(reader.clipEntries()),
    midiSources: copySortedRecords(reader.midiSourceEntries()),
    tempoEvents: copySortedTimelineRecords(reader.tempoEventEntries()),
    timeSignatureEvents: copySortedTimelineRecords(reader.timeSignatureEventEntries()),
    devices: copySortedRecords(reader.deviceEntries()),
    midiNotes: copyPartitions(reader.partitionedTable('midiNotes'), copySortedRecords),
    midiSustainPedalEvents: copyPartitions(
      reader.partitionedTable('midiSustainPedalEvents'),
      copySortedTimelineRecords,
    ),
  })
}
