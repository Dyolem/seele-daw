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

/** What commits since a Snapshot touched: whole tables, and single partitions by MIDI Source. */
interface TouchedParts {
  readonly tables: ReadonlySet<string>
  readonly partitions: ReadonlyMap<string, ReadonlySet<MidiSourceId>>
}

const NO_SOURCES: ReadonlySet<MidiSourceId> = new Set()

function copyPartitions<RecordType extends StoredRecord>(
  table: PartitionedTableView<RecordType>,
  copyRecords: (entries: Iterable<readonly [string, RecordType]>) => readonly RecordType[],
  previous: MidiSourcePartitions<RecordType> | null,
  touched: ReadonlySet<MidiSourceId>,
): MidiSourcePartitions<RecordType> {
  if (previous !== null && touched.size === 0) return previous
  return freezePartitions(
    [...table.partitionIds()].sort(compareStrings).map((sourceId) => {
      const shared = previous === null || touched.has(sourceId) ? undefined : previous[sourceId]
      return [sourceId, shared ?? copyRecords(table.entries(sourceId))] as const
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
      copySortedRecords,
      previous?.midiNotes ?? null,
      touched.partitions.get('midiNotes') ?? NO_SOURCES,
    ),
    midiSustainPedalEvents: copyPartitions(
      reader.partitionedTable('midiSustainPedalEvents'),
      copySortedTimelineRecords,
      previous?.midiSustainPedalEvents ?? null,
      touched.partitions.get('midiSustainPedalEvents') ?? NO_SOURCES,
    ),
  })
}

/**
 * @internal The Session's Snapshots. It remembers what each commit touched until the next
 * Snapshot is read, so that Snapshot copies only those parts and shares the rest.
 */
export class ProjectSnapshots {
  #snapshot: ProjectSnapshot | null = null
  readonly #tables = new Set<string>()
  readonly #partitions = new Map<string, Set<MidiSourceId>>()

  noteChanges(changes: readonly ProjectChange[]): void {
    if (this.#snapshot === null) return
    for (const change of changes) {
      if (!('sourceId' in change)) {
        this.#tables.add(change.table)
        continue
      }
      let sources = this.#partitions.get(change.table)
      if (sources === undefined) this.#partitions.set(change.table, (sources = new Set()))
      sources.add(change.sourceId)
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
