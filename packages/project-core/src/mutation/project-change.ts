import type { MasterChannelRecord } from '#internal/model/channel'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import {
  PARTITIONED_TABLES,
  RECORD_TABLES,
  type PartitionedRecordOf,
  type PartitionedTableName,
  type RecordOf,
  type RecordTableName,
  type StoredRecord,
} from '#internal/model/model-tables'
import type { ProjectRecord } from '#internal/model/project'

/** Inserts, removes or replaces one record of a table keyed by ID. */
export type RecordChange<Name extends RecordTableName = RecordTableName> =
  Name extends RecordTableName
    ?
        | { readonly op: 'insert'; readonly table: Name; readonly after: RecordOf<Name> }
        | { readonly op: 'remove'; readonly table: Name; readonly before: RecordOf<Name> }
        | {
            readonly op: 'replace'
            readonly table: Name
            readonly before: RecordOf<Name>
            readonly after: RecordOf<Name>
          }
    : never

/** Inserts, removes or replaces one record inside a MIDI Source partition. */
export type PartitionRecordChange<Name extends PartitionedTableName = PartitionedTableName> =
  Name extends PartitionedTableName
    ?
        | {
            readonly op: 'insert'
            readonly table: Name
            readonly sourceId: MidiSourceId
            readonly after: PartitionedRecordOf<Name>
          }
        | {
            readonly op: 'remove'
            readonly table: Name
            readonly sourceId: MidiSourceId
            readonly before: PartitionedRecordOf<Name>
          }
        | {
            readonly op: 'replace'
            readonly table: Name
            readonly sourceId: MidiSourceId
            readonly before: PartitionedRecordOf<Name>
            readonly after: PartitionedRecordOf<Name>
          }
    : never

/** Creates or deletes a MIDI Source partition together with all of its records. */
export type PartitionChange<Name extends PartitionedTableName = PartitionedTableName> =
  Name extends PartitionedTableName
    ?
        | {
            readonly op: 'insert-partition'
            readonly table: Name
            readonly sourceId: MidiSourceId
            readonly records: readonly PartitionedRecordOf<Name>[]
          }
        | {
            readonly op: 'remove-partition'
            readonly table: Name
            readonly sourceId: MidiSourceId
            /** Every record the partition must still hold. */
            readonly records: readonly PartitionedRecordOf<Name>[]
          }
    : never

export interface ProjectReplacement {
  readonly op: 'replace'
  readonly table: 'project'
  readonly before: ProjectRecord
  readonly after: ProjectRecord
}

export interface MasterReplacement {
  readonly op: 'replace'
  readonly table: 'master'
  readonly before: MasterChannelRecord
  readonly after: MasterChannelRecord
}

export type TrackOrderChange =
  | {
      readonly op: 'insert'
      readonly table: 'trackOrder'
      readonly index: number
      readonly trackId: TrackId
    }
  | {
      readonly op: 'remove'
      readonly table: 'trackOrder'
      readonly index: number
      readonly trackId: TrackId
    }

/**
 * One write to project storage. Commands plan these, History replays their inverses, and every
 * commit publishes the ones it applied, so consumers read exactly what changed.
 */
export type ProjectChange =
  | ProjectReplacement
  | MasterReplacement
  | TrackOrderChange
  | RecordChange
  | PartitionRecordChange
  | PartitionChange

/** Names a change in errors, e.g. "midiNotes.replace". */
export function changeLabel(change: ProjectChange): string {
  return `${change.table}.${change.op}`
}

/** The record a record change expects to find; an insert expects none. */
export function changeBefore(
  change: RecordChange | PartitionRecordChange,
): StoredRecord | undefined {
  return change.op === 'insert' ? undefined : change.before
}

/** The record a record change leaves behind; a remove leaves none. */
export function changeAfter(
  change: RecordChange | PartitionRecordChange,
): StoredRecord | undefined {
  return change.op === 'remove' ? undefined : change.after
}

const RECORD_OPERATIONS: ReadonlySet<unknown> = new Set(['insert', 'remove', 'replace'])
const PARTITION_OPERATIONS: ReadonlySet<unknown> = new Set(['insert-partition', 'remove-partition'])

function changePosition(index: number | null): string {
  return index === null ? 'Change' : `Change at index ${index}`
}

function rejectChange(detail: string, index: number | null): never {
  throw new Error(`${changePosition(index)} ${detail}`)
}

/** Rejects a structurally supplied change whose table and operation do not exist. */
function assertKnownChange(change: ProjectChange, index: number | null): void {
  const { table, op } = change as { readonly table?: unknown; readonly op?: unknown }
  const known =
    ((table === 'project' || table === 'master') && op === 'replace') ||
    (table === 'trackOrder' && (op === 'insert' || op === 'remove')) ||
    (typeof table === 'string' &&
      Object.hasOwn(RECORD_TABLES, table) &&
      RECORD_OPERATIONS.has(op)) ||
    (typeof table === 'string' &&
      Object.hasOwn(PARTITIONED_TABLES, table) &&
      (RECORD_OPERATIONS.has(op) || PARTITION_OPERATIONS.has(op)))

  if (!known) {
    rejectChange(`has an unknown table or operation: ${String(table)}.${String(op)}`, index)
  }
}

function assertReplacement(before: StoredRecord, after: StoredRecord, index: number | null): void {
  if (before === after) {
    rejectChange('must replace a record with a different reference', index)
  }

  if (before.id !== after.id) {
    rejectChange('cannot change a record identity during replacement', index)
  }
}

function assertTrackOrderIndex(index: number, changeIndex: number | null): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    rejectChange('requires a non-negative safe integer track-order index', changeIndex)
  }
}

function assertUniquePartitionIds(
  records: readonly StoredRecord[],
  table: PartitionedTableName,
  changeIndex: number | null,
): void {
  const ids = new Set<string>()

  for (const record of records) {
    if (ids.has(record.id)) {
      rejectChange(
        `contains duplicate ${PARTITIONED_TABLES[table].entity} ID ${record.id}`,
        changeIndex,
      )
    }

    ids.add(record.id)
  }
}

/** Each branch rebuilds the change from the fields its table and operation define. */
function freezeChange(change: object): ProjectChange {
  return Object.freeze(change) as ProjectChange
}

function normalizeRecordChange(
  change: RecordChange | PartitionRecordChange,
  index: number | null,
): ProjectChange {
  const location = 'sourceId' in change ? { sourceId: change.sourceId } : {}

  switch (change.op) {
    case 'insert':
      return freezeChange({ op: change.op, table: change.table, ...location, after: change.after })
    case 'remove':
      return freezeChange({
        op: change.op,
        table: change.table,
        ...location,
        before: change.before,
      })
    case 'replace':
      assertReplacement(change.before, change.after, index)
      return freezeChange({
        op: change.op,
        table: change.table,
        ...location,
        before: change.before,
        after: change.after,
      })
  }
}

/** Copies a structurally supplied change into the frozen form plans store and commits publish. */
function normalizeChange(change: ProjectChange, index: number | null): ProjectChange {
  assertKnownChange(change, index)

  switch (change.table) {
    case 'project':
      assertReplacement(change.before, change.after, index)
      return freezeChange({
        op: 'replace',
        table: 'project',
        before: change.before,
        after: change.after,
      })

    case 'master':
      if (change.before === change.after) {
        rejectChange('must replace a record with a different reference', index)
      }
      return freezeChange({
        op: 'replace',
        table: 'master',
        before: change.before,
        after: change.after,
      })

    case 'trackOrder':
      assertTrackOrderIndex(change.index, index)
      return freezeChange({
        op: change.op,
        table: 'trackOrder',
        index: change.index,
        trackId: change.trackId,
      })

    default:
      if (change.op === 'insert-partition' || change.op === 'remove-partition') {
        assertUniquePartitionIds(change.records, change.table, index)
        return freezeChange({
          op: change.op,
          table: change.table,
          sourceId: change.sourceId,
          records: Object.freeze([...change.records]),
        })
      }
      return normalizeRecordChange(change, index)
  }
}

/** Inverts a normalized change, keeping every record reference. */
function invertNormalizedChange(change: ProjectChange): ProjectChange {
  if (change.table === 'trackOrder') {
    return freezeChange({ ...change, op: change.op === 'insert' ? 'remove' : 'insert' })
  }

  switch (change.op) {
    case 'insert-partition':
      return freezeChange({ ...change, op: 'remove-partition' })
    case 'remove-partition':
      return freezeChange({ ...change, op: 'insert-partition' })
    case 'insert': {
      const { after, ...location } = change
      return freezeChange({ ...location, op: 'remove', before: after })
    }
    case 'remove': {
      const { before, ...location } = change
      return freezeChange({ ...location, op: 'insert', after: before })
    }
    case 'replace':
      return freezeChange({ ...change, before: change.after, after: change.before })
  }
}

/** Returns a frozen inverse while preserving all domain-record references. */
export function invertProjectChange(change: ProjectChange): ProjectChange {
  return invertNormalizedChange(normalizeChange(change, null))
}

/** @internal Normalizes a plan entry without exposing mutable change-owned arrays. */
export function normalizeChangeForPlan(change: ProjectChange, index: number): ProjectChange {
  return normalizeChange(change, index)
}

/** @internal Inverts an entry already normalized by normalizeChangeForPlan. */
export function invertChangeForPlan(change: ProjectChange): ProjectChange {
  return invertNormalizedChange(change)
}
