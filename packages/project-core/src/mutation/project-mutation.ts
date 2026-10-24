import type { MasterChannelRecord } from '#internal/model/channel'
import type { DeviceDescriptor } from '#internal/model/device'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import type { ClipRecord } from '#internal/model/midi-clip'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { MidiSustainPedalEventRecord } from '#internal/model/midi-sustain-pedal-event'
import {
  PARTITIONED_TABLES,
  PARTITIONED_TABLE_NAMES,
  RECORD_TABLE_NAMES,
  type PartitionedTableName,
  type RecordTableName,
  type StoredRecord,
} from '#internal/model/model-tables'
import type { ProjectRecord } from '#internal/model/project'
import type { TrackRecord } from '#internal/model/track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'
import { MutationPlanError, type MutationPlanErrorCode } from './mutation-plan-error'
import type { MutationPreconditionErrorCode } from './mutation-precondition-error'
import { PROJECT_MUTATION_TYPE, type ProjectMutationType } from './mutation-type'

interface EntityMutationTypeSet {
  readonly INSERT: ProjectMutationType
  readonly REMOVE: ProjectMutationType
  readonly REPLACE: ProjectMutationType
}

interface PartitionMutationTypeSet {
  readonly INSERT: ProjectMutationType
  readonly REMOVE: ProjectMutationType
}

/**
 * The mutation vocabulary describes normalized storage changes, not user gestures.
 * Records remain immutable values while mutation wrappers carry the before/after
 * references needed for stale-state checks and deterministic inversion.
 */
export type RecordMutation<
  TypeSet extends EntityMutationTypeSet,
  RecordType extends StoredRecord,
> =
  | { readonly type: TypeSet['INSERT']; readonly after: RecordType }
  | { readonly type: TypeSet['REMOVE']; readonly before: RecordType }
  | { readonly type: TypeSet['REPLACE']; readonly before: RecordType; readonly after: RecordType }

/** Inserts, removes or replaces one record inside a MIDI Source partition. */
export type PartitionRecordMutation<
  TypeSet extends EntityMutationTypeSet,
  RecordType extends StoredRecord,
> =
  | {
      readonly type: TypeSet['INSERT']
      readonly sourceId: MidiSourceId
      readonly after: RecordType
    }
  | {
      readonly type: TypeSet['REMOVE']
      readonly sourceId: MidiSourceId
      readonly before: RecordType
    }
  | {
      readonly type: TypeSet['REPLACE']
      readonly sourceId: MidiSourceId
      readonly before: RecordType
      readonly after: RecordType
    }

/** Inserts or removes a whole MIDI Source partition together with its records. */
export type PartitionMutation<
  TypeSet extends PartitionMutationTypeSet,
  RecordType extends StoredRecord,
> =
  | {
      readonly type: TypeSet['INSERT']
      readonly sourceId: MidiSourceId
      readonly after: readonly RecordType[]
    }
  | {
      readonly type: TypeSet['REMOVE']
      readonly sourceId: MidiSourceId
      readonly before: readonly RecordType[]
    }

export interface ProjectReplaceMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.PROJECT.REPLACE
  readonly before: ProjectRecord
  readonly after: ProjectRecord
}

export interface MasterReplaceMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.MASTER.REPLACE
  readonly before: MasterChannelRecord
  readonly after: MasterChannelRecord
}

export interface TrackOrderMutation {
  readonly type:
    | typeof PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT
    | typeof PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE
  readonly index: number
  readonly trackId: TrackId
}

export type TempoEventMutation = RecordMutation<
  typeof PROJECT_MUTATION_TYPE.TEMPO_EVENT,
  TempoEventRecord
>

export interface DeviceReplaceMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.DEVICE.REPLACE
  readonly before: DeviceDescriptor
  readonly after: DeviceDescriptor
  /** Track ownership is carried when a product Command changes a track-owned Device. */
  readonly trackId?: TrackId
}

type DeviceMutation =
  | Exclude<
      RecordMutation<typeof PROJECT_MUTATION_TYPE.DEVICE, DeviceDescriptor>,
      { readonly type: typeof PROJECT_MUTATION_TYPE.DEVICE.REPLACE }
    >
  | DeviceReplaceMutation

export type ProjectMutation =
  | ProjectReplaceMutation
  | MasterReplaceMutation
  | TrackOrderMutation
  | RecordMutation<typeof PROJECT_MUTATION_TYPE.TRACK, TrackRecord>
  | RecordMutation<typeof PROJECT_MUTATION_TYPE.CLIP, ClipRecord>
  | RecordMutation<typeof PROJECT_MUTATION_TYPE.MIDI_SOURCE, MidiSourceRecord>
  | TempoEventMutation
  | RecordMutation<typeof PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT, TimeSignatureEventRecord>
  | DeviceMutation
  | PartitionMutation<typeof PROJECT_MUTATION_TYPE.NOTE_PARTITION, MidiNoteRecord>
  | PartitionRecordMutation<typeof PROJECT_MUTATION_TYPE.NOTE, MidiNoteRecord>
  | PartitionMutation<
      typeof PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION,
      MidiSustainPedalEventRecord
    >
  | PartitionRecordMutation<
      typeof PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT,
      MidiSustainPedalEventRecord
    >

/** The mutation types of each record table. */
const RECORD_MUTATION_TYPES: { readonly [Name in RecordTableName]: EntityMutationTypeSet } = {
  tracks: PROJECT_MUTATION_TYPE.TRACK,
  clips: PROJECT_MUTATION_TYPE.CLIP,
  midiSources: PROJECT_MUTATION_TYPE.MIDI_SOURCE,
  tempoEvents: PROJECT_MUTATION_TYPE.TEMPO_EVENT,
  timeSignatureEvents: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT,
  devices: PROJECT_MUTATION_TYPE.DEVICE,
}

export interface PartitionedMutationTypes {
  readonly partition: PartitionMutationTypeSet
  readonly record: EntityMutationTypeSet
  readonly duplicateIdCode: MutationPlanErrorCode
  readonly contentMismatchCode: MutationPreconditionErrorCode
}

/** The mutation types and error codes of each partitioned table. */
export const PARTITIONED_MUTATION_TYPES: {
  readonly [Name in PartitionedTableName]: PartitionedMutationTypes
} = {
  midiNotesBySource: {
    partition: PROJECT_MUTATION_TYPE.NOTE_PARTITION,
    record: PROJECT_MUTATION_TYPE.NOTE,
    duplicateIdCode: 'duplicate-note-id-in-partition',
    contentMismatchCode: 'note-partition-content-mismatch',
  },
  midiSustainPedalEventsBySource: {
    partition: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION,
    record: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT,
    duplicateIdCode: 'duplicate-sustain-pedal-event-id-in-partition',
    contentMismatchCode: 'sustain-pedal-event-partition-content-mismatch',
  },
}

type RecordOperation = 'insert' | 'remove' | 'replace'

/** What one mutation type does, independent of the entity it names. */
type MutationOperation =
  | { readonly kind: 'project' | 'master' }
  | { readonly kind: 'track-order'; readonly op: 'insert' | 'remove' }
  | { readonly kind: 'record'; readonly table: RecordTableName; readonly op: RecordOperation }
  | {
      readonly kind: 'partition'
      readonly table: PartitionedTableName
      readonly op: 'insert' | 'remove'
    }
  | {
      readonly kind: 'partition-record'
      readonly table: PartitionedTableName
      readonly op: RecordOperation
    }

type RecordLikeOperation = Extract<
  MutationOperation,
  { readonly kind: 'record' | 'partition-record' }
>

function createMutationOperations(): ReadonlyMap<ProjectMutationType, MutationOperation> {
  const operations = new Map<ProjectMutationType, MutationOperation>([
    [PROJECT_MUTATION_TYPE.PROJECT.REPLACE, { kind: 'project' }],
    [PROJECT_MUTATION_TYPE.MASTER.REPLACE, { kind: 'master' }],
    [PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT, { kind: 'track-order', op: 'insert' }],
    [PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE, { kind: 'track-order', op: 'remove' }],
  ])
  for (const table of RECORD_TABLE_NAMES) {
    const types = RECORD_MUTATION_TYPES[table]
    operations.set(types.INSERT, { kind: 'record', table, op: 'insert' })
    operations.set(types.REMOVE, { kind: 'record', table, op: 'remove' })
    operations.set(types.REPLACE, { kind: 'record', table, op: 'replace' })
  }
  for (const table of PARTITIONED_TABLE_NAMES) {
    const { partition, record } = PARTITIONED_MUTATION_TYPES[table]
    operations.set(partition.INSERT, { kind: 'partition', table, op: 'insert' })
    operations.set(partition.REMOVE, { kind: 'partition', table, op: 'remove' })
    operations.set(record.INSERT, { kind: 'partition-record', table, op: 'insert' })
    operations.set(record.REMOVE, { kind: 'partition-record', table, op: 'remove' })
    operations.set(record.REPLACE, { kind: 'partition-record', table, op: 'replace' })
  }
  return operations
}

const MUTATION_OPERATIONS = createMutationOperations()

/** The fields any mutation may carry; its operation decides which ones are present. */
interface MutationFields {
  readonly type: ProjectMutationType
  readonly before?: unknown
  readonly after?: unknown
  readonly sourceId?: MidiSourceId
  readonly index?: number
  readonly trackId?: TrackId
}

/** What a normalized mutation does to which table, in the form the store writes it. */
export type MutationStep =
  | { readonly kind: 'project'; readonly before: ProjectRecord; readonly after: ProjectRecord }
  | {
      readonly kind: 'master'
      readonly before: MasterChannelRecord
      readonly after: MasterChannelRecord
    }
  | {
      readonly kind: 'track-order'
      readonly op: 'insert' | 'remove'
      readonly index: number
      readonly trackId: TrackId
    }
  | {
      /** No `before` inserts and no `after` removes. */
      readonly kind: 'record'
      readonly table: RecordTableName
      readonly before: StoredRecord | undefined
      readonly after: StoredRecord | undefined
    }
  | {
      readonly kind: 'partition'
      readonly table: PartitionedTableName
      readonly op: 'insert' | 'remove'
      readonly sourceId: MidiSourceId
      readonly records: readonly StoredRecord[]
    }
  | {
      readonly kind: 'partition-record'
      readonly table: PartitionedTableName
      readonly sourceId: MidiSourceId
      readonly before: StoredRecord | undefined
      readonly after: StoredRecord | undefined
    }

function mutationPosition(index: number | null): string {
  return index === null ? 'Mutation' : `Mutation at index ${index}`
}

function rejectMutation(code: MutationPlanErrorCode, detail: string, index: number | null): never {
  throw new MutationPlanError(code, `${mutationPosition(index)} ${detail}`, index)
}

function operationOf(mutation: ProjectMutation, index: number | null): MutationOperation {
  const type = (mutation as { readonly type?: unknown }).type
  const operation = MUTATION_OPERATIONS.get(type as ProjectMutationType)

  if (operation === undefined) {
    return rejectMutation('unknown-mutation-type', `has an unknown type: ${String(type)}`, index)
  }

  return operation
}

function assertReplacement(before: StoredRecord, after: StoredRecord, index: number | null): void {
  if (before === after) {
    rejectMutation('no-op-replace', 'must replace a record with a different reference', index)
  }

  if (before.id !== after.id) {
    rejectMutation('record-id-changed', 'cannot change a record identity during replacement', index)
  }
}

function assertMasterReplacement(before: unknown, after: unknown, index: number | null): void {
  if (before === after) {
    rejectMutation('no-op-replace', 'must replace a record with a different reference', index)
  }
}

function assertTrackOrderIndex(index: number, mutationIndex: number | null): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    rejectMutation(
      'invalid-track-order-index',
      'requires a non-negative safe integer track-order index',
      mutationIndex,
    )
  }
}

function assertUniquePartitionIds(
  records: readonly StoredRecord[],
  table: PartitionedTableName,
  mutationIndex: number | null,
): void {
  const ids = new Set<string>()

  for (const record of records) {
    if (ids.has(record.id)) {
      rejectMutation(
        PARTITIONED_MUTATION_TYPES[table].duplicateIdCode,
        `contains duplicate ${PARTITIONED_TABLES[table].entity} ID ${record.id}`,
        mutationIndex,
      )
    }

    ids.add(record.id)
  }
}

/** The operation fixes which fields a type carries, so a rebuilt entry is that mutation. */
function freezeMutation(fields: MutationFields): ProjectMutation {
  return Object.freeze(fields) as ProjectMutation
}

/** Rebuilds a record mutation; a Device replacement keeps the Track it names as its owner. */
function recordMutation(
  type: ProjectMutationType,
  op: RecordOperation,
  operation: RecordLikeOperation,
  fields: MutationFields,
  before: unknown,
  after: unknown,
): ProjectMutation {
  const location = operation.kind === 'partition-record' ? { sourceId: fields.sourceId } : {}

  switch (op) {
    case 'insert':
      return freezeMutation({ type, ...location, after })
    case 'remove':
      return freezeMutation({ type, ...location, before })
    case 'replace': {
      const owner =
        operation.kind === 'record' && operation.table === 'devices' && fields.trackId !== undefined
          ? { trackId: fields.trackId }
          : {}
      return freezeMutation({ type, ...location, before, after, ...owner })
    }
  }
}

function copyProjectMutation(mutation: ProjectMutation, index: number | null): ProjectMutation {
  const operation = operationOf(mutation, index)
  const fields: MutationFields = mutation
  const { type } = fields

  switch (operation.kind) {
    case 'project':
      assertReplacement(fields.before as StoredRecord, fields.after as StoredRecord, index)
      return freezeMutation({ type, before: fields.before, after: fields.after })

    case 'master':
      assertMasterReplacement(fields.before, fields.after, index)
      return freezeMutation({ type, before: fields.before, after: fields.after })

    case 'track-order':
      assertTrackOrderIndex(fields.index as number, index)
      return freezeMutation({ type, index: fields.index, trackId: fields.trackId })

    case 'partition': {
      const records = (
        operation.op === 'insert' ? fields.after : fields.before
      ) as readonly StoredRecord[]
      assertUniquePartitionIds(records, operation.table, index)
      const copy = Object.freeze([...records])
      return freezeMutation(
        operation.op === 'insert'
          ? { type, sourceId: fields.sourceId, after: copy }
          : { type, sourceId: fields.sourceId, before: copy },
      )
    }

    case 'record':
    case 'partition-record':
      if (operation.op === 'replace') {
        assertReplacement(fields.before as StoredRecord, fields.after as StoredRecord, index)
      }
      return recordMutation(type, operation.op, operation, fields, fields.before, fields.after)
  }
}

function invertValidatedProjectMutation(mutation: ProjectMutation): ProjectMutation {
  const operation = operationOf(mutation, null)
  const fields: MutationFields = mutation

  switch (operation.kind) {
    case 'project':
    case 'master':
      return freezeMutation({ type: fields.type, before: fields.after, after: fields.before })

    case 'track-order':
      return freezeMutation({
        type:
          operation.op === 'insert'
            ? PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE
            : PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
        index: fields.index,
        trackId: fields.trackId,
      })

    case 'partition': {
      const types = PARTITIONED_MUTATION_TYPES[operation.table].partition
      return freezeMutation(
        operation.op === 'insert'
          ? { type: types.REMOVE, sourceId: fields.sourceId, before: fields.after }
          : { type: types.INSERT, sourceId: fields.sourceId, after: fields.before },
      )
    }

    case 'record':
    case 'partition-record': {
      const types =
        operation.kind === 'record'
          ? RECORD_MUTATION_TYPES[operation.table]
          : PARTITIONED_MUTATION_TYPES[operation.table].record

      switch (operation.op) {
        case 'insert':
          return recordMutation(types.REMOVE, 'remove', operation, fields, fields.after, undefined)
        case 'remove':
          return recordMutation(types.INSERT, 'insert', operation, fields, undefined, fields.before)
        case 'replace':
          return recordMutation(
            fields.type,
            'replace',
            operation,
            fields,
            fields.after,
            fields.before,
          )
      }
    }
  }
}

/** Reads what a mutation does to which table, independent of the entity it names. */
export function describeMutation(mutation: ProjectMutation, index: number): MutationStep {
  const operation = operationOf(mutation, index)
  const fields: MutationFields = mutation

  switch (operation.kind) {
    case 'project':
      return {
        kind: 'project',
        before: fields.before as ProjectRecord,
        after: fields.after as ProjectRecord,
      }
    case 'master':
      return {
        kind: 'master',
        before: fields.before as MasterChannelRecord,
        after: fields.after as MasterChannelRecord,
      }
    case 'track-order':
      return {
        kind: 'track-order',
        op: operation.op,
        index: fields.index as number,
        trackId: fields.trackId as TrackId,
      }
    case 'record':
      return {
        kind: 'record',
        table: operation.table,
        before: fields.before as StoredRecord | undefined,
        after: fields.after as StoredRecord | undefined,
      }
    case 'partition':
      return {
        kind: 'partition',
        table: operation.table,
        op: operation.op,
        sourceId: fields.sourceId as MidiSourceId,
        records: (operation.op === 'insert'
          ? fields.after
          : fields.before) as readonly StoredRecord[],
      }
    case 'partition-record':
      return {
        kind: 'partition-record',
        table: operation.table,
        sourceId: fields.sourceId as MidiSourceId,
        before: fields.before as StoredRecord | undefined,
        after: fields.after as StoredRecord | undefined,
      }
  }
}

/** Returns a frozen inverse while preserving all domain-record references. */
export function invertProjectMutation(mutation: ProjectMutation): ProjectMutation {
  return invertValidatedProjectMutation(copyProjectMutation(mutation, null))
}

/** @internal Normalizes a plan entry without exposing mutable mutation-owned arrays. */
export function copyProjectMutationForPlan(
  mutation: ProjectMutation,
  index: number,
): ProjectMutation {
  return copyProjectMutation(mutation, index)
}

/** @internal Inverts an entry already normalized by copyProjectMutationForPlan. */
export function invertNormalizedProjectMutation(mutation: ProjectMutation): ProjectMutation {
  return invertValidatedProjectMutation(mutation)
}
