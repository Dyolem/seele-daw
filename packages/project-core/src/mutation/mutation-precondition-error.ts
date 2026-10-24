export type MutationPreconditionErrorCode =
  | 'before-reference-mismatch'
  | 'insert-target-exists'
  | 'partition-content-mismatch'
  | 'target-missing'
  | 'track-order-entry-mismatch'
  | 'track-order-index-out-of-bounds'

/** Raised when a normalized change cannot be applied to the current projected state. */
export class MutationPreconditionError extends Error {
  readonly code: MutationPreconditionErrorCode
  readonly changeIndex: number
  /** e.g. "midiNotes.replace" */
  readonly change: string

  constructor(
    code: MutationPreconditionErrorCode,
    changeIndex: number,
    change: string,
    detail: string,
  ) {
    super(`Change at index ${changeIndex} (${change}) ${detail}`)
    this.name = 'MutationPreconditionError'
    this.code = code
    this.changeIndex = changeIndex
    this.change = change
  }
}
