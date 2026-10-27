import { describe, expect, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  createAudioTrackRecord,
  createMasterChannelRecord,
  createMidiClipRecord,
  createProjectRecord,
  parseLinearGain,
} from '#internal/index'
import {
  createCompleteMutationScenario,
  snapshotModelReader,
  snapshotSemanticProjectFacts,
} from './support/mutation-applier-fixture'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { withMapSetInterceptor } from './support/map-set-interceptor'
import { DomainValueError } from '#internal/model/domain-value-error'
import { ModelInvariantError } from '#internal/model/invariant-validator'
import {
  INITIAL_MODEL_REVISION,
  nextModelRevision,
  parseModelRevision,
  type ModelRevision,
} from '#internal/model/model-revision'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PARTITIONED_TABLE_NAMES, RECORD_TABLE_NAMES } from '#internal/model/model-tables'
import { changeLabel } from '#internal/mutation/project-change'
import { ProjectedModelStoreReader } from '#internal/mutation/projected-model-store-reader'

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

  it('rejects revision exhaustion', () => {
    expect(() => nextModelRevision(Number.MAX_SAFE_INTEGER as ModelRevision)).toThrowError(
      new RangeError('Model revision cannot advance beyond Number.MAX_SAFE_INTEGER'),
    )
  })
})

describe('parseModelRevision', () => {
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects revision %s as a domain value',
    (value) => {
      expect(() => parseModelRevision(value)).toThrow(DomainValueError)
    },
  )
})

describe('MutationApplier revision checks', () => {
  it('rejects both replayed and independently stale plans without another write', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const replacementProject = createProjectReplacement(fixture)
    const winningPlan = createMutationPlan(store.modelRevision, [
      {
        op: 'replace',
        table: 'project',
        before: fixture.records.project,
        after: replacementProject,
      },
    ])
    const stalePlan = createMutationPlan(store.modelRevision, [
      {
        op: 'replace',
        table: 'master',
        before: fixture.records.master,
        after: createMasterReplacement(fixture),
      },
    ])

    expect(applier.apply(winningPlan)).toBe(1)
    const committed = snapshotModelReader(store)

    for (const rejectedPlan of [winningPlan, stalePlan]) {
      expect(() => applier.apply(rejectedPlan)).toThrowError(
        'MutationPlan revision 0 does not match ModelStore revision 1',
      )
      expect(snapshotModelReader(store)).toEqual(committed)
    }
  })

  it('grants exactly one MutationApplier lease for a ModelStore', () => {
    const store = new ModelStore(createCompleteProjectFixture().seed)

    expect(new MutationApplier(store)).toBeInstanceOf(MutationApplier)

    expect(() => new MutationApplier(store)).toThrowError(
      'ModelStore write access is unavailable or has already been claimed',
    )
  })
})

describe('MutationApplier complete transaction', () => {
  it('applies every table operation exactly like the materialized projection and commits once', () => {
    const { fixture, mutations } = createCompleteMutationScenario()
    const store = new ModelStore(fixture.seed)
    const plan = createMutationPlan(store.modelRevision, mutations)
    const projected = new ProjectedModelStoreReader(store, plan.forward)
    const expectedProjection = snapshotModelReader(projected)
    const applier = new MutationApplier(store)
    const everyOperation = [
      'project.replace',
      'master.replace',
      'trackOrder.insert',
      'trackOrder.remove',
      ...RECORD_TABLE_NAMES.flatMap((table) =>
        ['insert', 'remove', 'replace'].map((op) => `${table}.${op}`),
      ),
      ...PARTITIONED_TABLE_NAMES.flatMap((table) =>
        ['insert-partition', 'remove-partition', 'insert', 'remove', 'replace'].map(
          (op) => `${table}.${op}`,
        ),
      ),
    ]

    expect(plan.forward).toHaveLength(everyOperation.length)
    expect(new Set(plan.forward.map(changeLabel))).toEqual(new Set(everyOperation))

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
        op: 'replace',
        table: 'tracks',
        before: staleBefore,
        after: replacement,
      },
    ])
    const before = snapshotModelReader(store)

    expect(() => applier.apply(plan)).toThrowError(/^Change at index 0 \(tracks\.replace\) /)
    expect(snapshotModelReader(store)).toEqual(before)
  })

  it('passes through a final invariant error and performs zero writes', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const applier = new MutationApplier(store)
    const plan = createMutationPlan(store.modelRevision, [
      {
        op: 'remove',
        table: 'tracks',
        before: fixture.records.instrumentTrack,
      },
    ])
    const before = snapshotModelReader(store)

    const error = captureThrown(() => applier.apply(plan))

    expect(error).toBeInstanceOf(ModelInvariantError)
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
        op: 'replace',
        table: 'tracks',
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

    expect(error).toMatchObject({ message: expect.stringContaining('after 0 completed changes') })
    // A thrown undefined is still the cause.
    expect(Object.hasOwn(error as object, 'cause')).toBe(true)
    expect((error as Error).cause).toBe(injectedFailure)
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
        op: 'replace',
        table: 'project',
        before: fixture.records.project,
        after: replacementProject,
      },
      {
        op: 'replace',
        table: 'tracks',
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
      {
        op: 'replace',
        table: 'master',
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

    expect(error).toMatchObject({ message: expect.stringContaining('after 1 completed changes') })
    expect((error as Error).cause).toBe(injectedFailure)
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
        op: 'replace',
        table: 'tracks',
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
      {
        op: 'replace',
        table: 'clips',
        before: fixture.records.nonLoopClip,
        after: replacementClip,
      },
    ])
    const retryPlan = createMutationPlan(store.modelRevision, [
      {
        op: 'replace',
        table: 'project',
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

    expect(fatalError).toBeInstanceOf(AggregateError)
    expect(fatalError).toMatchObject({
      message: 'Failed to restore ModelStore after 1 applied changes',
    })
    expect((fatalError as AggregateError).errors).toHaveLength(2)
    expect((fatalError as AggregateError).errors[0]).toBe(applyCause)
    expect((fatalError as AggregateError).errors[1]).toBe(rollbackCause)
    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
    expect(store.getTrack(fixture.records.audioTrack.id)).toBe(replacementTrack)

    const faultedError = captureThrown(() => applier.apply(retryPlan))

    expect(faultedError).toMatchObject({
      message: 'MutationApplier is faulted after an unrecoverable rollback failure',
    })
    expect((faultedError as Error).cause).toBe(fatalError)
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
        op: 'replace',
        table: 'tracks',
        before: fixture.records.audioTrack,
        after: replacementTrack,
      },
    ])
    const innerPlan = createMutationPlan(store.modelRevision, [
      {
        op: 'replace',
        table: 'project',
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
    expect(nestedApplyError).toMatchObject({
      message: 'MutationApplier cannot apply a plan while another apply call is active',
    })
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
      'createMutationPlan',
      'MutationApplier',
      'ProjectedModelStoreReader',
      'registerModelStoreWriteAccess',
      'claimModelStoreWriteAccess',
    ]) {
      expect(projectCore).not.toHaveProperty(internalName)
    }
  })
})
