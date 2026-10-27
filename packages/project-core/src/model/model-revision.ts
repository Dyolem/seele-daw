import type { Brand } from '@seele-daw/type-utils'

import { rejectDomainValue } from './domain-value-error'

export type ModelRevision = Brand<number, 'ModelRevision'>

export const INITIAL_MODEL_REVISION = 0 as ModelRevision

/** Revalidates a numeric revision before it crosses a protocol or commit boundary. */
export function parseModelRevision(value: number): ModelRevision {
  if (!Number.isSafeInteger(value) || value < 0) {
    rejectDomainValue('ModelRevision', 'a non-negative safe integer')
  }

  return value as ModelRevision
}

/**
 * Computes the next commit revision without wrapping or losing integer precision.
 * Callers must do this before touching ModelStore so exhaustion remains a no-write failure.
 */
export function nextModelRevision(current: ModelRevision): ModelRevision {
  if (current === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Model revision cannot advance beyond Number.MAX_SAFE_INTEGER')
  }

  return (current + 1) as ModelRevision
}
