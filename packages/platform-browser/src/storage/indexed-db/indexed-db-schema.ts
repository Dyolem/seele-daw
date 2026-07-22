import type { DBSchema } from 'idb'

export const SEELE_PROJECT_DATABASE_NAME = 'seele-daw'
export const SEELE_PROJECT_DATABASE_VERSION = 1

export const PROJECT_CHECKPOINTS_STORE = 'projectCheckpoints'
export const PROJECT_CHECKPOINT_HEADS_STORE = 'projectCheckpointHeads'
export const PROJECT_CATALOG_STORE = 'projectCatalog'

export const PROJECT_CHECKPOINT_HEAD_RECORD_VERSION = 1 as const
export const PROJECT_CATALOG_RECORD_VERSION = 1 as const

export type ProjectCheckpointKey = [projectId: string, checkpointId: string]

export interface ProjectCheckpointHeadRecordV1 {
  readonly headRecordVersion: typeof PROJECT_CHECKPOINT_HEAD_RECORD_VERSION
  readonly projectId: string
  readonly activeCheckpointId: string
  readonly previousCheckpointId: string | null
}

export interface ProjectCatalogRecordV1 {
  readonly catalogRecordVersion: typeof PROJECT_CATALOG_RECORD_VERSION
  readonly projectId: string
  readonly name: string
  readonly lastCheckpointSavedAt: number
}

/** Values stay unknown because persisted browser data is never trusted by TypeScript. */
export interface SeeleProjectDatabaseSchema extends DBSchema {
  [PROJECT_CHECKPOINTS_STORE]: {
    key: ProjectCheckpointKey
    value: unknown
  }
  [PROJECT_CHECKPOINT_HEADS_STORE]: {
    key: string
    value: unknown
  }
  [PROJECT_CATALOG_STORE]: {
    key: string
    value: unknown
  }
}

export const SEELE_PROJECT_DATABASE_STORES = Object.freeze([
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
  PROJECT_CATALOG_STORE,
] as const)

export function createProjectCheckpointKey(
  projectId: string,
  checkpointId: string,
): ProjectCheckpointKey {
  return [projectId, checkpointId]
}
