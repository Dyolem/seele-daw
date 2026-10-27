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
import type { MutationPlan } from './mutation-plan'
import { changeAfter, changeBefore, type ProjectChange } from './project-change'
import { ProjectedModelStoreReader } from './projected-model-store-reader'

export class MutationApplier {
  readonly #store: ModelStore
  readonly #writeAccess: ModelStoreWriteAccess
  #isApplying = false
  /** Set once a rollback failed: the Store can no longer be trusted, so nothing more applies. */
  #fatalError: AggregateError | null = null

  constructor(store: ModelStore) {
    // A writer lease must never make an already-invalid Store appear repairable by mutation.
    assertModelInvariants(store)

    this.#store = store
    this.#writeAccess = claimModelStoreWriteAccess(store)
  }

  /** Applies one plan and returns the single revision committed for it. */
  apply(plan: MutationPlan): ModelRevision {
    if (this.#fatalError !== null) {
      throw new Error('MutationApplier is faulted after an unrecoverable rollback failure', {
        cause: this.#fatalError,
      })
    }

    if (this.#isApplying) {
      throw new Error('MutationApplier cannot apply a plan while another apply call is active')
    }

    this.#isApplying = true

    try {
      return this.#applyOnce(plan)
    } finally {
      this.#isApplying = false
    }
  }

  #applyOnce(plan: MutationPlan): ModelRevision {
    const currentRevision = this.#store.modelRevision

    if (plan.baseRevision !== currentRevision) {
      throw new Error(
        `MutationPlan revision ${plan.baseRevision} does not match ModelStore revision ${currentRevision}`,
      )
    }

    // Revision exhaustion is checked before projection or any authoritative container write.
    const nextRevision = nextModelRevision(currentRevision)

    // Projection owns rejection: its precondition and invariant errors pass through intact.
    // Writing the same changes reproduces the projected state, which the applier spec pins
    // for every table and operation, so the written Store is not validated a second time.
    new ProjectedModelStoreReader(this.#store, plan.forward)

    let appliedChangeCount = 0

    try {
      for (const change of plan.forward) {
        this.#writeChange(change)
        appliedChangeCount += 1
      }

      // No code that can fail belongs after the revision write in a successful transaction.
      this.#writeAccess.commitModelRevision(currentRevision, nextRevision)

      return nextRevision
    } catch (applyCause) {
      return this.#restoreOrFault(plan, appliedChangeCount, applyCause)
    }
  }

  #restoreOrFault(plan: MutationPlan, appliedChangeCount: number, applyCause: unknown): never {
    try {
      /**
       * inverse is stored for the entire forward sequence in reverse execution order.
       * If only the first k forward entries completed, their inverses are therefore the
       * final k entries—not the first k entries—of the inverse array.
       */
      for (
        let inverseIndex = plan.inverse.length - appliedChangeCount;
        inverseIndex < plan.inverse.length;
        inverseIndex += 1
      ) {
        this.#writeChange(plan.inverse[inverseIndex]!)
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
      this.#fatalError = new AggregateError(
        [applyCause, rollbackCause],
        `Failed to restore ModelStore after ${appliedChangeCount} applied changes`,
      )
      throw this.#fatalError
    }

    throw new Error(
      `Applying the plan failed after ${appliedChangeCount} completed changes; rollback completed and ModelStore was revalidated`,
      { cause: applyCause },
    )
  }

  #writeChange(change: ProjectChange): void {
    switch (change.table) {
      case 'project':
        this.#writeAccess.writeProject(change.before, change.after)
        return
      case 'master':
        this.#writeAccess.writeMaster(change.before, change.after)
        return
      case 'trackOrder':
        if (change.op === 'insert') this.#writeAccess.insertTrackOrder(change.index, change.trackId)
        else this.#writeAccess.removeTrackOrder(change.index, change.trackId)
        return
      default:
        if (!('sourceId' in change)) {
          this.#writeAccess.writeRecord(change.table, changeBefore(change), changeAfter(change))
        } else if (change.op === 'insert-partition') {
          this.#writeAccess.insertPartition(change.table, change.sourceId, change.records)
        } else if (change.op === 'remove-partition') {
          this.#writeAccess.removePartition(change.table, change.sourceId, change.records)
        } else {
          this.#writeAccess.writePartitionRecord(
            change.table,
            change.sourceId,
            changeBefore(change),
            changeAfter(change),
          )
        }
    }
  }
}
