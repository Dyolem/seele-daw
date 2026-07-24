export type ProjectTrackVueErrorCode = 'missing-context'

/** Raised when Track command capabilities are requested outside the Studio application tree. */
export class ProjectTrackVueError extends Error {
  readonly code: ProjectTrackVueErrorCode

  constructor(code: ProjectTrackVueErrorCode, message: string) {
    super(message)
    this.name = 'ProjectTrackVueError'
    this.code = code
  }
}
