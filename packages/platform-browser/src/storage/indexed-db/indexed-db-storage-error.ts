export type IndexedDBStorageErrorCode =
  | 'database-open-failed'
  | 'invalid-database-schema'
  | 'invalid-input'
  | 'invalid-record'
  | 'record-conflict'
  | 'transaction-failed'

export type IndexedDBStorageOperation =
  | 'open-database'
  | 'list-recent-projects'
  | 'read-checkpoint-candidates'
  | 'save-checkpoint'

export interface IndexedDBStorageErrorDetails {
  readonly cause?: unknown
  readonly checkpointId?: string
  readonly databaseName: string
  readonly operation: IndexedDBStorageOperation
  readonly projectId?: string
}

/** Stable browser-storage failure boundary that never exposes idb wrapper types. */
export class IndexedDBStorageError extends Error {
  readonly code: IndexedDBStorageErrorCode
  readonly operation: IndexedDBStorageOperation
  readonly databaseName: string
  readonly projectId: string | null
  readonly checkpointId: string | null
  readonly failureCause: unknown

  constructor(
    code: IndexedDBStorageErrorCode,
    message: string,
    details: IndexedDBStorageErrorDetails,
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'IndexedDBStorageError'
    this.code = code
    this.operation = details.operation
    this.databaseName = details.databaseName
    this.projectId = details.projectId ?? null
    this.checkpointId = details.checkpointId ?? null
    this.failureCause = details.cause
  }
}
