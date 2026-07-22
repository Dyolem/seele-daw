export type ProjectNavigationConfirmationErrorCode = 'invalid-decision' | 'invalid-intent'

export interface ProjectNavigationConfirmationErrorDetails {
  readonly decision?: unknown
  readonly intent?: unknown
}

export class ProjectNavigationConfirmationError extends Error {
  readonly code: ProjectNavigationConfirmationErrorCode
  readonly decision?: unknown
  readonly intent?: unknown

  constructor(
    code: ProjectNavigationConfirmationErrorCode,
    message: string,
    details: ProjectNavigationConfirmationErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectNavigationConfirmationError'
    this.code = code
    this.decision = details.decision
    this.intent = details.intent
  }
}
