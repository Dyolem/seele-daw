export type AudibleMidiCompilerErrorCode =
  | 'duplicate-snapshot-entity'
  | 'invalid-snapshot-reference'
  | 'invalid-track-order'

/** Stable failure raised when a forged or inconsistent Snapshot cannot be compiled safely. */
export class AudibleMidiCompilerError extends Error {
  readonly code: AudibleMidiCompilerErrorCode
  readonly context: string

  constructor(code: AudibleMidiCompilerErrorCode, context: string, message: string) {
    super(message)
    this.name = 'AudibleMidiCompilerError'
    this.code = code
    this.context = context
  }
}
