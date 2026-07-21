import {
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
  SEELE_PROJECT_DATABASE_VERSION,
  type ProjectCheckpointKey,
  type SeeleProjectDatabaseSchema,
} from '~/storage/indexed-db/indexed-db-schema'
import { deleteDB, openDB } from 'idb'

let nextDatabaseId = 0

export function createTestDatabaseName(label: string): string {
  nextDatabaseId += 1
  return `seele-daw-test-${label}-${nextDatabaseId}`
}

export async function deleteTestDatabase(databaseName: string): Promise<void> {
  await deleteDB(databaseName)
}

export async function readRawCheckpoint(
  databaseName: string,
  key: ProjectCheckpointKey,
): Promise<unknown> {
  const database = await openDB<SeeleProjectDatabaseSchema>(
    databaseName,
    SEELE_PROJECT_DATABASE_VERSION,
  )

  try {
    return await database.get(PROJECT_CHECKPOINTS_STORE, key)
  } finally {
    database.close()
  }
}

export async function putRawCheckpoint(databaseName: string, value: unknown): Promise<void> {
  const database = await openDB<SeeleProjectDatabaseSchema>(
    databaseName,
    SEELE_PROJECT_DATABASE_VERSION,
  )

  try {
    await database.put(PROJECT_CHECKPOINTS_STORE, value)
  } finally {
    database.close()
  }
}

export async function deleteRawCheckpoint(
  databaseName: string,
  key: ProjectCheckpointKey,
): Promise<void> {
  const database = await openDB<SeeleProjectDatabaseSchema>(
    databaseName,
    SEELE_PROJECT_DATABASE_VERSION,
  )

  try {
    await database.delete(PROJECT_CHECKPOINTS_STORE, key)
  } finally {
    database.close()
  }
}

export async function putRawCheckpointHead(databaseName: string, value: unknown): Promise<void> {
  const database = await openDB<SeeleProjectDatabaseSchema>(
    databaseName,
    SEELE_PROJECT_DATABASE_VERSION,
  )

  try {
    await database.put(PROJECT_CHECKPOINT_HEADS_STORE, value)
  } finally {
    database.close()
  }
}
