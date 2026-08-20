import type { ProjectId } from '@seele-daw/project-core'

export type ActiveProjectErrorCode =
  | 'invalid-observer'
  | 'generated-project-id-conflict'
  | 'new-session-project-id-mismatch'
  | 'project-id-conflict'
  | 'project-not-found'
  | 'project-not-ready'
  | 'save-in-progress'
  | 'service-disposed'
  | 'session-subscription-failed'

export interface ActiveProjectErrorDetails {
  readonly actualProjectId?: ProjectId
  readonly cause?: unknown
  readonly expectedProjectId?: ProjectId
  readonly phase?: string
  readonly projectId?: ProjectId
}

/** Stable application-service failures that are independent of storage technology. */
export class ActiveProjectError extends Error {
  readonly code: ActiveProjectErrorCode
  readonly projectId: ProjectId | null
  readonly expectedProjectId: ProjectId | null
  readonly actualProjectId: ProjectId | null
  readonly phase: string | null
  readonly failureCause: unknown

  constructor(
    code: ActiveProjectErrorCode,
    message: string,
    details: ActiveProjectErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ActiveProjectError'
    this.code = code
    this.projectId = details.projectId ?? null
    this.expectedProjectId = details.expectedProjectId ?? null
    this.actualProjectId = details.actualProjectId ?? null
    this.phase = details.phase ?? null
    this.failureCause = details.cause
  }
}
