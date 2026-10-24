import type { ModelRevision } from '#internal/model/model-revision'
import { MutationPlanError } from './mutation-plan-error'
import { invertChangeForPlan, normalizeChangeForPlan, type ProjectChange } from './project-change'

export interface MutationPlan {
  readonly baseRevision: ModelRevision
  readonly forward: readonly ProjectChange[]
  readonly inverse: readonly ProjectChange[]
}

const createdMutationPlans = new WeakSet<object>()

function assertBaseRevision(baseRevision: ModelRevision): void {
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
    throw new MutationPlanError(
      'invalid-base-revision',
      'MutationPlan.baseRevision must be a non-negative safe integer',
    )
  }
}

/**
 * Builds a closed, reversible plan from forward changes only. Inverse entries
 * are generated in reverse execution order so they can be applied directly.
 */
export function createMutationPlan(
  baseRevision: ModelRevision,
  forward: readonly ProjectChange[],
): MutationPlan {
  assertBaseRevision(baseRevision)

  if (forward.length === 0) {
    throw new MutationPlanError(
      'empty-forward',
      'MutationPlan.forward must contain at least one change',
    )
  }

  const forwardCopy = Object.freeze(
    forward.map((change, index) => normalizeChangeForPlan(change, index)),
  )
  const inverseCopy = Object.freeze([...forwardCopy].reverse().map(invertChangeForPlan))

  const plan: MutationPlan = Object.freeze({
    baseRevision,
    forward: forwardCopy,
    inverse: inverseCopy,
  })

  // Membership proves this frozen change sequence and inverse were paired by this factory.
  // Payload Records remain shared references under the project's immutable-Record contract.
  createdMutationPlans.add(plan)

  return plan
}

/** @internal Rejects structural lookalikes that do not carry a factory-generated inverse. */
export function assertCreatedMutationPlan(plan: MutationPlan): void {
  if (!createdMutationPlans.has(plan)) {
    throw new MutationPlanError(
      'unrecognized-plan',
      'MutationPlan must be created by createMutationPlan before it can be applied',
    )
  }
}
