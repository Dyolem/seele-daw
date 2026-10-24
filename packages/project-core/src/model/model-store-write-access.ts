/**
 * Owns the one-shot registry for ModelStore's private write capability.
 *
 * ModelStore registers closures over its private containers; MutationApplier claims those
 * closures exactly once. Keeping the lease here avoids public or protected fields and never
 * exposes a mutable container.
 */
import type { MasterChannelRecord } from './channel'
import type { MidiSourceId, TrackId } from './ids'
import type { ModelRevision } from './model-revision'
import type { PartitionedTableName, RecordTableName, StoredRecord } from './model-tables'
import type { ProjectRecord } from './project'

export type ModelStoreWriteAccessErrorCode =
  | 'write-access-already-registered'
  | 'write-access-unavailable'
  | 'write-precondition-failed'

/** Internal failure of the single-writer storage boundary. */
export class ModelStoreWriteAccessError extends Error {
  readonly code: ModelStoreWriteAccessErrorCode

  constructor(code: ModelStoreWriteAccessErrorCode, message: string) {
    super(message)
    this.name = 'ModelStoreWriteAccessError'
    this.code = code
  }
}

/**
 * A narrow compare-and-swap surface over ModelStore.
 *
 * Each method checks its expected state before performing one logical container write. Record
 * writes insert when nothing is expected and remove when nothing comes next. Tables are named,
 * never handed out.
 */
export interface ModelStoreWriteAccess {
  readonly writeProject: (expected: ProjectRecord, next: ProjectRecord) => void
  readonly writeMaster: (expected: MasterChannelRecord, next: MasterChannelRecord) => void

  readonly writeRecord: (
    table: RecordTableName,
    expected: StoredRecord | undefined,
    next: StoredRecord | undefined,
  ) => void

  readonly insertTrackOrder: (index: number, trackId: TrackId) => void
  readonly removeTrackOrder: (index: number, trackId: TrackId) => void

  readonly insertPartition: (
    table: PartitionedTableName,
    sourceId: MidiSourceId,
    records: readonly StoredRecord[],
  ) => void
  readonly removePartition: (
    table: PartitionedTableName,
    sourceId: MidiSourceId,
    expected: readonly StoredRecord[],
  ) => void
  readonly writePartitionRecord: (
    table: PartitionedTableName,
    sourceId: MidiSourceId,
    expected: StoredRecord | undefined,
    next: StoredRecord | undefined,
  ) => void

  readonly commitModelRevision: (expected: ModelRevision, next: ModelRevision) => void
}

const writeAccessByStore = new WeakMap<object, ModelStoreWriteAccess>()
const everRegisteredStores = new WeakSet<object>()

/** @internal Only ModelStore may register a capability. */
export function registerModelStoreWriteAccess(
  store: object,
  writeAccess: ModelStoreWriteAccess,
): void {
  if (everRegisteredStores.has(store)) {
    throw new ModelStoreWriteAccessError(
      'write-access-already-registered',
      'ModelStore write access has already been registered',
    )
  }

  // Registration history survives claim so a consumed lease can never be recreated.
  everRegisteredStores.add(store)
  writeAccessByStore.set(store, Object.freeze(writeAccess))
}

/** @internal Only MutationApplier may consume the one-shot capability. */
export function claimModelStoreWriteAccess(store: object): ModelStoreWriteAccess {
  const writeAccess = writeAccessByStore.get(store)

  if (writeAccess === undefined) {
    throw new ModelStoreWriteAccessError(
      'write-access-unavailable',
      'ModelStore write access is unavailable or has already been claimed',
    )
  }

  // Deleting before returning makes the lease non-recoverable, even if construction fails later.
  writeAccessByStore.delete(store)

  return writeAccess
}
