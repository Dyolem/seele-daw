import type { ModelRevision, ProjectSession } from '@seele-daw/project-core'

/** The gesture's original precondition; discrete field edits may use the current target. */
export interface ProjectTempoEventEditTarget {
  readonly baseRevision: ModelRevision
  readonly expectedSession: ProjectSession
}
