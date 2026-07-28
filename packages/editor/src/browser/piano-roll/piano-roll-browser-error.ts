export type PianoRollBrowserErrorCode =
  | 'canvas-context-unavailable'
  | 'invalid-device-pixel-ratio'
  | 'invalid-pointer-input-configuration'
  | 'invalid-theme'
  | 'renderer-disposed'

export class PianoRollBrowserError extends Error {
  readonly code: PianoRollBrowserErrorCode

  constructor(code: PianoRollBrowserErrorCode, message: string) {
    super(message)
    this.name = 'PianoRollBrowserError'
    this.code = code
  }
}
