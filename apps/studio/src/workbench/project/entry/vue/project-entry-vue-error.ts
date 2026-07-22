export class ProjectEntryVueError extends Error {
  readonly code: 'missing-context'

  constructor(code: 'missing-context', message: string) {
    super(message)
    this.name = 'ProjectEntryVueError'
    this.code = code
  }
}
