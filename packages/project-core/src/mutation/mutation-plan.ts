import type { ModelRevision } from '#internal/model/model-revision'
import { invertChangeForPlan, normalizeChangeForPlan, type ProjectChange } from './project-change'

export interface MutationPlan {
  readonly baseRevision: ModelRevision
  readonly forward: readonly ProjectChange[]
  readonly inverse: readonly ProjectChange[]
}

/**
 * Builds a closed, reversible plan from forward changes only. Inverse entries
 * are generated in reverse execution order so they can be applied directly.
 */
export function createMutationPlan(
  baseRevision: ModelRevision,
  forward: readonly ProjectChange[],
): MutationPlan {
  if (forward.length === 0) throw new Error('MutationPlan.forward must contain at least one change')

  const forwardCopy = Object.freeze(
    forward.map((change, index) => normalizeChangeForPlan(change, index)),
  )
  const inverseCopy = Object.freeze([...forwardCopy].reverse().map(invertChangeForPlan))

  return Object.freeze({ baseRevision, forward: forwardCopy, inverse: inverseCopy })
}
