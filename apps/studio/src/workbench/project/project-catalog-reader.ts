import type { ProjectId } from '@seele-daw/project-core'

/** UI-facing local Project summary; Project content remains authoritative in Checkpoints. */
export interface RecentProjectSummary {
  readonly projectId: ProjectId
  readonly name: string
  readonly lastCheckpointSavedAt: number
}

export interface ProjectCatalogReader {
  /** Returns Projects ordered by their most recent successful Checkpoint save. */
  listRecentProjects(): Promise<readonly RecentProjectSummary[]>
}
