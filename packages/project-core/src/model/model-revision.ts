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

/** Revalidates a numeric revision before it crosses a protocol or commit boundary. */
export function parseModelRevision(value: number): ModelRevision {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ModelRevisionError(
      'invalid-model-revision',
      value,
      'Model revision must be a non-negative safe integer',
    )
  }

  return value as ModelRevision
}

/**
 * Computes the next commit revision without wrapping or losing integer precision.
 * Callers must do this before touching ModelStore so exhaustion remains a no-write failure.
 */
export function nextModelRevision(current: ModelRevision): ModelRevision {
  const parsedCurrent = parseModelRevision(current)

  if (parsedCurrent === Number.MAX_SAFE_INTEGER) {
    throw new ModelRevisionError(
      'model-revision-overflow',
      parsedCurrent,
      'Model revision cannot advance beyond Number.MAX_SAFE_INTEGER',
    )
  }

  return (parsedCurrent + 1) as ModelRevision
}
