export type ProjectNavigationDecisionVueErrorCode =
  | 'binding-disposed'
  | 'invalid-decision'
  | 'missing-context'

export interface ProjectNavigationDecisionVueErrorDetails {
  readonly decision?: unknown
}

/** Stable Vue adapter failures that do not redefine navigation confirmation outcomes. */
export class ProjectNavigationDecisionVueError extends Error {
  readonly code: ProjectNavigationDecisionVueErrorCode
  readonly decision?: unknown

  constructor(
    code: ProjectNavigationDecisionVueErrorCode,
    message: string,
    details: ProjectNavigationDecisionVueErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectNavigationDecisionVueError'
    this.code = code
    this.decision = details.decision
  }
}
