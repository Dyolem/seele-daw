/**
 * Owns the only mutation-driven write lease for one ModelStore.
 *
 * Every plan is revision-checked and projected before authoritative state is touched.
 * Real writes use compare-and-swap operations, revision advances only after the final
 * invariant check, and unexpected failures trigger inverse-prefix restoration.
 */
import { assertModelInvariants } from '@/model/invariant-validator'
import { nextModelRevision, type ModelRevision } from '@/model/model-revision'
import { ModelStore } from '@/model/model-store'
import {
  claimModelStoreWriteAccess,
  type ModelStoreWriteAccess,
} from '@/model/model-store-write-access'
import { MutationApplyError, MutationRollbackError } from './mutation-apply-error'
import { assertCreatedMutationPlan, type MutationPlan } from './mutation-plan'
import { MutationPlanError } from './mutation-plan-error'
import { PROJECT_MUTATION_TYPE } from './mutation-type'
import type { ProjectMutation } from './project-mutation'
import { ProjectedModelStoreReader } from './projected-model-store-reader'

function rejectUnknownMutation(mutation: never, index: number): never {
  const type = (mutation as { readonly type?: unknown }).type

  throw new MutationPlanError(
    'unknown-mutation-type',
    `Mutation at index ${index} has an unknown type: ${String(type)}`,
    index,
  )
}

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

    // Projection owns normal rejection: its precondition and invariant errors pass through intact.
    new ProjectedModelStoreReader(this.#store, plan.forward)

    let appliedMutationCount = 0

    try {
      for (const [index, mutation] of plan.forward.entries()) {
        this.#writeMutation(mutation, index)
        appliedMutationCount += 1
      }

      // This second check is defensive: it catches drift between projection and real dispatch.
      assertModelInvariants(this.#store)

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
    switch (mutation.type) {
      case PROJECT_MUTATION_TYPE.PROJECT.REPLACE:
        this.#writeAccess.writeProject(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.MASTER.REPLACE:
        this.#writeAccess.writeMaster(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.TRACK.INSERT:
        this.#writeAccess.writeTrack(undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.TRACK.REMOVE:
        this.#writeAccess.writeTrack(mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.TRACK.REPLACE:
        this.#writeAccess.writeTrack(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.CLIP.INSERT:
        this.#writeAccess.writeClip(undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
        this.#writeAccess.writeClip(mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.CLIP.REPLACE:
        this.#writeAccess.writeClip(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
        this.#writeAccess.writeMidiSource(undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE:
        this.#writeAccess.writeMidiSource(mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE:
        this.#writeAccess.writeMidiSource(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
        this.#writeAccess.writeTempoEvent(undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
        this.#writeAccess.writeTempoEvent(mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
        this.#writeAccess.writeTempoEvent(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT:
        this.#writeAccess.writeTimeSignatureEvent(undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE:
        this.#writeAccess.writeTimeSignatureEvent(mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE:
        this.#writeAccess.writeTimeSignatureEvent(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
        this.#writeAccess.writeDevice(undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.DEVICE.REMOVE:
        this.#writeAccess.writeDevice(mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
        this.#writeAccess.writeDevice(mutation.before, mutation.after)
        return

      case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
        this.#writeAccess.insertTrackOrder(mutation.index, mutation.trackId)
        return
      case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
        this.#writeAccess.removeTrackOrder(mutation.index, mutation.trackId)
        return

      case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
        this.#writeAccess.insertMidiNotePartition(mutation.sourceId, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
        this.#writeAccess.removeMidiNotePartition(mutation.sourceId, mutation.before)
        return

      case PROJECT_MUTATION_TYPE.NOTE.INSERT:
        this.#writeAccess.writeMidiNote(mutation.sourceId, undefined, mutation.after)
        return
      case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
        this.#writeAccess.writeMidiNote(mutation.sourceId, mutation.before, undefined)
        return
      case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
        this.#writeAccess.writeMidiNote(mutation.sourceId, mutation.before, mutation.after)
        return

      default:
        return rejectUnknownMutation(mutation, index)
    }
  }
}
