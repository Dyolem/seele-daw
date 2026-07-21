import type { ProjectId } from '@/model/ids'
import type { ProjectCheckpoint } from '@/persistence/checkpoint/project-checkpoint'

/** Storage-neutral port implemented by platform infrastructure such as IndexedDB. */
export interface ProjectCheckpointStore {
  save(checkpoint: ProjectCheckpoint): Promise<void>

  /** Returns active, previous, and other recovery candidates in preferred order. */
  readCandidates(projectId: ProjectId): Promise<readonly unknown[]>
}
