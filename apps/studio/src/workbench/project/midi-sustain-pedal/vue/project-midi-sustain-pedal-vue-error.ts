export type ProjectMidiSustainPedalVueErrorCode = 'missing-context'

/** Raised when a component consumes the CC64 capability outside Studio composition. */
export class ProjectMidiSustainPedalVueError extends Error {
  readonly code: ProjectMidiSustainPedalVueErrorCode

  constructor(code: ProjectMidiSustainPedalVueErrorCode, message: string) {
    super(message)
    this.name = 'ProjectMidiSustainPedalVueError'
    this.code = code
  }
}
