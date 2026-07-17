export type MutationPlanErrorCode =
  | 'empty-forward'
  | 'invalid-base-revision'
  | 'invalid-track-order-index'
  | 'no-op-replace'
  | 'record-id-changed'
  | 'unknown-mutation-type'

/** Raised when a mutation or plan is structurally unsafe to execute. */
export class MutationPlanError extends Error {
  readonly code: MutationPlanErrorCode
  readonly mutationIndex: number | null

  constructor(code: MutationPlanErrorCode, message: string, mutationIndex: number | null = null) {
    super(message)
    this.name = 'MutationPlanError'
    this.code = code
    this.mutationIndex = mutationIndex
  }
}
