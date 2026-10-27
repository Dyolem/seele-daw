export type ActiveProjectErrorCode =
  | 'generated-project-id-conflict'
  | 'new-session-project-id-mismatch'
  | 'project-id-conflict'
  | 'project-not-found'
  | 'project-not-ready'
  | 'save-in-progress'
  | 'service-disposed'

/** A rule of the Active Project lifecycle that a request broke; `code` names the rule. */
export class ActiveProjectError extends Error {
  readonly code: ActiveProjectErrorCode

  constructor(code: ActiveProjectErrorCode, message: string) {
    super(message)
    this.name = 'ActiveProjectError'
    this.code = code
  }
}
