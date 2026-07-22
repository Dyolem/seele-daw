import type { Brand } from '@seele-daw/type-utils'

/** Opaque session-local identity for one position in the Project History graph. */
export type ProjectContentStateId = Brand<symbol, 'ProjectContentStateId'>

/** @internal History is the only producer of Project content-state identities. */
export function createProjectContentStateId(): ProjectContentStateId {
  return Symbol('ProjectContentStateId') as ProjectContentStateId
}
