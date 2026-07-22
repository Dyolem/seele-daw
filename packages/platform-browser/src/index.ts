/** Public API for browser infrastructure implementations. */
export { IndexedDBProjectCheckpointStore } from './storage/indexed-db/indexed-db-project-checkpoint-store'
export type { IndexedDBProjectCheckpointStoreOptions } from './storage/indexed-db/indexed-db-project-checkpoint-store'
export { IndexedDBProjectCatalog } from './storage/indexed-db/indexed-db-project-catalog'
export type {
  IndexedDBProjectCatalogOptions,
  RecentProjectSummary,
} from './storage/indexed-db/indexed-db-project-catalog'
export { IndexedDBStorageError } from './storage/indexed-db/indexed-db-storage-error'
export type {
  IndexedDBStorageErrorCode,
  IndexedDBStorageErrorDetails,
  IndexedDBStorageOperation,
} from './storage/indexed-db/indexed-db-storage-error'
