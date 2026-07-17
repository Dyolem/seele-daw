import type { ModelRevision } from '@/model/model-revision'
import { MutationPlanError } from './mutation-plan-error'
import {
  copyProjectMutationForPlan,
  invertNormalizedProjectMutation,
  type ProjectMutation,
} from './project-mutation'

export interface MutationPlan {
  readonly baseRevision: ModelRevision
  readonly forward: readonly ProjectMutation[]
  readonly inverse: readonly ProjectMutation[]
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
 * Builds a closed, reversible plan from forward mutations only. Inverse entries
 * are generated in reverse execution order so they can be applied directly.
 */
export function createMutationPlan(
  baseRevision: ModelRevision,
  forward: readonly ProjectMutation[],
): MutationPlan {
  assertBaseRevision(baseRevision)

  if (forward.length === 0) {
    throw new MutationPlanError(
      'empty-forward',
      'MutationPlan.forward must contain at least one mutation',
    )
  }

  const forwardCopy = Object.freeze(
    forward.map((mutation, index) => copyProjectMutationForPlan(mutation, index)),
  )
  const inverseCopy = Object.freeze([...forwardCopy].reverse().map(invertNormalizedProjectMutation))

  const plan: MutationPlan = Object.freeze({
    baseRevision,
    forward: forwardCopy,
    inverse: inverseCopy,
  })

  // Membership proves this frozen mutation sequence and inverse were paired by this factory.
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
