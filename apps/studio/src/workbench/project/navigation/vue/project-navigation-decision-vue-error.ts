export type ProjectNavigationDecisionVueErrorCode = 'binding-disposed' | 'invalid-decision'

/** Misuse of the dialog decision channel; navigation outcomes themselves are not errors. */
export class ProjectNavigationDecisionVueError extends Error {
  readonly code: ProjectNavigationDecisionVueErrorCode
  readonly decision?: unknown

  constructor(
    code: ProjectNavigationDecisionVueErrorCode,
    message: string,
    details: { readonly decision?: unknown } = {},
  ) {
    super(message)
    this.name = 'ProjectNavigationDecisionVueError'
    this.code = code
    this.decision = details.decision
  }
}
