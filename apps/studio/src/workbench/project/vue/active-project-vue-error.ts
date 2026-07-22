export type ActiveProjectVueErrorCode = 'missing-context'

/** Stable Vue adapter failures that do not redefine Active Project business errors. */
export class ActiveProjectVueError extends Error {
  readonly code: ActiveProjectVueErrorCode

  constructor(code: ActiveProjectVueErrorCode, message: string) {
    super(message)
    this.name = 'ActiveProjectVueError'
    this.code = code
  }
}
