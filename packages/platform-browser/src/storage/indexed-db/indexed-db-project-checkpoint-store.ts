import {
  createProjectCheckpointKey,
  PROJECT_CHECKPOINT_HEAD_RECORD_VERSION,
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
  PROJECT_CATALOG_STORE,
  SEELE_PROJECT_DATABASE_NAME,
  type ProjectCheckpointHeadRecordV1,
} from '#internal/storage/indexed-db/indexed-db-schema'
import { createProjectCatalogRecord } from '#internal/storage/indexed-db/indexed-db-project-catalog-record'
import { abortAndObserve } from '#internal/storage/indexed-db/indexed-db-transaction'
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
  'headRecordVersion',
  'projectId',
  'activeCheckpointId',
  'previousCheckpointId',
] as const)

export interface IndexedDBProjectCheckpointStoreOptions {
  readonly databaseName?: string
  readonly getCurrentTime?: () => number
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
    if (fields.headRecordVersion !== PROJECT_CHECKPOINT_HEAD_RECORD_VERSION) {
      throw new TypeError(`unsupported Head record version ${String(fields.headRecordVersion)}`)
    }
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
    throw new Error(`Invalid Project Checkpoint Head for ${expectedProjectId}`, { cause })
  }
}

function createHeadRecord(
  projectId: ProjectId,
  activeCheckpointId: ProjectCheckpointId,
  previousCheckpointId: ProjectCheckpointId | null,
): ProjectCheckpointHeadRecordV1 {
  return {
    headRecordVersion: PROJECT_CHECKPOINT_HEAD_RECORD_VERSION,
    projectId,
    activeCheckpointId,
    previousCheckpointId,
  }
}

/** IndexedDB implementation of the storage-neutral Project Checkpoint port. */
export class IndexedDBProjectCheckpointStore implements ProjectCheckpointStore {
  readonly #database: SeeleProjectDatabase
  readonly #getCurrentTime: () => number

  constructor(options: IndexedDBProjectCheckpointStoreOptions = {}) {
    const databaseName = options.databaseName ?? SEELE_PROJECT_DATABASE_NAME
    if (databaseName.length === 0) throw new RangeError('IndexedDB database name must not be empty')

    this.#database = new SeeleProjectDatabase(databaseName)
    this.#getCurrentTime = options.getCurrentTime ?? Date.now
  }

  get databaseName(): string {
    return this.#database.databaseName
  }

  close(): void {
    this.#database.close()
  }

  async save(checkpoint: ProjectCheckpoint): Promise<void> {
    const { projectId, checkpointId } = checkpoint
    const catalogRecord = createProjectCatalogRecord(checkpoint, this.#getCurrentTime())

    const database = await this.#database.getConnection()
    // The immutable row, pointer rotation, and old-row eviction form one durability boundary.
    const transaction = database.transaction(
      [PROJECT_CHECKPOINTS_STORE, PROJECT_CHECKPOINT_HEADS_STORE, PROJECT_CATALOG_STORE],
      'readwrite',
    )
    const checkpoints = transaction.objectStore(PROJECT_CHECKPOINTS_STORE)
    const heads = transaction.objectStore(PROJECT_CHECKPOINT_HEADS_STORE)
    const catalog = transaction.objectStore(PROJECT_CATALOG_STORE)

    try {
      const storedHead = await heads.get(projectId)
      const currentHead = storedHead === undefined ? null : decodeHeadRecord(storedHead, projectId)
      const checkpointKey = createProjectCheckpointKey(projectId, checkpointId)

      if ((await checkpoints.getKey(checkpointKey)) !== undefined) {
        throw new Error(`Project Checkpoint ${checkpointId} already exists for ${projectId}`)
      }

      await checkpoints.add(checkpoint)
      await heads.put(
        createHeadRecord(projectId, checkpointId, currentHead?.activeCheckpointId ?? null),
      )
      // Catalog metadata is committed with the Checkpoint so “recent” never advertises a failed save.
      await catalog.put(catalogRecord)

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
      throw new Error(
        `Could not save Project Checkpoint ${checkpointId} in IndexedDB ${this.databaseName}`,
        { cause },
      )
    }
  }

  async readCandidates(projectId: ProjectId): Promise<readonly unknown[]> {
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
      throw new Error(
        `Could not read Project Checkpoint candidates for ${projectId} from IndexedDB ${this.databaseName}`,
        { cause },
      )
    }
  }
}
