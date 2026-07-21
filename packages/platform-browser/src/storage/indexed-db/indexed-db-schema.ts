import type { DBSchema } from 'idb'

export const SEELE_PROJECT_DATABASE_NAME = 'seele-daw'
export const SEELE_PROJECT_DATABASE_VERSION = 1

export const PROJECT_CHECKPOINTS_STORE = 'projectCheckpoints'
export const PROJECT_CHECKPOINT_HEADS_STORE = 'projectCheckpointHeads'

export type ProjectCheckpointKey = [projectId: string, checkpointId: string]

export interface ProjectCheckpointHeadRecordV1 {
  readonly projectId: string
  readonly activeCheckpointId: string
  readonly previousCheckpointId: string | null
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
}

export const SEELE_PROJECT_DATABASE_STORES = Object.freeze([
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
] as const)

export function createProjectCheckpointKey(
  projectId: string,
  checkpointId: string,
): ProjectCheckpointKey {
  return [projectId, checkpointId]
}
