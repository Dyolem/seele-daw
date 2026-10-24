import type { Brand } from '@seele-daw/type-utils'

/** Opaque session-local identity for one position in the Project History graph. */
export type ProjectContentStateId = Brand<symbol, 'ProjectContentStateId'>

/** History nodes stay distinct even when their facts or revision numbers happen to match. */
export function createProjectContentStateId(): ProjectContentStateId {
  return Symbol('seele/project-core/content-state') as ProjectContentStateId
}
