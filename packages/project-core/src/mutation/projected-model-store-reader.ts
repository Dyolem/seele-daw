/**
 * Builds a copy-on-write ModelStoreReader that previews a complete change sequence.
 * Local storage preconditions are checked per change; cross-entity invariants are
 * checked once after the final projected state exists. The base reader is never mutated,
 * and the projection holds only what the changes wrote, never a copy of a table or partition.
 */
import type { MasterChannelRecord } from '#internal/model/channel'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import { assertWrittenModelInvariants } from '#internal/model/invariant-validator'
import type { ModelRevision } from '#internal/model/model-revision'
import { ModelStoreReader } from '#internal/model/model-store'
import {
  PARTITIONED_TABLES,
  PARTITIONED_TABLE_NAMES,
  RECORD_TABLES,
  RECORD_TABLE_NAMES,
  mapTables,
  type PartitionedTableName,
  type PartitionedTableView,
  type PartitionedTableViews,
  type RecordTableName,
  type RecordTableView,
  type RecordTableViews,
  type StoredRecord,
} from '#internal/model/model-tables'
import type { ProjectRecord } from '#internal/model/project'
import { MutationPlanError } from './mutation-plan-error'
import {
  MutationPreconditionError,
  type MutationPreconditionErrorCode,
} from './mutation-precondition-error'
import { changeAfter, changeBefore, changeLabel, type ProjectChange } from './project-change'

/** Marks a record or partition the projection deleted. Never a Project fact. */
const DELETED = Symbol('seele/project-core/projected-deleted')

type EntryPosition = 'append' | 'base'

interface ChangeContext {
  readonly index: number
  /** e.g. "midiNotes.replace" */
  readonly change: string
}

interface ProjectedEntry<RecordType> {
  readonly position: EntryPosition
  readonly value: RecordType
}

type TablePatch<RecordType> = ProjectedEntry<RecordType> | typeof DELETED

function rejectPrecondition(
  code: MutationPreconditionErrorCode,
  context: ChangeContext,
  detail: string,
): never {
  throw new MutationPreconditionError(code, context.index, context.change, detail)
}

/**
 * A copy-on-write view of records keyed by ID: a record table, or one partition. Entries keep
 * the order the Store's Map would have after the same writes: replacements stay in place,
 * inserts append, and a removed record inserted again moves to the end.
 */
class ProjectedRecordTable implements RecordTableView<StoredRecord> {
  /** Names one record in errors, e.g. "MIDI Note source-1/note-1". */
  readonly #describe: (id: string) => string
  readonly #base: RecordTableView<StoredRecord>
  readonly #patches = new Map<string, TablePatch<StoredRecord>>()
  #sizeChange = 0

  constructor(describe: (id: string) => string, base: RecordTableView<StoredRecord>) {
    this.#describe = describe
    this.#base = base
  }

  /** Records inserted minus records removed. */
  get sizeChange(): number {
    return this.#sizeChange
  }

  get(id: string): StoredRecord | undefined {
    const patch = this.#patches.get(id)

    if (patch === DELETED) {
      return undefined
    }

    if (patch !== undefined) {
      return patch.value
    }

    return this.#base.get(id)
  }

  *entries(): IterableIterator<readonly [string, StoredRecord]> {
    for (const [id, baseRecord] of this.#base.entries()) {
      const patch = this.#patches.get(id)

      if (patch === DELETED || patch?.position === 'append') {
        continue
      }

      yield [id, patch?.value ?? baseRecord] as const
    }

    for (const [id, patch] of this.#patches) {
      if (patch !== DELETED && patch.position === 'append') {
        yield [id, patch.value] as const
      }
    }
  }

  /** No `before` inserts, no `after` removes, both replace. */
  write(
    before: StoredRecord | undefined,
    after: StoredRecord | undefined,
    context: ChangeContext,
  ): void {
    if (before === undefined) this.#insert(after!, context)
    else if (after === undefined) this.#remove(before, context)
    else this.#replace(before, after, context)
  }

  #insert(after: StoredRecord, context: ChangeContext): void {
    if (this.get(after.id) !== undefined) {
      rejectPrecondition(
        'insert-target-exists',
        context,
        `cannot insert existing ${this.#describe(after.id)}`,
      )
    }

    // Deleting first makes a delete-then-insert move to the real Map append position.
    this.#patches.delete(after.id)
    this.#patches.set(after.id, { position: 'append', value: after })
    this.#sizeChange += 1
  }

  #remove(before: StoredRecord, context: ChangeContext): void {
    this.#requireCurrent(before, 'remove', context)

    if (this.#base.get(before.id) === undefined) {
      this.#patches.delete(before.id)
    } else {
      this.#patches.set(before.id, DELETED)
    }
    this.#sizeChange -= 1
  }

  #replace(before: StoredRecord, after: StoredRecord, context: ChangeContext): void {
    this.#requireCurrent(before, 'replace', context)

    const patch = this.#patches.get(before.id)
    const position = patch !== undefined && patch !== DELETED ? patch.position : 'base'

    // Keying by before.id lets final invariant validation catch a forged ID-changing replace.
    this.#patches.set(before.id, { position, value: after })
  }

  #requireCurrent(before: StoredRecord, verb: 'remove' | 'replace', context: ChangeContext): void {
    const current = this.get(before.id)

    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot ${verb} missing ${this.#describe(before.id)}`,
      )
    }

    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `${this.#describe(before.id)} no longer matches the expected before record`,
      )
    }
  }
}

interface ProjectedPartition {
  /** `base` while the Store already holds the partition, `append` once this projection made it. */
  readonly position: EntryPosition
  readonly baseSize: number
  readonly records: ProjectedRecordTable
}

type PartitionPatch = ProjectedPartition | typeof DELETED

/** A copy-on-write view of records partitioned by MIDI Source, such as Notes or CC64 events. */
class ProjectedPartitionedTable implements PartitionedTableView<StoredRecord> {
  /** Names the records in errors, e.g. "MIDI Note". */
  readonly #entity: string
  readonly #base: PartitionedTableView<StoredRecord>
  readonly #patches = new Map<MidiSourceId, PartitionPatch>()

  constructor(entity: string, base: PartitionedTableView<StoredRecord>) {
    this.#entity = entity
    this.#base = base
  }

  has(partitionId: MidiSourceId): boolean {
    const patch = this.#patches.get(partitionId)
    if (patch === DELETED) return false
    if (patch !== undefined) return true
    return this.#base.has(partitionId)
  }

  *partitionIds(): IterableIterator<MidiSourceId> {
    for (const partitionId of this.#base.partitionIds()) {
      const patch = this.#patches.get(partitionId)
      if (patch === DELETED || patch?.position === 'append') continue
      yield partitionId
    }
    for (const [partitionId, patch] of this.#patches) {
      if (patch !== DELETED && patch.position === 'append') yield partitionId
    }
  }

  get(partitionId: MidiSourceId, id: string): StoredRecord | undefined {
    const patch = this.#patches.get(partitionId)
    if (patch === DELETED) return undefined
    if (patch !== undefined) return patch.records.get(id)
    return this.#base.get(partitionId, id)
  }

  *entries(partitionId: MidiSourceId): IterableIterator<readonly [string, StoredRecord]> {
    const patch = this.#patches.get(partitionId)
    if (patch === DELETED) return
    if (patch !== undefined) {
      yield* patch.records.entries()
      return
    }
    yield* this.#base.entries(partitionId)
  }

  size(partitionId: MidiSourceId): number {
    const patch = this.#patches.get(partitionId)
    if (patch === DELETED) return 0
    if (patch !== undefined) return patch.baseSize + patch.records.sizeChange
    return this.#base.size(partitionId)
  }

  insertPartition(
    partitionId: MidiSourceId,
    records: readonly StoredRecord[],
    context: ChangeContext,
  ): void {
    const entity = this.#entity
    if (this.has(partitionId)) {
      rejectPrecondition(
        'insert-target-exists',
        context,
        `cannot insert existing ${entity} partition ${partitionId}`,
      )
    }
    const table = new Map<string, StoredRecord>()
    for (const record of records) {
      if (table.has(record.id)) {
        throw new MutationPlanError(
          'duplicate-id-in-partition',
          `Change at index ${context.index} contains duplicate ${entity} ID ${record.id}`,
          context.index,
        )
      }
      table.set(record.id, record)
    }
    this.#patches.delete(partitionId)
    this.#patches.set(partitionId, {
      position: 'append',
      baseSize: table.size,
      records: new ProjectedRecordTable(this.#describer(partitionId), {
        get: (id) => table.get(id),
        entries: () => table.entries(),
      }),
    })
  }

  removePartition(
    partitionId: MidiSourceId,
    before: readonly StoredRecord[],
    context: ChangeContext,
  ): void {
    const entity = this.#entity
    if (!this.has(partitionId)) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot remove missing ${entity} partition ${partitionId}`,
      )
    }
    if (!this.#matches(partitionId, before)) {
      rejectPrecondition(
        'partition-content-mismatch',
        context,
        `${entity} partition ${partitionId} no longer matches the expected before records`,
      )
    }
    if (this.#base.has(partitionId)) this.#patches.set(partitionId, DELETED)
    else this.#patches.delete(partitionId)
  }

  /** No `before` inserts, no `after` removes, both replace. */
  write(
    partitionId: MidiSourceId,
    before: StoredRecord | undefined,
    after: StoredRecord | undefined,
    context: ChangeContext,
  ): void {
    this.#editable(partitionId, context).write(before, after, context)
  }

  #describer(partitionId: MidiSourceId): (id: string) => string {
    return (id) => `${this.#entity} ${partitionId}/${id}`
  }

  /** The projected records of one partition; the first edit overlays the base partition. */
  #editable(partitionId: MidiSourceId, context: ChangeContext): ProjectedRecordTable {
    const patch = this.#patches.get(partitionId)
    if (patch !== undefined && patch !== DELETED) return patch.records
    if (patch === DELETED || !this.#base.has(partitionId)) {
      rejectPrecondition(
        'target-missing',
        context,
        `${this.#entity} partition ${partitionId} does not exist`,
      )
    }
    const base = this.#base
    const records = new ProjectedRecordTable(this.#describer(partitionId), {
      get: (id) => base.get(partitionId, id),
      entries: () => base.entries(partitionId),
    })
    this.#patches.set(partitionId, {
      position: 'base',
      baseSize: base.size(partitionId),
      records,
    })
    return records
  }

  #matches(partitionId: MidiSourceId, before: readonly StoredRecord[]): boolean {
    const expected = new Map(before.map((record) => [record.id, record] as const))
    if (expected.size !== before.length) return false
    let size = 0
    for (const [id, record] of this.entries(partitionId)) {
      size += 1
      if (expected.get(id) !== record) return false
    }
    return size === expected.size
  }
}

function emptyWrittenContent() {
  return {
    sources: new Set<MidiSourceId>(),
    records: mapTables(PARTITIONED_TABLE_NAMES, () => new Map<MidiSourceId, Set<string>>()),
    insertedIds: mapTables(PARTITIONED_TABLE_NAMES, () => new Set<string>()),
  }
}

export class ProjectedModelStoreReader extends ModelStoreReader {
  readonly #base: ModelStoreReader
  #project: ProjectRecord
  #master: MasterChannelRecord
  #trackOrder: TrackId[] | undefined

  readonly #records: Readonly<Record<RecordTableName, ProjectedRecordTable>>
  readonly #partitions: Readonly<Record<PartitionedTableName, ProjectedPartitionedTable>>
  readonly #recordViews: RecordTableViews
  readonly #partitionedViews: PartitionedTableViews
  readonly #written = emptyWrittenContent()

  /**
   * Changes must be the normalized forward entries produced by createMutationPlan, and the base
   * must be valid: only what the changes wrote is validated.
   */
  constructor(base: ModelStoreReader, changes: readonly ProjectChange[]) {
    super()
    this.#base = base
    this.#project = base.project
    this.#master = base.master

    this.#records = mapTables(RECORD_TABLE_NAMES, (name) => {
      const { entity } = RECORD_TABLES[name]
      return new ProjectedRecordTable((id) => `${entity} ${id}`, base.recordTable(name))
    })
    this.#partitions = mapTables(
      PARTITIONED_TABLE_NAMES,
      (name) =>
        new ProjectedPartitionedTable(PARTITIONED_TABLES[name].entity, base.partitionedTable(name)),
    )
    // Each projected table only ever holds records of the table it projects.
    this.#recordViews = mapTables(
      RECORD_TABLE_NAMES,
      (name): RecordTableView<StoredRecord> => this.#records[name],
    ) as RecordTableViews
    this.#partitionedViews = mapTables(
      PARTITIONED_TABLE_NAMES,
      (name): PartitionedTableView<StoredRecord> => this.#partitions[name],
    ) as PartitionedTableViews

    changes.forEach((change, index) => this.#applyChange(change, index))

    // Intermediate steps may be relationally incomplete; only the final view is validated.
    assertWrittenModelInvariants(this, this.#written)
  }

  get modelRevision(): ModelRevision {
    return this.#base.modelRevision
  }

  get project(): ProjectRecord {
    return this.#project
  }

  get master(): MasterChannelRecord {
    return this.#master
  }

  orderedTrackIds(): IterableIterator<TrackId> {
    if (this.#trackOrder === undefined) {
      return this.#base.orderedTrackIds()
    }

    return this.#trackOrder.values()
  }

  recordTable<Name extends RecordTableName>(name: Name): RecordTableViews[Name] {
    return this.#recordViews[name]
  }

  partitionedTable<Name extends PartitionedTableName>(name: Name): PartitionedTableViews[Name] {
    return this.#partitionedViews[name]
  }

  #mutableTrackOrder(): TrackId[] {
    this.#trackOrder ??= [...this.#base.orderedTrackIds()]

    return this.#trackOrder
  }

  #insertTrackOrder(index: number, trackId: TrackId, context: ChangeContext): void {
    const trackOrder = this.#mutableTrackOrder()

    if (!Number.isSafeInteger(index) || index < 0 || index > trackOrder.length) {
      rejectPrecondition(
        'track-order-index-out-of-bounds',
        context,
        `cannot insert Track ${trackId} at index ${index} for length ${trackOrder.length}`,
      )
    }

    trackOrder.splice(index, 0, trackId)
  }

  #removeTrackOrder(index: number, trackId: TrackId, context: ChangeContext): void {
    const trackOrder = this.#mutableTrackOrder()

    if (!Number.isSafeInteger(index) || index < 0 || index >= trackOrder.length) {
      rejectPrecondition(
        'track-order-index-out-of-bounds',
        context,
        `cannot remove Track ${trackId} at index ${index} for length ${trackOrder.length}`,
      )
    }

    if (trackOrder[index] !== trackId) {
      rejectPrecondition(
        'track-order-entry-mismatch',
        context,
        `expected Track ${trackId} at index ${index}, found ${String(trackOrder[index])}`,
      )
    }

    trackOrder.splice(index, 1)
  }

  /** Remembers the content a change wrote, so validation can stay with it. */
  #noteWritten(change: ProjectChange): void {
    const written = this.#written

    if (change.table === 'midiSources') {
      written.sources.add(change.op === 'remove' ? change.before.id : change.after.id)
      return
    }

    if (!('sourceId' in change)) return

    const insertedIds = written.insertedIds[change.table]

    if (change.op === 'insert-partition') {
      written.sources.add(change.sourceId)
      for (const record of change.records) insertedIds.add(record.id)
      return
    }

    if (change.op === 'remove-partition') return

    const records = written.records[change.table]
    let ids = records.get(change.sourceId)
    if (ids === undefined) records.set(change.sourceId, (ids = new Set()))
    if (change.op === 'insert') {
      ids.add(change.after.id)
      insertedIds.add(change.after.id)
    } else {
      ids.add(change.before.id)
    }
  }

  #applyChange(change: ProjectChange, index: number): void {
    const context = { index, change: changeLabel(change) }

    switch (change.table) {
      case 'project':
        if (this.#project !== change.before) {
          rejectPrecondition(
            'before-reference-mismatch',
            context,
            'Project no longer matches the expected before record',
          )
        }
        this.#project = change.after
        return

      case 'master':
        if (this.#master !== change.before) {
          rejectPrecondition(
            'before-reference-mismatch',
            context,
            'Master Channel no longer matches the expected before record',
          )
        }
        this.#master = change.after
        return

      case 'trackOrder':
        if (change.op === 'insert') this.#insertTrackOrder(change.index, change.trackId, context)
        else this.#removeTrackOrder(change.index, change.trackId, context)
        return

      default:
        if (!('sourceId' in change)) {
          this.#records[change.table].write(changeBefore(change), changeAfter(change), context)
        } else if (change.op === 'insert-partition') {
          this.#partitions[change.table].insertPartition(change.sourceId, change.records, context)
        } else if (change.op === 'remove-partition') {
          this.#partitions[change.table].removePartition(change.sourceId, change.records, context)
        } else {
          this.#partitions[change.table].write(
            change.sourceId,
            changeBefore(change),
            changeAfter(change),
            context,
          )
        }
        this.#noteWritten(change)
    }
  }
}
