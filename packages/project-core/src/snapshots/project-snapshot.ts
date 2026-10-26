import type { MasterChannelRecord } from '#internal/model/channel'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'
import type { ProjectChange } from '#internal/mutation/project-change'
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

function compareById(left: StoredRecord, right: StoredRecord): number {
  return compareStrings(left.id, right.id)
}

function compareByTick(left: TimelineRecord, right: TimelineRecord): number {
  return left.tick - right.tick || compareStrings(left.id, right.id)
}

function copySorted<RecordType>(
  entries: Iterable<readonly [string, RecordType]>,
  compare: (left: RecordType, right: RecordType) => number,
): readonly RecordType[] {
  const records = Array.from(entries, ([, record]) => record)
  records.sort(compare)
  return Object.freeze(records)
}

function copySortedRecords<RecordType extends StoredRecord>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly RecordType[] {
  return copySorted(entries, compareById)
}

function copySortedTimelineRecords<RecordType extends TimelineRecord>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly RecordType[] {
  return copySorted(entries, compareByTick)
}

/** @internal Freezes partitions into a prototype-free object, in the order given. */
export function freezePartitions<RecordType>(
  partitions: Iterable<readonly [MidiSourceId, readonly RecordType[]]>,
): MidiSourcePartitions<RecordType> {
  const frozen = Object.create(null) as Record<MidiSourceId, readonly RecordType[]>
  for (const [sourceId, records] of partitions) frozen[sourceId] = records
  return Object.freeze(frozen)
}

/** The records of one partition written since the last Snapshot, or `all` when it was replaced. */
type WrittenRecords = ReadonlySet<string> | 'all'

/** What commits since a Snapshot touched: whole tables, and records of partitions by MIDI Source. */
interface TouchedParts {
  readonly tables: ReadonlySet<string>
  readonly partitions: ReadonlyMap<string, ReadonlyMap<MidiSourceId, WrittenRecords>>
}

const NO_SOURCES: ReadonlyMap<MidiSourceId, WrittenRecords> = new Map()

/**
 * The previous partition with its written records replaced, removed or added, still in order.
 * Sorting only the written records and merging them in costs one pass, not a sort of the whole.
 */
function mergeWrittenRecords<RecordType extends StoredRecord>(
  previous: readonly RecordType[],
  writtenIds: ReadonlySet<string>,
  read: (id: string) => RecordType | undefined,
  compare: (left: RecordType, right: RecordType) => number,
): readonly RecordType[] {
  const written: RecordType[] = []
  for (const id of writtenIds) {
    const record = read(id)
    if (record !== undefined) written.push(record)
  }
  written.sort(compare)

  const merged: RecordType[] = []
  let next = 0
  for (const record of previous) {
    if (writtenIds.has(record.id)) continue
    while (next < written.length && compare(written[next]!, record) < 0)
      merged.push(written[next++]!)
    merged.push(record)
  }
  while (next < written.length) merged.push(written[next++]!)
  return Object.freeze(merged)
}

function copyPartitions<RecordType extends StoredRecord>(
  table: PartitionedTableView<RecordType>,
  compare: (left: RecordType, right: RecordType) => number,
  previous: MidiSourcePartitions<RecordType> | null,
  touched: ReadonlyMap<MidiSourceId, WrittenRecords>,
): MidiSourcePartitions<RecordType> {
  if (previous !== null && touched.size === 0) return previous
  return freezePartitions(
    [...table.partitionIds()].sort(compareStrings).map((sourceId) => {
      const records = previous?.[sourceId]
      const written = touched.get(sourceId)
      if (records === undefined || written === 'all') {
        return [sourceId, copySorted(table.entries(sourceId), compare)] as const
      }
      if (written === undefined) return [sourceId, records] as const
      return [
        sourceId,
        mergeWrittenRecords(records, written, (id) => table.get(sourceId, id), compare),
      ] as const
    }),
  )
}

/**
 * Copies the Store's tables; records are shared, containers are frozen. Given the previous
 * Snapshot and what was touched since, the untouched tables and partitions are the previous ones,
 * so an unchanged part keeps its identity from one revision to the next.
 */
function createProjectSnapshot(
  reader: ModelStoreReader,
  previous: ProjectSnapshot | null,
  touched: TouchedParts,
): ProjectSnapshot {
  function part<Part>(name: string, previousPart: Part | undefined, copy: () => Part): Part {
    return previousPart === undefined || touched.tables.has(name) ? copy() : previousPart
  }
  return Object.freeze({
    modelRevision: reader.modelRevision,
    project: reader.project,
    master: reader.master,
    trackOrder: part('trackOrder', previous?.trackOrder, () =>
      Object.freeze([...reader.orderedTrackIds()]),
    ),
    tracks: part('tracks', previous?.tracks, () => copySortedRecords(reader.trackEntries())),
    clips: part('clips', previous?.clips, () => copySortedRecords(reader.clipEntries())),
    midiSources: part('midiSources', previous?.midiSources, () =>
      copySortedRecords(reader.midiSourceEntries()),
    ),
    tempoEvents: part('tempoEvents', previous?.tempoEvents, () =>
      copySortedTimelineRecords(reader.tempoEventEntries()),
    ),
    timeSignatureEvents: part('timeSignatureEvents', previous?.timeSignatureEvents, () =>
      copySortedTimelineRecords(reader.timeSignatureEventEntries()),
    ),
    devices: part('devices', previous?.devices, () => copySortedRecords(reader.deviceEntries())),
    midiNotes: copyPartitions(
      reader.partitionedTable('midiNotes'),
      compareById,
      previous?.midiNotes ?? null,
      touched.partitions.get('midiNotes') ?? NO_SOURCES,
    ),
    midiSustainPedalEvents: copyPartitions(
      reader.partitionedTable('midiSustainPedalEvents'),
      compareByTick,
      previous?.midiSustainPedalEvents ?? null,
      touched.partitions.get('midiSustainPedalEvents') ?? NO_SOURCES,
    ),
  })
}

/**
 * @internal The Session's Snapshots. It remembers what each commit touched until the next
 * Snapshot is read, so that Snapshot copies only those parts and shares the rest. Inside a
 * partition it remembers the written records, so a large partition is merged, not re-sorted.
 */
export class ProjectSnapshots {
  #snapshot: ProjectSnapshot | null = null
  readonly #tables = new Set<string>()
  readonly #partitions = new Map<string, Map<MidiSourceId, Set<string> | 'all'>>()

  noteChanges(changes: readonly ProjectChange[]): void {
    if (this.#snapshot === null) return
    for (const change of changes) {
      if (!('sourceId' in change)) {
        this.#tables.add(change.table)
        continue
      }
      let sources = this.#partitions.get(change.table)
      if (sources === undefined) this.#partitions.set(change.table, (sources = new Map()))
      if (change.op === 'insert-partition' || change.op === 'remove-partition') {
        sources.set(change.sourceId, 'all')
        continue
      }
      const written = sources.get(change.sourceId)
      if (written === 'all') continue
      const ids = written ?? new Set<string>()
      ids.add(change.op === 'insert' ? change.after.id : change.before.id)
      sources.set(change.sourceId, ids)
    }
  }

  read(reader: ModelStoreReader): ProjectSnapshot {
    // Snapshots are immutable and only a committed revision changes Store content.
    if (this.#snapshot?.modelRevision === reader.modelRevision) return this.#snapshot
    const snapshot = createProjectSnapshot(reader, this.#snapshot, {
      partitions: this.#partitions,
      tables: this.#tables,
    })
    this.#snapshot = snapshot
    this.#tables.clear()
    this.#partitions.clear()
    return snapshot
  }
}
