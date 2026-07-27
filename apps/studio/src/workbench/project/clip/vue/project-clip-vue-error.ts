export type ProjectClipVueErrorCode = 'missing-context'

/** Raised when a component consumes the Clip capability outside Studio composition. */
export class ProjectClipVueError extends Error {
  readonly code: ProjectClipVueErrorCode

  constructor(code: ProjectClipVueErrorCode, message: string) {
    super(message)
    this.name = 'ProjectClipVueError'
    this.code = code
  }
}
