/**
 * Owns the only mutation-driven write lease for one ModelStore.
 *
 * Every plan is revision-checked and projected before authoritative state is touched; the
 * projection is the one full invariant check of a commit. Real writes use compare-and-swap
 * operations, and unexpected failures trigger inverse-prefix restoration.
 */
import { assertModelInvariants } from '#internal/model/invariant-validator'
import { nextModelRevision, type ModelRevision } from '#internal/model/model-revision'
import { ModelStore } from '#internal/model/model-store'
import {
  claimModelStoreWriteAccess,
  type ModelStoreWriteAccess,
} from '#internal/model/model-store-write-access'
import { MutationApplyError, MutationRollbackError } from './mutation-apply-error'
import { assertCreatedMutationPlan, type MutationPlan } from './mutation-plan'
import { describeMutation, type ProjectMutation } from './project-mutation'
import { ProjectedModelStoreReader } from './projected-model-store-reader'

export class MutationApplier {
  readonly #store: ModelStore
  readonly #writeAccess: ModelStoreWriteAccess
  #isApplying = false
  #fatalError: MutationRollbackError | null = null

  constructor(store: ModelStore) {
    // A writer lease must never make an already-invalid Store appear repairable by mutation.
    assertModelInvariants(store)

    this.#store = store
    this.#writeAccess = claimModelStoreWriteAccess(store)
  }

  /** Applies one closed plan and returns the single revision committed for it. */
  apply(plan: MutationPlan): ModelRevision {
    if (this.#fatalError !== null) {
      throw new MutationApplyError(
        'applier-faulted',
        'MutationApplier is faulted after an unrecoverable rollback failure',
        { cause: this.#fatalError },
      )
    }

    if (this.#isApplying) {
      throw new MutationApplyError(
        'reentrant-apply',
        'MutationApplier cannot apply a plan while another apply call is active',
      )
    }

    this.#isApplying = true

    try {
      return this.#applyOnce(plan)
    } finally {
      this.#isApplying = false
    }
  }

  #applyOnce(plan: MutationPlan): ModelRevision {
    // Membership is checked before reading plan fields, so Proxy/lookalike plans cannot drift.
    assertCreatedMutationPlan(plan)

    const currentRevision = this.#store.modelRevision

    if (plan.baseRevision !== currentRevision) {
      throw new MutationApplyError(
        'base-revision-mismatch',
        `MutationPlan revision ${plan.baseRevision} does not match ModelStore revision ${currentRevision}`,
        { baseRevision: plan.baseRevision, currentRevision },
      )
    }

    if (plan.forward.length === 0 || plan.forward.length !== plan.inverse.length) {
      throw new MutationApplyError(
        'invalid-plan-shape',
        'MutationPlan must contain equally sized, non-empty forward and inverse sequences',
        { baseRevision: plan.baseRevision, currentRevision },
      )
    }

    // Revision exhaustion is checked before projection or any authoritative container write.
    const nextRevision = nextModelRevision(currentRevision)

    // Projection owns rejection: its precondition and invariant errors pass through intact.
    // Writing the same mutations reproduces the projected state, which the applier spec pins
    // for every mutation type, so the written Store is not validated a second time.
    new ProjectedModelStoreReader(this.#store, plan.forward)

    let appliedMutationCount = 0

    try {
      for (const [index, mutation] of plan.forward.entries()) {
        this.#writeMutation(mutation, index)
        appliedMutationCount += 1
      }

      // No code that can fail belongs after the revision write in a successful transaction.
      this.#writeAccess.commitModelRevision(currentRevision, nextRevision)

      return nextRevision
    } catch (applyCause) {
      return this.#restoreOrFault(plan, appliedMutationCount, applyCause)
    }
  }

  #restoreOrFault(plan: MutationPlan, appliedMutationCount: number, applyCause: unknown): never {
    try {
      /**
       * inverse is stored for the entire forward sequence in reverse execution order.
       * If only the first k forward entries completed, their inverses are therefore the
       * final k entries—not the first k entries—of the inverse array.
       */
      const rollbackStart = plan.inverse.length - appliedMutationCount

      if (rollbackStart < 0) {
        throw new Error('MutationPlan inverse sequence is shorter than the applied prefix')
      }

      for (
        let inverseIndex = rollbackStart;
        inverseIndex < plan.inverse.length;
        inverseIndex += 1
      ) {
        this.#writeMutation(plan.inverse[inverseIndex]!, inverseIndex)
      }

      if (this.#store.modelRevision !== plan.baseRevision) {
        throw new Error(
          `Rollback restored revision ${this.#store.modelRevision}, expected ${plan.baseRevision}`,
        )
      }

      assertModelInvariants(this.#store)

      // Re-projecting verifies that all before references, explicit order, and partitions
      // required by the original plan are applicable again after restoration.
      new ProjectedModelStoreReader(this.#store, plan.forward)
    } catch (rollbackCause) {
      const fatalError = new MutationRollbackError(appliedMutationCount, applyCause, rollbackCause)

      this.#fatalError = fatalError
      throw fatalError
    }

    throw new MutationApplyError(
      'write-failed',
      `Mutation application failed after ${appliedMutationCount} completed mutations; defensive rollback completed and ModelStore was revalidated`,
      {
        appliedMutationCount,
        baseRevision: plan.baseRevision,
        currentRevision: this.#store.modelRevision,
        cause: applyCause,
      },
    )
  }

  #writeMutation(mutation: ProjectMutation, index: number): void {
    const step = describeMutation(mutation, index)

    switch (step.kind) {
      case 'project':
        this.#writeAccess.writeProject(step.before, step.after)
        return
      case 'master':
        this.#writeAccess.writeMaster(step.before, step.after)
        return
      case 'track-order':
        if (step.op === 'insert') this.#writeAccess.insertTrackOrder(step.index, step.trackId)
        else this.#writeAccess.removeTrackOrder(step.index, step.trackId)
        return
      case 'record':
        this.#writeAccess.writeRecord(step.table, step.before, step.after)
        return
      case 'partition':
        if (step.op === 'insert') {
          this.#writeAccess.insertPartition(step.table, step.sourceId, step.records)
        } else {
          this.#writeAccess.removePartition(step.table, step.sourceId, step.records)
        }
        return
      case 'partition-record':
        this.#writeAccess.writePartitionRecord(step.table, step.sourceId, step.before, step.after)
        return
    }
  }
}
