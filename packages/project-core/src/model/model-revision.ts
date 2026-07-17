import type { Brand } from '@seele-daw/type-utils'

export type ModelRevision = Brand<number, 'ModelRevision'>

export const INITIAL_MODEL_REVISION = 0 as ModelRevision

export type ModelRevisionErrorCode = 'invalid-model-revision' | 'model-revision-overflow'

/** Raised when an internal model revision cannot be advanced safely. */
export class ModelRevisionError extends Error {
  readonly code: ModelRevisionErrorCode
  readonly revision: number

  constructor(code: ModelRevisionErrorCode, revision: number, message: string) {
    super(message)
    this.name = 'ModelRevisionError'
    this.code = code
    this.revision = revision
  }
}

/**
 * Computes the next commit revision without wrapping or losing integer precision.
 * Callers must do this before touching ModelStore so exhaustion remains a no-write failure.
 */
export function nextModelRevision(current: ModelRevision): ModelRevision {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new ModelRevisionError(
      'invalid-model-revision',
      current,
      'Model revision must be a non-negative safe integer',
    )
  }

  if (current === Number.MAX_SAFE_INTEGER) {
    throw new ModelRevisionError(
      'model-revision-overflow',
      current,
      'Model revision cannot advance beyond Number.MAX_SAFE_INTEGER',
    )
  }

  return (current + 1) as ModelRevision
}
