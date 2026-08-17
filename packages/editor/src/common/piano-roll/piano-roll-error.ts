export type PianoRollErrorCode =
  | 'clip-source-mismatch'
  | 'clip-source-range-invalid'
  | 'coordinate-outside-viewport'
  | 'editor-session-disposed'
  | 'invalid-grid'
  | 'invalid-move-gesture'
  | 'invalid-viewport-dimension'
  | 'invalid-viewport-pitch-range'
  | 'looped-clip-unsupported'
  | 'read-model-disposed'
  | 'tick-outside-clip'
  | 'track-clip-note-partition-missing'
  | 'track-clip-source-missing'
  | 'track-not-found'
  | 'track-not-instrument'
  | 'viewport-clip-mismatch'
  | 'viewport-outside-clip'

/** Stable common-layer failure raised before rendering or Project mutation. */
export class PianoRollError extends Error {
  readonly code: PianoRollErrorCode

  constructor(code: PianoRollErrorCode, message: string) {
    super(message)
    this.name = 'PianoRollError'
    this.code = code
  }
}
