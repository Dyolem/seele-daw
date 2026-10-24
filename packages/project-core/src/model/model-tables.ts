import type { DeviceDescriptor } from './device'
import type { MidiSourceId } from './ids'
import type { ClipRecord } from './midi-clip'
import type { MidiNoteRecord } from './midi-note'
import type { MidiSourceRecord } from './midi-source'
import type { MidiSustainPedalEventRecord } from './midi-sustain-pedal-event'
import type { TrackRecord } from './track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'

/** Every stored record carries its own branded ID. */
export interface StoredRecord {
  readonly id: string
}

export interface RecordTableDefinition<RecordType extends StoredRecord> {
  /** Names the records in errors, e.g. "Time Signature Event". */
  readonly entity: string
  /** Carries the record type; never set at runtime. */
  readonly record?: RecordType
}

export interface PartitionedTableDefinition<
  RecordType extends StoredRecord,
> extends RecordTableDefinition<RecordType> {
  /** Names a record ID inside its partition in errors, e.g. "Note ID". */
  readonly idLabel: string
}

function recordTable<RecordType extends StoredRecord>(
  entity: string,
): RecordTableDefinition<RecordType> {
  return Object.freeze({ entity })
}

function partitionedTable<RecordType extends StoredRecord>(
  entity: string,
  idLabel: string,
): PartitionedTableDefinition<RecordType> {
  return Object.freeze({ entity, idLabel })
}

/**
 * The tables a ModelStore holds besides the Project, the Master Channel and the Track order.
 * Storage, projection and mutation dispatch are written against these definitions, so a new
 * entity table is added here. Names double as the ModelStoreSeed fields.
 */
export const RECORD_TABLES = Object.freeze({
  tracks: recordTable<TrackRecord>('Track'),
  clips: recordTable<ClipRecord>('Clip'),
  midiSources: recordTable<MidiSourceRecord>('MIDI Source'),
  tempoEvents: recordTable<TempoEventRecord>('Tempo Event'),
  timeSignatureEvents: recordTable<TimeSignatureEventRecord>('Time Signature Event'),
  devices: recordTable<DeviceDescriptor>('Device'),
})

/** Records owned by one MIDI Source; a partition exists exactly while its Source does. */
export const PARTITIONED_TABLES = Object.freeze({
  midiNotesBySource: partitionedTable<MidiNoteRecord>('MIDI Note', 'Note ID'),
  midiSustainPedalEventsBySource: partitionedTable<MidiSustainPedalEventRecord>(
    'MIDI Sustain Pedal Event',
    'Event ID',
  ),
})

export type RecordTableName = keyof typeof RECORD_TABLES
export type PartitionedTableName = keyof typeof PARTITIONED_TABLES

export type RecordOf<Name extends RecordTableName> = NonNullable<
  (typeof RECORD_TABLES)[Name]['record']
>
export type PartitionedRecordOf<Name extends PartitionedTableName> = NonNullable<
  (typeof PARTITIONED_TABLES)[Name]['record']
>

export const RECORD_TABLE_NAMES = Object.freeze(Object.keys(RECORD_TABLES) as RecordTableName[])
export const PARTITIONED_TABLE_NAMES = Object.freeze(
  Object.keys(PARTITIONED_TABLES) as PartitionedTableName[],
)

/** Read access to one table of records keyed by their own ID. */
export interface RecordTableView<RecordType extends StoredRecord> {
  get(id: RecordType['id']): RecordType | undefined
  entries(): IterableIterator<readonly [RecordType['id'], RecordType]>
}

/** Read access to one table of records partitioned by MIDI Source. */
export interface PartitionedTableView<RecordType extends StoredRecord> {
  has(sourceId: MidiSourceId): boolean
  partitionIds(): IterableIterator<MidiSourceId>
  get(sourceId: MidiSourceId, id: RecordType['id']): RecordType | undefined
  entries(sourceId: MidiSourceId): IterableIterator<readonly [RecordType['id'], RecordType]>
}

export type RecordTableViews = {
  readonly [Name in RecordTableName]: RecordTableView<RecordOf<Name>>
}
export type PartitionedTableViews = {
  readonly [Name in PartitionedTableName]: PartitionedTableView<PartitionedRecordOf<Name>>
}

export type RecordTableSeeds = {
  readonly [Name in RecordTableName]: ReadonlyMap<RecordOf<Name>['id'], RecordOf<Name>>
}
export type PartitionedTableSeeds = {
  readonly [Name in PartitionedTableName]: ReadonlyMap<
    MidiSourceId,
    ReadonlyMap<PartitionedRecordOf<Name>['id'], PartitionedRecordOf<Name>>
  >
}

/** Builds one value per table; callers narrow the result to their own per-table type. */
export function mapTables<Name extends string, Value>(
  names: readonly Name[],
  create: (name: Name) => Value,
): Readonly<Record<Name, Value>> {
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, create(name)])) as Record<Name, Value>,
  )
}
