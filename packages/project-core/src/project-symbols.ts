import type { ProjectContentStateId } from '#internal/session/project-content-state-id'

/** Internal sentinel shared by all projected mutation tables. Never a Project fact. */
export const PROJECTED_DELETED = Symbol('seele/project-core/projected-deleted')

/** History nodes stay distinct even when their facts or revision numbers happen to match. */
export function createProjectContentStateId(): ProjectContentStateId {
  return Symbol('seele/project-core/content-state') as ProjectContentStateId
}
