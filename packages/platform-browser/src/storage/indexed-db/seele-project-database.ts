import {
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
  SEELE_PROJECT_DATABASE_STORES,
  SEELE_PROJECT_DATABASE_VERSION,
  type SeeleProjectDatabaseSchema,
} from '#internal/storage/indexed-db/indexed-db-schema'
import { IndexedDBStorageError } from '#internal/storage/indexed-db/indexed-db-storage-error'
import { openDB, type IDBPDatabase } from 'idb'

type SeeleProjectDatabaseConnection = IDBPDatabase<SeeleProjectDatabaseSchema>

function hasExactNames(actual: DOMStringList, expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false

  return expected.every((name) => actual.contains(name))
}

function isCompoundKeyPath(actual: string | string[] | null, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((segment, index) => segment === expected[index])
  )
}

async function assertPhysicalSchema(
  database: SeeleProjectDatabaseConnection,
  databaseName: string,
): Promise<void> {
  if (!hasExactNames(database.objectStoreNames, SEELE_PROJECT_DATABASE_STORES)) {
    throw new IndexedDBStorageError(
      'invalid-database-schema',
      `IndexedDB ${databaseName} does not contain the expected V1 object stores`,
      { databaseName, operation: 'open-database' },
    )
  }

  const transaction = database.transaction(SEELE_PROJECT_DATABASE_STORES, 'readonly')
  const checkpoints = transaction.objectStore(PROJECT_CHECKPOINTS_STORE)
  const heads = transaction.objectStore(PROJECT_CHECKPOINT_HEADS_STORE)

  const hasExpectedLayout =
    isCompoundKeyPath(checkpoints.keyPath, ['projectId', 'checkpointId']) &&
    checkpoints.indexNames.length === 0 &&
    heads.keyPath === 'projectId' &&
    heads.indexNames.length === 0

  await transaction.done

  if (!hasExpectedLayout) {
    throw new IndexedDBStorageError(
      'invalid-database-schema',
      `IndexedDB ${databaseName} object store layout does not match Physical Schema V1`,
      { databaseName, operation: 'open-database' },
    )
  }
}

function upgradePhysicalSchema(database: SeeleProjectDatabaseConnection, oldVersion: number): void {
  if (oldVersion >= 1) return

  database.createObjectStore(PROJECT_CHECKPOINTS_STORE, {
    keyPath: ['projectId', 'checkpointId'],
  })
  database.createObjectStore(PROJECT_CHECKPOINT_HEADS_STORE, {
    keyPath: 'projectId',
  })
}

/** Owns the private idb connection and validates the on-disk schema before use. */
export class SeeleProjectDatabase {
  readonly #databaseName: string
  #connection: SeeleProjectDatabaseConnection | null = null
  #opening: Promise<SeeleProjectDatabaseConnection> | null = null

  constructor(databaseName: string) {
    this.#databaseName = databaseName
  }

  get databaseName(): string {
    return this.#databaseName
  }

  async getConnection(): Promise<SeeleProjectDatabaseConnection> {
    if (this.#connection !== null) return this.#connection
    if (this.#opening !== null) return this.#opening

    const opening = this.#open()
    this.#opening = opening

    try {
      const connection = await opening
      if (this.#opening !== opening) {
        connection.close()
        throw new IndexedDBStorageError(
          'database-open-failed',
          `IndexedDB ${this.#databaseName} was closed while opening`,
          { databaseName: this.#databaseName, operation: 'open-database' },
        )
      }

      this.#connection = connection
      return connection
    } finally {
      if (this.#opening === opening) this.#opening = null
    }
  }

  close(): void {
    this.#connection?.close()
    this.#connection = null

    const opening = this.#opening
    this.#opening = null
    if (opening !== null)
      void opening.then(
        (connection) => connection.close(),
        () => undefined,
      )
  }

  async #open(): Promise<SeeleProjectDatabaseConnection> {
    let openedConnection: SeeleProjectDatabaseConnection | null = null

    const releaseOpenedConnection = (): void => {
      openedConnection?.close()
      if (this.#connection === openedConnection) this.#connection = null
    }

    try {
      openedConnection = await openDB<SeeleProjectDatabaseSchema>(
        this.#databaseName,
        SEELE_PROJECT_DATABASE_VERSION,
        {
          upgrade: upgradePhysicalSchema,
          // Never keep an old tab alive when a newer application version needs an upgrade.
          blocking: releaseOpenedConnection,
          terminated: releaseOpenedConnection,
        },
      )
      await assertPhysicalSchema(openedConnection, this.#databaseName)
      return openedConnection
    } catch (cause) {
      openedConnection?.close()
      if (cause instanceof IndexedDBStorageError) throw cause

      throw new IndexedDBStorageError(
        'database-open-failed',
        `Could not open IndexedDB ${this.#databaseName}`,
        { cause, databaseName: this.#databaseName, operation: 'open-database' },
      )
    }
  }
}
