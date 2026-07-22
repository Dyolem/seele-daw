export type StudioApplicationErrorCode = 'already-mounted' | 'application-disposed'

/** Stable lifecycle failures raised by the Studio Composition Root. */
export class StudioApplicationError extends Error {
  readonly code: StudioApplicationErrorCode

  constructor(code: StudioApplicationErrorCode, message: string) {
    super(message)
    this.name = 'StudioApplicationError'
    this.code = code
  }
}
