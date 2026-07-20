import { describe, expect, it, vi } from 'vitest'

import * as projectCore from '~/index'
import {
  createAudioTrackRecord,
  createMasterChannelRecord,
  createMidiClipRecord,
  createProjectRecord,
  parseLinearGain,
} from '~/index'
import {
  createCompleteMutationScenario,
  snapshotModelReader,
  snapshotSemanticProjectFacts,
} from './support/mutation-applier-fixture'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { ModelInvariantError } from '@/model/invariant-validator'
import {
  INITIAL_MODEL_REVISION,
  ModelRevisionError,
  nextModelRevision,
  type ModelRevision,
} from '@/model/model-revision'
import { ModelStore } from '@/model/model-store'
import { MutationApplier } from '@/mutation/mutation-applier'
import { MutationApplyError, MutationRollbackError } from '@/mutation/mutation-apply-error'
import { createMutationPlan, type MutationPlan } from '@/mutation/mutation-plan'
import { MutationPlanError } from '@/mutation/mutation-plan-error'
import { MutationPreconditionError } from '@/mutation/mutation-precondition-error'
import { PROJECT_MUTATION_TYPE } from '@/mutation/mutation-type'
import { ProjectedModelStoreReader } from '@/mutation/projected-model-store-reader'

const nativeMapSet = Map.prototype.set

function captureThrown(operation: () => unknown): unknown {
  let didThrow = false
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    didThrow = true
    caughtError = error
  }

  if (!didThrow) {
    throw new Error('Expected operation to throw')
  }

  return caughtError
}

/**
 * Intercepts only Map.set calls selected by exact key and value identity. Projection tables
 * store patch wrappers, so matching an entity Record reaches the authoritative Store write
 * without importing or exposing the private writer capability.
 */
function withMapSetInterceptor<Result>(
  intercept: (key: unknown, value: unknown) => void,
  operation: () => Result,
): Result {
  const setSpy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (
    this: Map<unknown, unknown>,
    key: unknown,
    value: unknown,
  ) {
    intercept(key, value)
    nativeMapSet.call(this, key, value)
    return this
  })

  try {
    return operation()
  } finally {
    setSpy.mockRestore()
  }
}

function createProjectReplacement(fixture: ReturnType<typeof createCompleteProjectFixture>) {
  return createProjectRecord({
    id: fixture.records.project.id,
    name: 'Mutation Applier Project',
  })
}

function createAudioTrackReplacement(fixture: ReturnType<typeof createCompleteProjectFixture>) {
  return createAudioTrackRecord({
    id: fixture.records.audioTrack.id,
    name: 'Mutation Applier Audio Track',
    color: fixture.records.audioTrack.color,
    channel: fixture.records.audioTrack.channel,
    audioEffectIds: fixture.records.audioTrack.audioEffectIds,
  })
}

function createMasterReplacement(fixture: ReturnType<typeof createCompleteProjectFixture>) {
  return createMasterChannelRecord({
    gain: parseLinearGain(0.65),
    muted: true,
    audioEffectIds: fixture.records.master.audioEffectIds,
  })
}

describe('nextModelRevision', () => {
  it('advances zero and the largest still-advanceable safe revision exactly once', () => {
    expect(nextModelRevision(INITIAL_MODEL_REVISION)).toBe(1)
    expect(nextModelRevision((Number.MAX_SAFE_INTEGER - 1) as ModelRevision)).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })

  it('rejects revision exhaustion with the exhausted value attached', () => {
    const error = captureThrown(() => nextModelRevision(Number.MAX_SAFE_INTEGER as ModelRevision))

    expect(error).toBeInstanceOf(ModelRevisionError)
    expect(error).toMatchObject({
      code: 'model-revision-overflow',
      revision: Number.MAX_SAFE_INTEGER,
    })
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid current revision %s',
    (value) => {
      const error = captureThrown(() => nextModelRevision(value as ModelRevision))

      expect(error).toBeInstanceOf(ModelRevisionError)
      expect(error).toMatchObject({ code: 'invalid-model-revision', revision: value })
    },
  )
})

describe('MutationApplier plan admission and revision checks', () => {
  it('accepts the factory-created plan but rejects a frozen structural lookalike with no writes', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementProject = createProjectReplacement(fixture)
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: replacementProject,
      },
    ])
    const forgedPlan = Object.freeze({
      baseRevision: plan.baseRevision,
      forward: plan.forward,
      inverse: plan.inverse,
    }) as MutationPlan
    const before = snapshotModelReader(store)

    const error = captureThrown(() => applier.apply(forgedPlan))

    expect(error).toBeInstanceOf(MutationPlanError)
    expect(error).toMatchObject({ code: 'unrecognized-plan' })
    expect(snapshotModelReader(store)).toEqual(before)

    expect(applier.apply(plan)).toBe(1)
    expect(store.project).toBe(replacementProject)
    expect(store.modelRevision).toBe(1)
  })

  it('rejects both replayed and independently stale plans without another write', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementProject = createProjectReplacement(fixture)
    const winningPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: replacementProject,
      },
    ])
    const stalePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
        before: fixture.records.master,
        after: createMasterReplacement(fixture),
      },
    ])

    expect(applier.apply(winningPlan)).toBe(1)
    const committed = snapshotModelReader(store)

    for (const rejectedPlan of [winningPlan, stalePlan]) {
      const error = captureThrown(() => applier.apply(rejectedPlan))

      expect(error).toBeInstanceOf(MutationApplyError)
      expect(error).toMatchObject({
        code: 'base-revision-mismatch',
        baseRevision: INITIAL_MODEL_REVISION,
        currentRevision: 1,
      })
      expect(snapshotModelReader(store)).toEqual(committed)
    }
  })

  it('grants exactly one MutationApplier lease for a ModelStore', () => {
    const store = new ModelStore(createCompleteProjectFixture().seed)

    expect(new MutationApplier(store)).toBeInstanceOf(MutationApplier)

    const error = captureThrown(() => new MutationApplier(store))

    expect(error).toMatchObject({
      name: 'ModelStoreWriteAccessError',
      code: 'write-access-unavailable',
    })
  })
})

describe('MutationApplier complete transaction', () => {
  it('applies all 27 mutation types exactly like the materialized projection and commits once', () => {
    const { fixture, mutations } = createCompleteMutationScenario()
    const store = new ModelStore(fixture.seed)
    const plan = createMutationPlan(store.modelRevision, mutations)
    const projected = new ProjectedModelStoreReader(store, plan.forward)
    const expectedProjection = snapshotModelReader(projected)
    const applier = new MutationApplier(store)
    const canonicalMutationTypes = Object.values(PROJECT_MUTATION_TYPE).flatMap((typeGroup) =>
      Object.values(typeGroup),
    )

    expect(plan.forward).toHaveLength(27)
    expect(new Set(plan.forward.map(({ type }) => type))).toEqual(new Set(canonicalMutationTypes))

    const committedRevision = applier.apply(plan)
    const actual = snapshotModelReader(store)

    expect(committedRevision).toBe(1)
    expect(store.modelRevision).toBe(1)
    expect({ ...actual, revision: expectedProjection.revision }).toEqual(expectedProjection)
  })

  it('applies inverse as a new commit and restores facts while revisions advance 0 -> 1 -> 2', () => {
    const { fixture, mutations } = createCompleteMutationScenario()
    const store = new ModelStore(fixture.seed)
    const originalFacts = snapshotSemanticProjectFacts(store)
    const originalPhysicalClipOrder = [...store.clipEntries()].map(([clipId]) => clipId)
    const applier = new MutationApplier(store)
    const forwardPlan = createMutationPlan(store.modelRevision, mutations)

    expect(store.modelRevision).toBe(0)
    expect(applier.apply(forwardPlan)).toBe(1)

    const inversePlan = createMutationPlan(store.modelRevision, forwardPlan.inverse)

    expect(applier.apply(inversePlan)).toBe(2)
    expect(store.modelRevision).toBe(2)
    expect(snapshotSemanticProjectFacts(store)).toEqual(originalFacts)
    expect(store.project).toBe(fixture.records.project)
    expect(store.master).toBe(fixture.records.master)
    expect(store.getTrack(fixture.records.audioTrack.id)).toBe(fixture.records.audioTrack)
    expect([...store.clipEntries()].map(([clipId]) => clipId)).not.toEqual(
      originalPhysicalClipOrder,
    )
  })
})

describe('MutationApplier validation failures', () => {
  it('passes through a local precondition error and performs zero writes', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const staleBefore = createAudioTrackReplacement(fixture)
    const replacement = createAudioTrackRecord({
      ...staleBefore,
      name: 'Never Applied Track',
    })
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: staleBefore,
        after: replacement,
      },
    ])
    const before = snapshotModelReader(store)

    const error = captureThrown(() => applier.apply(plan))

    expect(error).toBeInstanceOf(MutationPreconditionError)
    expect(error).toMatchObject({
      code: 'before-reference-mismatch',
      mutationIndex: 0,
      mutationType: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
    })
    expect(error).not.toBeInstanceOf(MutationApplyError)
    expect(snapshotModelReader(store)).toEqual(before)
  })

  it('passes through a final invariant error and performs zero writes', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
        before: fixture.records.instrumentTrack,
      },
    ])
    const before = snapshotModelReader(store)

    const error = captureThrown(() => applier.apply(plan))

    expect(error).toBeInstanceOf(ModelInvariantError)
    expect(error).not.toBeInstanceOf(MutationApplyError)
    expect(snapshotModelReader(store)).toEqual(before)
  })
})

describe('MutationApplier defensive restoration', () => {
  it('restores cleanly when the first authoritative write fails', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementTrack = createAudioTrackReplacement(fixture)
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
    ])
    const before = snapshotModelReader(store)
    const injectedFailure: unknown = undefined

    const error = captureThrown(() =>
      withMapSetInterceptor(
        (key, value) => {
          if (key === replacementTrack.id && value === replacementTrack) {
            throw injectedFailure
          }
        },
        () => applier.apply(plan),
      ),
    )

    expect(error).toBeInstanceOf(MutationApplyError)
    expect(error).toMatchObject({ code: 'write-failed', appliedMutationCount: 0 })
    expect(Object.hasOwn(error as object, 'failureCause')).toBe(true)
    expect((error as MutationApplyError).failureCause).toBe(injectedFailure)
    expect(snapshotModelReader(store)).toEqual(before)
  })

  it('uses the inverse suffix for the completed prefix and restores a middle failure', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementProject = createProjectReplacement(fixture)
    const replacementTrack = createAudioTrackReplacement(fixture)
    const replacementMaster = createMasterReplacement(fixture)
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: replacementProject,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
      {
        type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
        before: fixture.records.master,
        after: replacementMaster,
      },
    ])
    const before = snapshotModelReader(store)
    const injectedFailure = new Error('injected middle-write failure')

    const error = captureThrown(() =>
      withMapSetInterceptor(
        (key, value) => {
          if (key === replacementTrack.id && value === replacementTrack) {
            throw injectedFailure
          }
        },
        () => applier.apply(plan),
      ),
    )

    expect(error).toBeInstanceOf(MutationApplyError)
    expect(error).toMatchObject({ code: 'write-failed', appliedMutationCount: 1 })
    expect((error as MutationApplyError).cause).toBe(injectedFailure)
    expect((error as MutationApplyError).failureCause).toBe(injectedFailure)
    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
    expect(store.project).toBe(fixture.records.project)
    expect(store.master).toBe(fixture.records.master)
    expect(snapshotModelReader(store)).toEqual(before)
  })

  it('latches faulted state when rollback fails and preserves both causes', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementTrack = createAudioTrackReplacement(fixture)
    const replacementClip = createMidiClipRecord({
      ...fixture.records.nonLoopClip,
      name: 'Rollback Failure Clip',
    })
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.REPLACE,
        before: fixture.records.nonLoopClip,
        after: replacementClip,
      },
    ])
    const retryPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: createProjectReplacement(fixture),
      },
    ])
    const applyCause = new Error('injected forward failure')
    const rollbackCause = new Error('injected rollback failure')
    let forwardFailed = false

    const fatalError = captureThrown(() =>
      withMapSetInterceptor(
        (key, value) => {
          if (key === replacementClip.id && value === replacementClip) {
            forwardFailed = true
            throw applyCause
          }

          if (
            forwardFailed &&
            key === fixture.records.audioTrack.id &&
            value === fixture.records.audioTrack
          ) {
            throw rollbackCause
          }
        },
        () => applier.apply(plan),
      ),
    )

    expect(fatalError).toBeInstanceOf(MutationRollbackError)
    expect(fatalError).toMatchObject({
      code: 'rollback-failed',
      appliedMutationCount: 1,
      applyCause,
      rollbackCause,
    })
    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
    expect(store.getTrack(fixture.records.audioTrack.id)).toBe(replacementTrack)

    const faultedError = captureThrown(() => applier.apply(retryPlan))

    expect(faultedError).toBeInstanceOf(MutationApplyError)
    expect(faultedError).toMatchObject({ code: 'applier-faulted' })
    expect((faultedError as MutationApplyError).cause).toBe(fatalError)
    expect(store.project).toBe(fixture.records.project)
    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
  })

  it('rejects a nested apply while allowing the outer transaction to finish once', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementTrack = createAudioTrackReplacement(fixture)
    const outerPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
    ])
    const innerPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: createProjectReplacement(fixture),
      },
    ])
    let nestedApplyError: unknown
    let attemptedReentry = false

    const committedRevision = withMapSetInterceptor(
      (key, value) => {
        if (!attemptedReentry && key === replacementTrack.id && value === replacementTrack) {
          attemptedReentry = true
          nestedApplyError = captureThrown(() => applier.apply(innerPlan))
        }
      },
      () => applier.apply(outerPlan),
    )

    expect(committedRevision).toBe(1)
    expect(nestedApplyError).toBeInstanceOf(MutationApplyError)
    expect(nestedApplyError).toMatchObject({ code: 'reentrant-apply' })
    expect(store.project).toBe(fixture.records.project)
    expect(store.getTrack(fixture.records.audioTrack.id)).toBe(replacementTrack)
    expect(store.modelRevision).toBe(1)
  })
})

describe('Mutation infrastructure package boundary', () => {
  it('keeps stores, plans, appliers, revision mechanics, and write access off the root API', () => {
    for (const internalName of [
      'ModelStore',
      'INITIAL_MODEL_REVISION',
      'nextModelRevision',
      'ModelRevisionError',
      'createMutationPlan',
      'MutationPlanError',
      'MutationApplier',
      'MutationApplyError',
      'MutationRollbackError',
      'ProjectedModelStoreReader',
      'MutationPreconditionError',
      'registerModelStoreWriteAccess',
      'claimModelStoreWriteAccess',
      'ModelStoreWriteAccessError',
    ]) {
      expect(projectCore).not.toHaveProperty(internalName)
    }
  })
})
