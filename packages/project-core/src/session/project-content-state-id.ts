import type { Brand } from '@seele-daw/type-utils'

/** Opaque session-local identity for one position in the Project History graph. */
export type ProjectContentStateId = Brand<symbol, 'ProjectContentStateId'>
