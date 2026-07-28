export type ProjectMidiNoteVueErrorCode = 'missing-context'

/** Raised when a component consumes the MIDI Note capability outside Studio composition. */
export class ProjectMidiNoteVueError extends Error {
  readonly code: ProjectMidiNoteVueErrorCode

  constructor(code: ProjectMidiNoteVueErrorCode, message: string) {
    super(message)
    this.name = 'ProjectMidiNoteVueError'
    this.code = code
  }
}
