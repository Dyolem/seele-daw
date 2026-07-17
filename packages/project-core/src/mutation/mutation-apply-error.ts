import type { ModelRevision } from '@/model/model-revision'

export type MutationApplyErrorCode =
  | 'applier-faulted'
  | 'base-revision-mismatch'
  | 'invalid-plan-shape'
  | 'reentrant-apply'
  | 'write-failed'

export interface MutationApplyErrorDetails {
  readonly appliedMutationCount?: number
  readonly baseRevision?: ModelRevision
  readonly cause?: unknown
  readonly currentRevision?: ModelRevision
}

/** Raised when a plan cannot complete as one safe ModelStore transaction. */
export class MutationApplyError extends Error {
  readonly code: MutationApplyErrorCode
  readonly appliedMutationCount: number | null
  readonly baseRevision: ModelRevision | null
  readonly currentRevision: ModelRevision | null
  readonly failureCause: unknown

  constructor(
    code: MutationApplyErrorCode,
    message: string,
    details: MutationApplyErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'MutationApplyError'
    this.code = code
    this.appliedMutationCount = details.appliedMutationCount ?? null
    this.baseRevision = details.baseRevision ?? null
    this.currentRevision = details.currentRevision ?? null
    // Keep the thrown value even when JavaScript code deliberately throws undefined.
    this.failureCause = details.cause
  }
}

/**
 * Signals that both forward application and defensive restoration failed.
 * The owning applier must remain faulted because ModelStore can no longer be trusted.
 */
export class MutationRollbackError extends Error {
  readonly code = 'rollback-failed' as const
  readonly appliedMutationCount: number
  readonly applyCause: unknown
  readonly rollbackCause: unknown

  constructor(appliedMutationCount: number, applyCause: unknown, rollbackCause: unknown) {
    super(`Failed to restore ModelStore after ${appliedMutationCount} applied mutations`, {
      cause: rollbackCause,
    })
    this.name = 'MutationRollbackError'
    this.appliedMutationCount = appliedMutationCount
    this.applyCause = applyCause
    this.rollbackCause = rollbackCause
  }
}
