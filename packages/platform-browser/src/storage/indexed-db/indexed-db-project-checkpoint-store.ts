import {
  createProjectCheckpointKey,
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
  SEELE_PROJECT_DATABASE_NAME,
  type ProjectCheckpointHeadRecordV1,
} from '#internal/storage/indexed-db/indexed-db-schema'
import { IndexedDBStorageError } from '#internal/storage/indexed-db/indexed-db-storage-error'
import { SeeleProjectDatabase } from '#internal/storage/indexed-db/seele-project-database'
import {
  parseProjectCheckpointId,
  parseProjectId,
  type ProjectCheckpoint,
  type ProjectCheckpointId,
  type ProjectCheckpointStore,
  type ProjectId,
} from '@seele-daw/project-core'

const HEAD_FIELDS = Object.freeze([
  'projectId',
  'activeCheckpointId',
  'previousCheckpointId',
] as const)

interface TransactionCompletion {
  abort(): void
  readonly done: Promise<unknown>
}

class InvalidProjectCheckpointHeadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'InvalidProjectCheckpointHeadError'
  }
}

export interface IndexedDBProjectCheckpointStoreOptions {
  readonly databaseName?: string
}

interface DecodedProjectCheckpointHead {
  readonly projectId: ProjectId
  readonly activeCheckpointId: ProjectCheckpointId
  readonly previousCheckpointId: ProjectCheckpointId | null
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

async function abortAndObserve(transaction: TransactionCompletion): Promise<void> {
  try {
    transaction.abort()
  } catch {
    // A failed request may already have aborted the transaction.
  }

  try {
    await transaction.done
  } catch {
    // The original stable adapter error is reported by the caller.
  }
}

function readHeadFields(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`expected object, received ${describeValue(value)}`)
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actualKeys = Reflect.ownKeys(descriptors)

  if (
    actualKeys.length !== HEAD_FIELDS.length ||
    actualKeys.some((key) => typeof key !== 'string' || !HEAD_FIELDS.some((field) => field === key))
  ) {
    throw new TypeError('expected the exact Project Checkpoint Head V1 fields')
  }

  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const field of HEAD_FIELDS) {
    const descriptor = descriptors[field]
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`${field} must be a data property`)
    }
    fields[field] = descriptor.value
  }

  return fields
}

function decodeHeadRecord(
  value: unknown,
  expectedProjectId: ProjectId,
): DecodedProjectCheckpointHead {
  try {
    const fields = readHeadFields(value)
    const projectId = parseProjectId(fields.projectId)
    const activeCheckpointId = parseProjectCheckpointId(fields.activeCheckpointId)
    const previousCheckpointId =
      fields.previousCheckpointId === null
        ? null
        : parseProjectCheckpointId(fields.previousCheckpointId)

    if (projectId !== expectedProjectId) {
      throw new TypeError(`Head Project ID ${projectId} does not match ${expectedProjectId}`)
    }
    if (activeCheckpointId === previousCheckpointId) {
      throw new TypeError('active and previous Checkpoint IDs must be different')
    }

    return Object.freeze({ projectId, activeCheckpointId, previousCheckpointId })
  } catch (cause) {
    throw new InvalidProjectCheckpointHeadError(
      `Invalid Project Checkpoint Head for ${expectedProjectId}`,
      cause,
    )
  }
}

function createHeadRecord(
  projectId: ProjectId,
  activeCheckpointId: ProjectCheckpointId,
  previousCheckpointId: ProjectCheckpointId | null,
): ProjectCheckpointHeadRecordV1 {
  return { projectId, activeCheckpointId, previousCheckpointId }
}

/** IndexedDB implementation of the storage-neutral Project Checkpoint port. */
export class IndexedDBProjectCheckpointStore implements ProjectCheckpointStore {
  readonly #database: SeeleProjectDatabase

  constructor(options: IndexedDBProjectCheckpointStoreOptions = {}) {
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

  async save(checkpoint: ProjectCheckpoint): Promise<void> {
    let projectId: ProjectId
    let checkpointId: ProjectCheckpointId

    try {
      projectId = parseProjectId(checkpoint.projectId)
      checkpointId = parseProjectCheckpointId(checkpoint.checkpointId)
    } catch (cause) {
      throw new IndexedDBStorageError('invalid-input', 'Invalid Project Checkpoint storage key', {
        cause,
        databaseName: this.databaseName,
        operation: 'save-checkpoint',
      })
    }

    const database = await this.#database.getConnection()
    // The immutable row, pointer rotation, and old-row eviction form one durability boundary.
    const transaction = database.transaction(
      [PROJECT_CHECKPOINTS_STORE, PROJECT_CHECKPOINT_HEADS_STORE],
      'readwrite',
    )
    const checkpoints = transaction.objectStore(PROJECT_CHECKPOINTS_STORE)
    const heads = transaction.objectStore(PROJECT_CHECKPOINT_HEADS_STORE)

    try {
      const storedHead = await heads.get(projectId)
      const currentHead = storedHead === undefined ? null : decodeHeadRecord(storedHead, projectId)
      const checkpointKey = createProjectCheckpointKey(projectId, checkpointId)

      if ((await checkpoints.getKey(checkpointKey)) !== undefined) {
        throw new IndexedDBStorageError(
          'record-conflict',
          `Project Checkpoint ${checkpointId} already exists for ${projectId}`,
          {
            checkpointId,
            databaseName: this.databaseName,
            operation: 'save-checkpoint',
            projectId,
          },
        )
      }

      await checkpoints.add(checkpoint)
      await heads.put(
        createHeadRecord(projectId, checkpointId, currentHead?.activeCheckpointId ?? null),
      )

      if (
        currentHead?.previousCheckpointId !== null &&
        currentHead?.previousCheckpointId !== undefined
      ) {
        await checkpoints.delete(
          createProjectCheckpointKey(projectId, currentHead.previousCheckpointId),
        )
      }

      await transaction.done
    } catch (cause) {
      await abortAndObserve(transaction)
      if (cause instanceof IndexedDBStorageError) throw cause

      const code =
        cause instanceof InvalidProjectCheckpointHeadError ? 'invalid-record' : 'transaction-failed'
      throw new IndexedDBStorageError(
        code,
        `Could not save Project Checkpoint ${checkpointId} in IndexedDB`,
        {
          cause,
          checkpointId,
          databaseName: this.databaseName,
          operation: 'save-checkpoint',
          projectId,
        },
      )
    }
  }

  async readCandidates(projectIdInput: ProjectId): Promise<readonly unknown[]> {
    let projectId: ProjectId

    try {
      projectId = parseProjectId(projectIdInput)
    } catch (cause) {
      throw new IndexedDBStorageError('invalid-input', 'Invalid Project ID for Checkpoint read', {
        cause,
        databaseName: this.databaseName,
        operation: 'read-checkpoint-candidates',
      })
    }

    const database = await this.#database.getConnection()
    const transaction = database.transaction(
      [PROJECT_CHECKPOINTS_STORE, PROJECT_CHECKPOINT_HEADS_STORE],
      'readonly',
    )
    const checkpoints = transaction.objectStore(PROJECT_CHECKPOINTS_STORE)
    const heads = transaction.objectStore(PROJECT_CHECKPOINT_HEADS_STORE)

    try {
      const storedHead = await heads.get(projectId)
      if (storedHead === undefined) {
        await transaction.done
        return Object.freeze([])
      }

      const head = decodeHeadRecord(storedHead, projectId)
      const activeRequest = checkpoints.get(
        createProjectCheckpointKey(projectId, head.activeCheckpointId),
      )

      const candidates =
        head.previousCheckpointId === null
          ? [await activeRequest]
          : await Promise.all([
              activeRequest,
              checkpoints.get(createProjectCheckpointKey(projectId, head.previousCheckpointId)),
            ])

      await transaction.done
      // Keep undefined slots so Core can diagnose a broken pointer before trying previous.
      return Object.freeze(candidates)
    } catch (cause) {
      await abortAndObserve(transaction)
      if (cause instanceof IndexedDBStorageError) throw cause

      const code =
        cause instanceof InvalidProjectCheckpointHeadError ? 'invalid-record' : 'transaction-failed'
      throw new IndexedDBStorageError(
        code,
        `Could not read Project Checkpoint candidates for ${projectId}`,
        {
          cause,
          databaseName: this.databaseName,
          operation: 'read-checkpoint-candidates',
          projectId,
        },
      )
    }
  }
}
