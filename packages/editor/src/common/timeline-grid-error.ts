export type TimelineGridErrorCode =
  | 'invalid-tick-position'
  | 'resolved-tick-out-of-range'
  | 'tick-position-before-grid-origin'

/** Stable failure raised while resolving framework-neutral Timeline Grid input. */
export class TimelineGridError extends Error {
  readonly code: TimelineGridErrorCode

  constructor(code: TimelineGridErrorCode, message: string) {
    super(message)
    this.name = 'TimelineGridError'
    this.code = code
  }
}
