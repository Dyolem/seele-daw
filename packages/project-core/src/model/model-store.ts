import type { MasterChannelRecord } from './channel'
import type { DeviceDescriptor } from './device'
import type {
  ClipId,
  DeviceId,
  MidiSourceId,
  MidiSustainPedalEventId,
  NoteId,
  TempoEventId,
  TimeSignatureEventId,
  TrackId,
} from './ids'
import type { ClipRecord } from './midi-clip'
import type { MidiNoteRecord } from './midi-note'
import type { MidiSourceRecord } from './midi-source'
import type { MidiSustainPedalEventRecord } from './midi-sustain-pedal-event'
import { INITIAL_MODEL_REVISION, nextModelRevision, type ModelRevision } from './model-revision'
import {
  ModelStoreWriteAccessError,
  registerModelStoreWriteAccess,
} from './model-store-write-access'
import {
  PARTITIONED_TABLES,
  PARTITIONED_TABLE_NAMES,
  RECORD_TABLES,
  RECORD_TABLE_NAMES,
  mapTables,
  type PartitionedTableName,
  type PartitionedTableSeeds,
  type PartitionedTableView,
  type PartitionedTableViews,
  type RecordTableName,
  type RecordTableSeeds,
  type RecordTableView,
  type RecordTableViews,
  type StoredRecord,
} from './model-tables'
import type { ProjectRecord } from './project'
import type { TrackRecord } from './track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'

type RecordContainer = Map<string, StoredRecord>
type PartitionedContainer = Map<MidiSourceId, RecordContainer>

function rejectStoreWrite(detail: string): never {
  throw new ModelStoreWriteAccessError('write-precondition-failed', detail)
}

/**
 * Performs an entity-table compare-and-swap without exposing the table itself.
 * All checks finish before the single set/delete that changes authoritative state.
 */
function writeEntityRecord(
  table: RecordContainer,
  entityName: string,
  expected: StoredRecord | undefined,
  next: StoredRecord | undefined,
): void {
  if (expected === undefined && next === undefined) {
    rejectStoreWrite(`${entityName} write requires an expected or next record`)
  }

  if (expected !== undefined && next !== undefined && expected.id !== next.id) {
    rejectStoreWrite(`${entityName} write cannot change record identity`)
  }

  const id = expected?.id ?? next?.id

  if (id === undefined) {
    rejectStoreWrite(`${entityName} write could not resolve a record identity`)
  }

  const current = table.get(id)

  if (expected === undefined) {
    if (current !== undefined) {
      rejectStoreWrite(`${entityName} ${id} already exists`)
    }
  } else if (current !== expected) {
    rejectStoreWrite(`${entityName} ${id} no longer matches the expected record`)
  }

  if (next === undefined) {
    table.delete(id)
  } else {
    table.set(id, next)
  }
}

function partitionMatches(table: RecordContainer, expected: readonly StoredRecord[]): boolean {
  if (table.size !== expected.length) return false
  const expectedById = new Map(expected.map((record) => [record.id, record] as const))
  if (expectedById.size !== expected.length) return false
  for (const [id, record] of table) {
    if (expectedById.get(id) !== record) return false
  }
  return true
}

/** Writes to records partitioned by MIDI Source, such as Notes or CC64 events. */
function partitionWriter(partitions: PartitionedContainer, entity: string, idLabel: string) {
  function requirePartition(sourceId: MidiSourceId): RecordContainer {
    const table = partitions.get(sourceId)
    if (table === undefined) rejectStoreWrite(`${entity} partition ${sourceId} does not exist`)
    return table
  }

  return {
    insert(sourceId: MidiSourceId, records: readonly StoredRecord[]): void {
      if (partitions.has(sourceId))
        rejectStoreWrite(`${entity} partition ${sourceId} already exists`)
      // Build first so duplicate IDs or allocation failures cannot leave a partial partition.
      const table: RecordContainer = new Map()
      for (const record of records) {
        if (table.has(record.id)) {
          rejectStoreWrite(`${entity} partition contains duplicate ${idLabel} ${record.id}`)
        }
        table.set(record.id, record)
      }
      partitions.set(sourceId, table)
    },
    remove(sourceId: MidiSourceId, expected: readonly StoredRecord[]): void {
      if (!partitionMatches(requirePartition(sourceId), expected)) {
        rejectStoreWrite(`${entity} partition ${sourceId} no longer matches the expected records`)
      }
      partitions.delete(sourceId)
    },
    write(
      sourceId: MidiSourceId,
      expected: StoredRecord | undefined,
      next: StoredRecord | undefined,
    ) {
      writeEntityRecord(
        requirePartition(sourceId),
        `${entity} in partition ${sourceId}`,
        expected,
        next,
      )
    },
  }
}

/** Read-only facades, so no reader can reach a mutable container. */
function recordView(table: RecordContainer): RecordTableView<StoredRecord> {
  return Object.freeze({
    get: (id: string) => table.get(id),
    entries: () => table.entries(),
  })
}

function partitionedView(partitions: PartitionedContainer): PartitionedTableView<StoredRecord> {
  return Object.freeze({
    has: (sourceId: MidiSourceId) => partitions.has(sourceId),
    partitionIds: () => partitions.keys(),
    get: (sourceId: MidiSourceId, id: string) => partitions.get(sourceId)?.get(id),
    *entries(sourceId: MidiSourceId) {
      const table = partitions.get(sourceId)
      if (table !== undefined) yield* table.entries()
    },
  })
}

export interface ModelStoreSeed extends RecordTableSeeds, PartitionedTableSeeds {
  readonly project: ProjectRecord
  readonly trackOrder: readonly TrackId[]
  readonly master: MasterChannelRecord
}

/**
 * Read access to project facts, shared by the ModelStore and its projections. Subclasses supply
 * the singletons, the Track order and the tables; the typed accessors are written once here.
 */
export abstract class ModelStoreReader {
  abstract get modelRevision(): ModelRevision
  abstract get project(): ProjectRecord
  abstract get master(): MasterChannelRecord

  abstract orderedTrackIds(): IterableIterator<TrackId>
  abstract recordTable<Name extends RecordTableName>(name: Name): RecordTableViews[Name]
  abstract partitionedTable<Name extends PartitionedTableName>(
    name: Name,
  ): PartitionedTableViews[Name]

  getTrack(id: TrackId): TrackRecord | undefined {
    return this.recordTable('tracks').get(id)
  }

  trackEntries(): IterableIterator<readonly [TrackId, TrackRecord]> {
    return this.recordTable('tracks').entries()
  }

  getClip(id: ClipId): ClipRecord | undefined {
    return this.recordTable('clips').get(id)
  }

  clipEntries(): IterableIterator<readonly [ClipId, ClipRecord]> {
    return this.recordTable('clips').entries()
  }

  getMidiSource(id: MidiSourceId): MidiSourceRecord | undefined {
    return this.recordTable('midiSources').get(id)
  }

  midiSourceEntries(): IterableIterator<readonly [MidiSourceId, MidiSourceRecord]> {
    return this.recordTable('midiSources').entries()
  }

  hasMidiNotePartition(sourceId: MidiSourceId): boolean {
    return this.partitionedTable('midiNotesBySource').has(sourceId)
  }

  midiNotePartitionIds(): IterableIterator<MidiSourceId> {
    return this.partitionedTable('midiNotesBySource').partitionIds()
  }

  getMidiNote(sourceId: MidiSourceId, noteId: NoteId): MidiNoteRecord | undefined {
    return this.partitionedTable('midiNotesBySource').get(sourceId, noteId)
  }

  midiNoteEntries(sourceId: MidiSourceId): IterableIterator<readonly [NoteId, MidiNoteRecord]> {
    return this.partitionedTable('midiNotesBySource').entries(sourceId)
  }

  hasMidiSustainPedalEventPartition(sourceId: MidiSourceId): boolean {
    return this.partitionedTable('midiSustainPedalEventsBySource').has(sourceId)
  }

  midiSustainPedalEventPartitionIds(): IterableIterator<MidiSourceId> {
    return this.partitionedTable('midiSustainPedalEventsBySource').partitionIds()
  }

  getMidiSustainPedalEvent(
    sourceId: MidiSourceId,
    eventId: MidiSustainPedalEventId,
  ): MidiSustainPedalEventRecord | undefined {
    return this.partitionedTable('midiSustainPedalEventsBySource').get(sourceId, eventId)
  }

  midiSustainPedalEventEntries(
    sourceId: MidiSourceId,
  ): IterableIterator<readonly [MidiSustainPedalEventId, MidiSustainPedalEventRecord]> {
    return this.partitionedTable('midiSustainPedalEventsBySource').entries(sourceId)
  }

  getTempoEvent(id: TempoEventId): TempoEventRecord | undefined {
    return this.recordTable('tempoEvents').get(id)
  }

  tempoEventEntries(): IterableIterator<readonly [TempoEventId, TempoEventRecord]> {
    return this.recordTable('tempoEvents').entries()
  }

  getTimeSignatureEvent(id: TimeSignatureEventId): TimeSignatureEventRecord | undefined {
    return this.recordTable('timeSignatureEvents').get(id)
  }

  timeSignatureEventEntries(): IterableIterator<
    readonly [TimeSignatureEventId, TimeSignatureEventRecord]
  > {
    return this.recordTable('timeSignatureEvents').entries()
  }

  getDevice(id: DeviceId): DeviceDescriptor | undefined {
    return this.recordTable('devices').get(id)
  }

  deviceEntries(): IterableIterator<readonly [DeviceId, DeviceDescriptor]> {
    return this.recordTable('devices').entries()
  }
}

export class ModelStore extends ModelStoreReader {
  #modelRevision: ModelRevision
  #project: ProjectRecord
  #master: MasterChannelRecord
  readonly #trackOrder: TrackId[]
  readonly #recordViews: RecordTableViews
  readonly #partitionedViews: PartitionedTableViews

  constructor(seed: ModelStoreSeed) {
    super()
    this.#modelRevision = INITIAL_MODEL_REVISION
    this.#project = seed.project
    this.#trackOrder = [...seed.trackOrder]
    this.#master = seed.master

    const records = mapTables(
      RECORD_TABLE_NAMES,
      (name) => new Map<string, StoredRecord>(seed[name]),
    )
    const partitions = mapTables(PARTITIONED_TABLE_NAMES, (name) => {
      const table: PartitionedContainer = new Map()
      for (const [sourceId, partition] of seed[name]) {
        table.set(sourceId, new Map<string, StoredRecord>(partition))
      }
      return table
    })
    const partitionWriters = mapTables(PARTITIONED_TABLE_NAMES, (name) =>
      partitionWriter(
        partitions[name],
        PARTITIONED_TABLES[name].entity,
        PARTITIONED_TABLES[name].idLabel,
      ),
    )

    // Each container is seeded from, and only ever written with, records of its own table.
    this.#recordViews = mapTables(RECORD_TABLE_NAMES, (name) =>
      recordView(records[name]),
    ) as RecordTableViews
    this.#partitionedViews = mapTables(PARTITIONED_TABLE_NAMES, (name) =>
      partitionedView(partitions[name]),
    ) as PartitionedTableViews

    // The closures keep the containers private while the registry hands them to one applier.
    registerModelStoreWriteAccess(this, {
      writeProject: (expected, next) => {
        if (this.#project !== expected) {
          rejectStoreWrite('Project no longer matches the expected record')
        }

        this.#project = next
      },
      writeMaster: (expected, next) => {
        if (this.#master !== expected) {
          rejectStoreWrite('Master Channel no longer matches the expected record')
        }

        this.#master = next
      },
      writeRecord: (table, expected, next) => {
        writeEntityRecord(records[table], RECORD_TABLES[table].entity, expected, next)
      },
      insertTrackOrder: (index, trackId) => {
        if (!Number.isSafeInteger(index) || index < 0 || index > this.#trackOrder.length) {
          rejectStoreWrite(
            `Cannot insert Track ${trackId} at index ${index} for length ${this.#trackOrder.length}`,
          )
        }

        this.#trackOrder.splice(index, 0, trackId)
      },
      removeTrackOrder: (index, trackId) => {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.#trackOrder.length) {
          rejectStoreWrite(
            `Cannot remove Track ${trackId} at index ${index} for length ${this.#trackOrder.length}`,
          )
        }

        if (this.#trackOrder[index] !== trackId) {
          rejectStoreWrite(
            `Track order index ${index} no longer contains the expected Track ${trackId}`,
          )
        }

        this.#trackOrder.splice(index, 1)
      },
      insertPartition: (table, sourceId, partitionRecords) => {
        partitionWriters[table].insert(sourceId, partitionRecords)
      },
      removePartition: (table, sourceId, expected) => {
        partitionWriters[table].remove(sourceId, expected)
      },
      writePartitionRecord: (table, sourceId, expected, next) => {
        partitionWriters[table].write(sourceId, expected, next)
      },
      commitModelRevision: (expected, next) => {
        if (this.#modelRevision !== expected) {
          rejectStoreWrite(
            `Model revision ${this.#modelRevision} no longer matches expected revision ${expected}`,
          )
        }

        if (nextModelRevision(expected) !== next) {
          rejectStoreWrite(`Model revision must advance exactly once from ${expected} to ${next}`)
        }

        // This assignment is deliberately the last state change in a successful transaction.
        this.#modelRevision = next
      },
    })
  }

  get modelRevision(): ModelRevision {
    return this.#modelRevision
  }

  get project(): ProjectRecord {
    return this.#project
  }

  get master(): MasterChannelRecord {
    return this.#master
  }

  orderedTrackIds(): IterableIterator<TrackId> {
    return this.#trackOrder.values()
  }

  recordTable<Name extends RecordTableName>(name: Name): RecordTableViews[Name] {
    return this.#recordViews[name]
  }

  partitionedTable<Name extends PartitionedTableName>(name: Name): PartitionedTableViews[Name] {
    return this.#partitionedViews[name]
  }
}
