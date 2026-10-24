/**
 * Builds a copy-on-write ModelStoreReader that previews a complete mutation sequence.
 * Local storage preconditions are checked per mutation; cross-entity invariants are
 * checked once after the final projected state exists. The base reader is never mutated.
 */
import type { MasterChannelRecord } from '#internal/model/channel'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import { assertModelInvariants } from '#internal/model/invariant-validator'
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
import { MutationPlanError, type MutationPlanErrorCode } from './mutation-plan-error'
import {
  MutationPreconditionError,
  type MutationPreconditionErrorCode,
} from './mutation-precondition-error'
import type { ProjectMutationType } from './mutation-type'
import {
  PARTITIONED_MUTATION_TYPES,
  describeMutation,
  type ProjectMutation,
} from './project-mutation'

/** Marks a record or partition the projection deleted. Never a Project fact. */
const DELETED = Symbol('seele/project-core/projected-deleted')

type EntryPosition = 'append' | 'base'

interface MutationContext {
  readonly index: number
  readonly type: ProjectMutationType
}

interface ProjectedEntry<RecordType> {
  readonly position: EntryPosition
  readonly value: RecordType
}

type TablePatch<RecordType> = ProjectedEntry<RecordType> | typeof DELETED

function rejectPrecondition(
  code: MutationPreconditionErrorCode,
  context: MutationContext,
  detail: string,
): never {
  throw new MutationPreconditionError(code, context.index, context.type, detail)
}

/** A copy-on-write view of one record table. */
class ProjectedRecordTable implements RecordTableView<StoredRecord> {
  readonly #entityName: string
  readonly #base: RecordTableView<StoredRecord>
  readonly #patches = new Map<string, TablePatch<StoredRecord>>()

  constructor(entityName: string, base: RecordTableView<StoredRecord>) {
    this.#entityName = entityName
    this.#base = base
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
    context: MutationContext,
  ): void {
    if (before === undefined) this.#insert(after!, context)
    else if (after === undefined) this.#remove(before, context)
    else this.#replace(before, after, context)
  }

  #insert(after: StoredRecord, context: MutationContext): void {
    if (this.get(after.id) !== undefined) {
      rejectPrecondition(
        'insert-target-exists',
        context,
        `cannot insert existing ${this.#entityName} ${after.id}`,
      )
    }

    // Deleting first makes a delete-then-insert move to the real Map append position.
    this.#patches.delete(after.id)
    this.#patches.set(after.id, { position: 'append', value: after })
  }

  #remove(before: StoredRecord, context: MutationContext): void {
    this.#requireCurrent(before, 'remove', context)

    if (this.#base.get(before.id) === undefined) {
      this.#patches.delete(before.id)
    } else {
      this.#patches.set(before.id, DELETED)
    }
  }

  #replace(before: StoredRecord, after: StoredRecord, context: MutationContext): void {
    this.#requireCurrent(before, 'replace', context)

    const patch = this.#patches.get(before.id)
    const position = patch !== undefined && patch !== DELETED ? patch.position : 'base'

    // Keying by before.id lets final invariant validation catch a forged ID-changing replace.
    this.#patches.set(before.id, { position, value: after })
  }

  #requireCurrent(
    before: StoredRecord,
    verb: 'remove' | 'replace',
    context: MutationContext,
  ): void {
    const current = this.get(before.id)

    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot ${verb} missing ${this.#entityName} ${before.id}`,
      )
    }

    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `${this.#entityName} ${before.id} no longer matches the expected before record`,
      )
    }
  }
}

interface ProjectedPartition {
  readonly position: EntryPosition
  readonly records: Map<string, StoredRecord>
}

type PartitionPatch = ProjectedPartition | typeof DELETED

/** How a partitioned table names itself in errors. */
interface PartitionNames {
  /** e.g. "MIDI Note" */
  readonly entity: string
  readonly duplicateIdCode: MutationPlanErrorCode
  readonly contentMismatchCode: MutationPreconditionErrorCode
}

/** A copy-on-write view of records partitioned by MIDI Source, such as Notes or CC64 events. */
class ProjectedPartitionedTable implements PartitionedTableView<StoredRecord> {
  readonly #names: PartitionNames
  readonly #base: PartitionedTableView<StoredRecord>
  readonly #patches = new Map<MidiSourceId, PartitionPatch>()

  constructor(names: PartitionNames, base: PartitionedTableView<StoredRecord>) {
    this.#names = names
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

  insertPartition(
    partitionId: MidiSourceId,
    records: readonly StoredRecord[],
    context: MutationContext,
  ): void {
    const { entity } = this.#names
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
          this.#names.duplicateIdCode,
          `Mutation at index ${context.index} contains duplicate ${entity} ID ${record.id}`,
          context.index,
        )
      }
      table.set(record.id, record)
    }
    this.#patches.delete(partitionId)
    this.#patches.set(partitionId, { position: 'append', records: table })
  }

  removePartition(
    partitionId: MidiSourceId,
    before: readonly StoredRecord[],
    context: MutationContext,
  ): void {
    const { entity } = this.#names
    if (!this.has(partitionId)) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot remove missing ${entity} partition ${partitionId}`,
      )
    }
    if (!this.#matches(partitionId, before)) {
      rejectPrecondition(
        this.#names.contentMismatchCode,
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
    context: MutationContext,
  ): void {
    const table = this.#mutable(partitionId, context)

    if (before === undefined) {
      if (table.has(after!.id)) {
        rejectPrecondition(
          'insert-target-exists',
          context,
          `cannot insert existing ${this.#names.entity} ${partitionId}/${after!.id}`,
        )
      }
      table.set(after!.id, after!)
      return
    }

    this.#requireCurrent(
      table,
      partitionId,
      before,
      after === undefined ? 'remove' : 'replace',
      context,
    )
    if (after === undefined) table.delete(before.id)
    else table.set(before.id, after)
  }

  #requireCurrent(
    table: Map<string, StoredRecord>,
    partitionId: MidiSourceId,
    before: StoredRecord,
    verb: 'remove' | 'replace',
    context: MutationContext,
  ): void {
    const { entity } = this.#names
    const current = table.get(before.id)
    if (current === undefined) {
      rejectPrecondition(
        'target-missing',
        context,
        `cannot ${verb} missing ${entity} ${partitionId}/${before.id}`,
      )
    }
    if (current !== before) {
      rejectPrecondition(
        'before-reference-mismatch',
        context,
        `${entity} ${partitionId}/${before.id} no longer matches the expected before record`,
      )
    }
  }

  /** The projected records of one partition, copied from the base the first time it is edited. */
  #mutable(partitionId: MidiSourceId, context: MutationContext): Map<string, StoredRecord> {
    const patch = this.#patches.get(partitionId)
    if (patch !== undefined && patch !== DELETED) return patch.records
    if (patch === DELETED || !this.#base.has(partitionId)) {
      rejectPrecondition(
        'target-missing',
        context,
        `${this.#names.entity} partition ${partitionId} does not exist`,
      )
    }
    const table = new Map(this.#base.entries(partitionId))
    this.#patches.set(partitionId, { position: 'base', records: table })
    return table
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

export class ProjectedModelStoreReader extends ModelStoreReader {
  readonly #base: ModelStoreReader
  #project: ProjectRecord
  #master: MasterChannelRecord
  #trackOrder: TrackId[] | undefined

  readonly #records: Readonly<Record<RecordTableName, ProjectedRecordTable>>
  readonly #partitions: Readonly<Record<PartitionedTableName, ProjectedPartitionedTable>>
  readonly #recordViews: RecordTableViews
  readonly #partitionedViews: PartitionedTableViews

  /** Mutations must be the normalized forward entries produced by createMutationPlan. */
  constructor(base: ModelStoreReader, mutations: readonly ProjectMutation[]) {
    super()
    this.#base = base
    this.#project = base.project
    this.#master = base.master

    this.#records = mapTables(
      RECORD_TABLE_NAMES,
      (name) => new ProjectedRecordTable(RECORD_TABLES[name].entity, base.recordTable(name)),
    )
    this.#partitions = mapTables(
      PARTITIONED_TABLE_NAMES,
      (name) =>
        new ProjectedPartitionedTable(
          {
            entity: PARTITIONED_TABLES[name].entity,
            duplicateIdCode: PARTITIONED_MUTATION_TYPES[name].duplicateIdCode,
            contentMismatchCode: PARTITIONED_MUTATION_TYPES[name].contentMismatchCode,
          },
          base.partitionedTable(name),
        ),
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

    mutations.forEach((mutation, index) => this.#applyMutation(mutation, index))

    // Intermediate steps may be relationally incomplete; only the final view is validated.
    assertModelInvariants(this)
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

  #insertTrackOrder(index: number, trackId: TrackId, context: MutationContext): void {
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

  #removeTrackOrder(index: number, trackId: TrackId, context: MutationContext): void {
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

  #applyMutation(mutation: ProjectMutation, index: number): void {
    const step = describeMutation(mutation, index)
    const context = { index, type: mutation.type }

    switch (step.kind) {
      case 'project':
        if (this.#project !== step.before) {
          rejectPrecondition(
            'before-reference-mismatch',
            context,
            'Project no longer matches the expected before record',
          )
        }
        this.#project = step.after
        return

      case 'master':
        if (this.#master !== step.before) {
          rejectPrecondition(
            'before-reference-mismatch',
            context,
            'Master Channel no longer matches the expected before record',
          )
        }
        this.#master = step.after
        return

      case 'track-order':
        if (step.op === 'insert') this.#insertTrackOrder(step.index, step.trackId, context)
        else this.#removeTrackOrder(step.index, step.trackId, context)
        return

      case 'record':
        this.#records[step.table].write(step.before, step.after, context)
        return

      case 'partition':
        if (step.op === 'insert') {
          this.#partitions[step.table].insertPartition(step.sourceId, step.records, context)
        } else {
          this.#partitions[step.table].removePartition(step.sourceId, step.records, context)
        }
        return

      case 'partition-record':
        this.#partitions[step.table].write(step.sourceId, step.before, step.after, context)
        return
    }
  }
}
