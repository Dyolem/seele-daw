import { decodeProjectCatalogRecord } from '#internal/storage/indexed-db/indexed-db-project-catalog-record'
import {
  PROJECT_CATALOG_STORE,
  SEELE_PROJECT_DATABASE_NAME,
} from '#internal/storage/indexed-db/indexed-db-schema'
import { IndexedDBStorageError } from '#internal/storage/indexed-db/indexed-db-storage-error'
import { abortAndObserve } from '#internal/storage/indexed-db/indexed-db-transaction'
import { SeeleProjectDatabase } from '#internal/storage/indexed-db/seele-project-database'
import type { ProjectId } from '@seele-daw/project-core'

export interface RecentProjectSummary {
  readonly projectId: ProjectId
  readonly name: string
  readonly lastCheckpointSavedAt: number
}

export interface IndexedDBProjectCatalogOptions {
  readonly databaseName?: string
}

class InvalidProjectCatalogRecordError extends Error {
  constructor(cause: unknown) {
    super('Invalid Project Catalog V1 record', { cause })
    this.name = 'InvalidProjectCatalogRecordError'
  }
}

function compareRecentProjects(first: RecentProjectSummary, second: RecentProjectSummary): number {
  const timeDifference = second.lastCheckpointSavedAt - first.lastCheckpointSavedAt
  if (timeDifference !== 0) return timeDifference
  if (first.projectId < second.projectId) return -1
  if (first.projectId > second.projectId) return 1
  return 0
}

function decodeCatalogRecord(value: unknown): RecentProjectSummary {
  try {
    return decodeProjectCatalogRecord(value)
  } catch (cause) {
    throw new InvalidProjectCatalogRecordError(cause)
  }
}

/** Read-only browser catalog derived atomically from successful Project Checkpoint saves. */
export class IndexedDBProjectCatalog {
  readonly #database: SeeleProjectDatabase

  constructor(options: IndexedDBProjectCatalogOptions = {}) {
    const databaseName = options.databaseName ?? SEELE_PROJECT_DATABASE_NAME
    if (databaseName.length === 0) {
      throw new IndexedDBStorageError(
        'invalid-input',
        'IndexedDB database name must not be empty',
        { databaseName, operation: 'open-database' },
      )
    }

    this.#database = new SeeleProjectDatabase(databaseName)
  }

  get databaseName(): string {
    return this.#database.databaseName
  }

  close(): void {
    this.#database.close()
  }

  async listRecentProjects(): Promise<readonly RecentProjectSummary[]> {
    const database = await this.#database.getConnection()
    const transaction = database.transaction(PROJECT_CATALOG_STORE, 'readonly')

    try {
      const records = await transaction.objectStore(PROJECT_CATALOG_STORE).getAll()
      const projects = records.map(decodeCatalogRecord).sort(compareRecentProjects)
      await transaction.done
      return Object.freeze(projects)
    } catch (cause) {
      await abortAndObserve(transaction)
      if (cause instanceof IndexedDBStorageError) throw cause

      const code =
        cause instanceof InvalidProjectCatalogRecordError ? 'invalid-record' : 'transaction-failed'
      throw new IndexedDBStorageError(
        code,
        `Could not read the Project Catalog from IndexedDB ${this.databaseName}`,
        {
          cause,
          databaseName: this.databaseName,
          operation: 'list-recent-projects',
        },
      )
    }
  }
}
