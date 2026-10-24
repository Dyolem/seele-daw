export type MutationPlanErrorCode =
  | 'duplicate-id-in-partition'
  | 'empty-forward'
  | 'invalid-base-revision'
  | 'invalid-track-order-index'
  | 'no-op-replace'
  | 'record-id-changed'
  | 'unknown-change'
  | 'unrecognized-plan'

/** Raised when a change or plan is structurally unsafe to execute. */
export class MutationPlanError extends Error {
  readonly code: MutationPlanErrorCode
  readonly changeIndex: number | null

  constructor(code: MutationPlanErrorCode, message: string, changeIndex: number | null = null) {
    super(message)
    this.name = 'MutationPlanError'
    this.code = code
    this.changeIndex = changeIndex
  }
}
