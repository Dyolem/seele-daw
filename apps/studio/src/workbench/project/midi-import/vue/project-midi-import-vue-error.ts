export type ProjectMidiImportVueErrorCode = 'missing-context'

/** Raised when MIDI import is requested outside the Studio application tree. */
export class ProjectMidiImportVueError extends Error {
  readonly code: ProjectMidiImportVueErrorCode

  constructor(code: ProjectMidiImportVueErrorCode, message: string) {
    super(message)
    this.name = 'ProjectMidiImportVueError'
    this.code = code
  }
}
