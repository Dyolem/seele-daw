import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '~/index'
import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAudioTrackRecord,
  createDeviceDescriptor,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseLinearGain,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoBpm,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
} from '~/index'
import { createCompleteProjectFixture } from './fixtures/complete-project-fixture'
import type { ModelRevision } from '@/model/model-revision'
import { INITIAL_MODEL_REVISION } from '@/model/model-revision'
import { MutationPlanError } from '@/mutation/mutation-plan-error'
import { createMutationPlan } from '@/mutation/mutation-plan'
import { invertProjectMutation, type ProjectMutation } from '@/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE, type ProjectMutationType } from '@/mutation/mutation-type'

interface MutationExample {
  readonly label: string
  readonly mutation: ProjectMutation
}

function createMutationExamples(): readonly MutationExample[] {
  const fixture = createCompleteProjectFixture()
  const { records } = fixture
  const replacementProject = createProjectRecord({
    id: records.project.id,
    name: 'Updated Project',
  })
  const replacementMaster = createMasterChannelRecord({
    gain: parseLinearGain(0.75),
    muted: true,
    audioEffectIds: records.master.audioEffectIds,
  })
  const replacementTrack = createAudioTrackRecord({
    id: records.audioTrack.id,
    name: 'Updated Audio Track',
    color: records.audioTrack.color,
    channel: records.audioTrack.channel,
    audioEffectIds: records.audioTrack.audioEffectIds,
  })
  const replacementClip = createMidiClipRecord({
    ...records.nonLoopClip,
    name: 'Updated Clip',
  })
  const replacementSource = createMidiSourceRecord({
    id: records.nonLoopSource.id,
    lengthTick: parseTick(2_400),
  })
  const replacementTempoEvent = createTempoEventRecord({
    ...records.laterTempoEvent,
    bpm: parseTempoBpm(132),
  })
  const replacementTimeSignatureEvent = createTimeSignatureEventRecord({
    ...records.laterTimeSignatureEvent,
    numerator: parseTimeSignatureNumerator(5),
    denominator: parseTimeSignatureDenominator(4),
  })
  const replacementDevice = createDeviceDescriptor({
    id: records.instrumentDevice.id,
    typeId: records.instrumentDevice.typeId,
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: false,
    parameters: records.instrumentDevice.parameters,
    opaqueState: records.instrumentDevice.opaqueState,
  })
  const replacementNote = createMidiNoteRecord({
    ...records.nonLoopNote,
    velocity: parseMidiVelocity(112),
  })
  const partition = [records.nonLoopNote, records.nonLoopHarmonyNote]

  return [
    {
      label: 'project replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: records.project,
        after: replacementProject,
      },
    },
    {
      label: 'master replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
        before: records.master,
        after: replacementMaster,
      },
    },
    {
      label: 'track insert',
      mutation: { type: PROJECT_MUTATION_TYPE.TRACK.INSERT, after: records.audioTrack },
    },
    {
      label: 'track remove',
      mutation: { type: PROJECT_MUTATION_TYPE.TRACK.REMOVE, before: records.audioTrack },
    },
    {
      label: 'track replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: records.audioTrack,
        after: replacementTrack,
      },
    },
    {
      label: 'clip insert',
      mutation: { type: PROJECT_MUTATION_TYPE.CLIP.INSERT, after: records.nonLoopClip },
    },
    {
      label: 'clip remove',
      mutation: { type: PROJECT_MUTATION_TYPE.CLIP.REMOVE, before: records.nonLoopClip },
    },
    {
      label: 'clip replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.CLIP.REPLACE,
        before: records.nonLoopClip,
        after: replacementClip,
      },
    },
    {
      label: 'MIDI Source insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: records.nonLoopSource,
      },
    },
    {
      label: 'MIDI Source remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE,
        before: records.nonLoopSource,
      },
    },
    {
      label: 'MIDI Source replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE,
        before: records.nonLoopSource,
        after: replacementSource,
      },
    },
    {
      label: 'Tempo Event insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
        after: records.laterTempoEvent,
      },
    },
    {
      label: 'Tempo Event remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
        before: records.laterTempoEvent,
      },
    },
    {
      label: 'Tempo Event replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before: records.laterTempoEvent,
        after: replacementTempoEvent,
      },
    },
    {
      label: 'Time Signature Event insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT,
        after: records.laterTimeSignatureEvent,
      },
    },
    {
      label: 'Time Signature Event remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE,
        before: records.laterTimeSignatureEvent,
      },
    },
    {
      label: 'Time Signature Event replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE,
        before: records.laterTimeSignatureEvent,
        after: replacementTimeSignatureEvent,
      },
    },
    {
      label: 'Device insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.DEVICE.INSERT,
        after: records.instrumentDevice,
      },
    },
    {
      label: 'Device remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.DEVICE.REMOVE,
        before: records.instrumentDevice,
      },
    },
    {
      label: 'Device replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
        before: records.instrumentDevice,
        after: replacementDevice,
      },
    },
    {
      label: 'track-order insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
        index: 1,
        trackId: records.audioTrack.id,
      },
    },
    {
      label: 'track-order remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE,
        index: 1,
        trackId: records.audioTrack.id,
      },
    },
    {
      label: 'Note partition insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: records.nonLoopSource.id,
        after: partition,
      },
    },
    {
      label: 'Note partition remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
        sourceId: records.nonLoopSource.id,
        before: partition,
      },
    },
    {
      label: 'Note insert',
      mutation: {
        type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
        sourceId: records.nonLoopSource.id,
        after: records.nonLoopNote,
      },
    },
    {
      label: 'Note remove',
      mutation: {
        type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
        sourceId: records.nonLoopSource.id,
        before: records.nonLoopNote,
      },
    },
    {
      label: 'Note replace',
      mutation: {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: records.nonLoopSource.id,
        before: records.nonLoopNote,
        after: replacementNote,
      },
    },
  ]
}

function recordReferences(mutation: ProjectMutation): readonly object[] {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.PROJECT.REPLACE:
    case PROJECT_MUTATION_TYPE.MASTER.REPLACE:
    case PROJECT_MUTATION_TYPE.TRACK.REPLACE:
    case PROJECT_MUTATION_TYPE.CLIP.REPLACE:
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE:
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE:
    case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
    case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
      return [mutation.before, mutation.after]

    case PROJECT_MUTATION_TYPE.TRACK.INSERT:
    case PROJECT_MUTATION_TYPE.CLIP.INSERT:
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT:
    case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
    case PROJECT_MUTATION_TYPE.NOTE.INSERT:
      return [mutation.after]

    case PROJECT_MUTATION_TYPE.TRACK.REMOVE:
    case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE:
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE:
    case PROJECT_MUTATION_TYPE.DEVICE.REMOVE:
    case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
      return [mutation.before]

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
      return mutation.after
    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
      return mutation.before

    case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
    case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
      return []
  }
}

function expectSameRecordReferences(actual: ProjectMutation, expected: ProjectMutation): void {
  const actualReferences = recordReferences(actual)
  const expectedReferences = recordReferences(expected)

  expect(actualReferences).toHaveLength(expectedReferences.length)

  expectedReferences.forEach((reference, index) => {
    expect(actualReferences[index]).toBe(reference)
  })
}

function mutationLocation(mutation: ProjectMutation): Readonly<Record<string, number | string>> {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
    case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
      return { index: mutation.index, trackId: mutation.trackId }

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
    case PROJECT_MUTATION_TYPE.NOTE.INSERT:
    case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
    case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
      return { sourceId: mutation.sourceId }

    default:
      return {}
  }
}

function captureMutationPlanError(operation: () => unknown): MutationPlanError {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(MutationPlanError)

  if (!(caughtError instanceof MutationPlanError)) {
    throw new Error('Expected a MutationPlanError')
  }

  return caughtError
}

describe('PROJECT_MUTATION_TYPE contract', () => {
  it('matches the ProjectMutation discriminant union in both type directions', () => {
    expectTypeOf<ProjectMutation['type']>().toEqualTypeOf<ProjectMutationType>()
  })

  it('contains exactly 27 unique runtime mutation names', () => {
    const mutationTypes = Object.values(PROJECT_MUTATION_TYPE).flatMap((group) =>
      Object.values(group),
    )
    const exampleTypes = createMutationExamples().map(({ mutation }) => mutation.type)

    expect(mutationTypes).toHaveLength(27)
    expect(new Set(mutationTypes)).toHaveLength(27)
    expect(new Set(exampleTypes)).toEqual(new Set(mutationTypes))
  })
})

describe('invertProjectMutation', () => {
  it('inverts Project and Master replacements by swapping the same record references', () => {
    const [projectExample, masterExample] = createMutationExamples()

    if (projectExample?.mutation.type !== PROJECT_MUTATION_TYPE.PROJECT.REPLACE) {
      throw new Error('Expected the Project replacement example first')
    }

    if (masterExample?.mutation.type !== PROJECT_MUTATION_TYPE.MASTER.REPLACE) {
      throw new Error('Expected the Master replacement example second')
    }

    const projectInverse = invertProjectMutation(projectExample.mutation)
    const masterInverse = invertProjectMutation(masterExample.mutation)

    expect(projectInverse).toEqual({
      type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
      before: projectExample.mutation.after,
      after: projectExample.mutation.before,
    })
    expect(masterInverse).toEqual({
      type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
      before: masterExample.mutation.after,
      after: masterExample.mutation.before,
    })

    if (
      projectInverse.type !== PROJECT_MUTATION_TYPE.PROJECT.REPLACE ||
      masterInverse.type !== PROJECT_MUTATION_TYPE.MASTER.REPLACE
    ) {
      throw new Error('Replacement inverses changed mutation kind')
    }

    expect(projectInverse.before).toBe(projectExample.mutation.after)
    expect(projectInverse.after).toBe(projectExample.mutation.before)
    expect(masterInverse.before).toBe(masterExample.mutation.after)
    expect(masterInverse.after).toBe(masterExample.mutation.before)
  })

  it('inverts insert, remove, and replace for all six top-level entity tables', () => {
    const entityExamples = createMutationExamples().slice(2, 20)

    for (const { label, mutation } of entityExamples) {
      const inverse = invertProjectMutation(mutation)
      const expectedType = mutation.type.endsWith('.insert')
        ? mutation.type.replace('.insert', '.remove')
        : mutation.type.endsWith('.remove')
          ? mutation.type.replace('.remove', '.insert')
          : mutation.type

      expect({ label, type: inverse.type }).toEqual({ label, type: expectedType })
      expect({ label, references: recordReferences(inverse) }).toEqual({
        label,
        references: [...recordReferences(mutation)].reverse(),
      })
      recordReferences(mutation).forEach((reference) => {
        expect(recordReferences(inverse)).toContain(reference)
      })
    }
  })

  it('inverts track-order, Note partition, and Note mutations', () => {
    const structuralExamples = createMutationExamples().slice(20)
    const expectedTypes = [
      PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE,
      PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
      PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
      PROJECT_MUTATION_TYPE.NOTE.REMOVE,
      PROJECT_MUTATION_TYPE.NOTE.INSERT,
      PROJECT_MUTATION_TYPE.NOTE.REPLACE,
    ]

    structuralExamples.forEach(({ label, mutation }, index) => {
      const inverse = invertProjectMutation(mutation)

      expect({ label, type: inverse.type }).toEqual({ label, type: expectedTypes[index] })
      expect(mutationLocation(inverse)).toEqual(mutationLocation(mutation))

      const expectedReferences =
        mutation.type === PROJECT_MUTATION_TYPE.NOTE.REPLACE
          ? [...recordReferences(mutation)].reverse()
          : recordReferences(mutation)

      expect({ label, references: recordReferences(inverse) }).toEqual({
        label,
        references: expectedReferences,
      })
      recordReferences(mutation).forEach((reference) => {
        expect(recordReferences(inverse)).toContain(reference)
      })
    })
  })

  it('returns the original structure and record references after a double inverse', () => {
    for (const { label, mutation } of createMutationExamples()) {
      const doubleInverse = invertProjectMutation(invertProjectMutation(mutation))

      expect({ label, mutation: doubleInverse }).toEqual({ label, mutation })
      expect(Object.isFrozen(doubleInverse)).toBe(true)
      expectSameRecordReferences(doubleInverse, mutation)
    }
  })
})

describe('createMutationPlan', () => {
  it('builds inverse entries from the forward entries in reverse execution order', () => {
    const forward = createMutationExamples().map(({ mutation }) => mutation)
    const plan = createMutationPlan(INITIAL_MODEL_REVISION, forward)

    expect(plan.inverse).toHaveLength(plan.forward.length)

    plan.inverse.forEach((inverse, index) => {
      const forwardIndex = plan.forward.length - 1 - index
      const sourceMutation = plan.forward[forwardIndex]

      if (sourceMutation === undefined) {
        throw new Error('MutationPlan lost a forward entry')
      }

      const expectedInverse = invertProjectMutation(sourceMutation)

      expect(inverse).toEqual(expectedInverse)
      expectSameRecordReferences(inverse, expectedInverse)
    })
  })

  it('copies and freezes the plan, wrappers, arrays, and Note partition payload', () => {
    const fixture = createCompleteProjectFixture()
    const externalPartition = [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote]
    const partitionMutation = {
      type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
      sourceId: fixture.records.nonLoopSource.id,
      after: externalPartition,
    }
    const trackOrderMutation = {
      type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      index: 1,
      trackId: fixture.records.audioTrack.id,
    }
    const externalForward: ProjectMutation[] = [partitionMutation, trackOrderMutation]
    const plan = createMutationPlan(INITIAL_MODEL_REVISION, externalForward)

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.forward)).toBe(true)
    expect(Object.isFrozen(plan.inverse)).toBe(true)
    expect(plan.forward).not.toBe(externalForward)
    expect(plan.forward[0]).not.toBe(partitionMutation)
    expect(plan.forward[1]).not.toBe(trackOrderMutation)
    expect(plan.forward.every(Object.isFrozen)).toBe(true)
    expect(plan.inverse.every(Object.isFrozen)).toBe(true)

    const forwardPartition = plan.forward[0]
    const inversePartition = plan.inverse[1]

    if (forwardPartition?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT) {
      throw new Error('Expected the copied forward Note partition insertion')
    }

    if (inversePartition?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE) {
      throw new Error('Expected the inverse Note partition removal')
    }

    expect(forwardPartition.after).not.toBe(externalPartition)
    expect(inversePartition.before).not.toBe(externalPartition)
    expect(Object.isFrozen(forwardPartition.after)).toBe(true)
    expect(Object.isFrozen(inversePartition.before)).toBe(true)
    expect(inversePartition.before).toBe(forwardPartition.after)

    externalPartition.push(fixture.records.loopingNote)
    externalForward.push({
      type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
      sourceId: fixture.records.loopingSource.id,
      after: fixture.records.loopingNote,
    })

    expect(plan.forward).toHaveLength(2)
    expect(forwardPartition.after).toEqual([
      fixture.records.nonLoopNote,
      fixture.records.nonLoopHarmonyNote,
    ])
  })

  it('canonicalizes structural objects and follows type instead of extra fields', () => {
    const fixture = createCompleteProjectFixture()
    const insertWithExtras = {
      type: PROJECT_MUTATION_TYPE.TRACK.INSERT,
      after: fixture.records.instrumentTrack,
      before: fixture.records.audioTrack,
      arbitrary: 'ignored insert metadata',
    }
    const removeWithExtras = {
      type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
      before: fixture.records.audioTrack,
      after: fixture.records.instrumentTrack,
      arbitrary: 'ignored remove metadata',
    }
    const plan = createMutationPlan(INITIAL_MODEL_REVISION, [insertWithExtras, removeWithExtras])

    expect(plan.forward).toEqual([
      { type: PROJECT_MUTATION_TYPE.TRACK.INSERT, after: fixture.records.instrumentTrack },
      { type: PROJECT_MUTATION_TYPE.TRACK.REMOVE, before: fixture.records.audioTrack },
    ])
    expect(plan.inverse).toEqual([
      { type: PROJECT_MUTATION_TYPE.TRACK.INSERT, after: fixture.records.audioTrack },
      { type: PROJECT_MUTATION_TYPE.TRACK.REMOVE, before: fixture.records.instrumentTrack },
    ])
    expect(plan.forward[0]).not.toHaveProperty('before')
    expect(plan.forward[1]).not.toHaveProperty('after')
    expect(plan.forward.every((mutation) => !('arbitrary' in mutation))).toBe(true)
    expect(plan.inverse.every((mutation) => !('arbitrary' in mutation))).toBe(true)
  })
})

describe('MutationPlanError', () => {
  it('rejects an empty forward list without a mutation index', () => {
    const error = captureMutationPlanError(() => createMutationPlan(INITIAL_MODEL_REVISION, []))

    expect(error.code).toBe('empty-forward')
    expect(error.mutationIndex).toBeNull()
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid base revision %s without a mutation index',
    (value) => {
      const revision = value as unknown as ModelRevision
      const mutation = createMutationExamples()[0]?.mutation

      if (mutation === undefined) {
        throw new Error('Expected a valid mutation example')
      }

      const error = captureMutationPlanError(() => createMutationPlan(revision, [mutation]))

      expect(error.code).toBe('invalid-base-revision')
      expect(error.mutationIndex).toBeNull()
    },
  )

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid track-order index %s at its plan position',
    (index) => {
      const fixture = createCompleteProjectFixture()
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          {
            type: PROJECT_MUTATION_TYPE.TRACK.INSERT,
            after: fixture.records.instrumentTrack,
          },
          {
            type: PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE,
            index,
            trackId: fixture.records.instrumentTrack.id,
          },
        ]),
      )

      expect(error.code).toBe('invalid-track-order-index')
      expect(error.mutationIndex).toBe(1)
    },
  )

  it('rejects same-reference replacements for records and Master', () => {
    const fixture = createCompleteProjectFixture()
    const mutations: readonly ProjectMutation[] = [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: fixture.records.project,
      },
      {
        type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
        before: fixture.records.master,
        after: fixture.records.master,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: fixture.records.instrumentTrack,
        after: fixture.records.instrumentTrack,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
        after: fixture.records.nonLoopNote,
      },
    ]

    for (const mutation of mutations) {
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          {
            type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
            index: 0,
            trackId: fixture.records.instrumentTrack.id,
          },
          mutation,
        ]),
      )

      expect(error.code).toBe('no-op-replace')
      expect(error.mutationIndex).toBe(1)
    }

    const directError = captureMutationPlanError(() => invertProjectMutation(mutations[0]!))

    expect(directError.code).toBe('no-op-replace')
    expect(directError.mutationIndex).toBeNull()
  })

  it('rejects replacement records whose IDs change', () => {
    const fixture = createCompleteProjectFixture()
    const differentProject = createProjectRecord({
      id: parseProjectId('different-project'),
      name: fixture.records.project.name,
    })
    const differentTrack = createAudioTrackRecord({
      id: fixture.records.instrumentTrack.id,
      name: 'Temporary Track',
      color: null,
      channel: fixture.records.instrumentTrack.channel,
      audioEffectIds: [],
    })
    const trulyDifferentTrack = createAudioTrackRecord({
      ...differentTrack,
      id: fixture.records.audioTrack.id,
    })
    const differentNote = createMidiNoteRecord({
      ...fixture.records.nonLoopNote,
      id: parseNoteId('different-note'),
    })
    const mutations: readonly ProjectMutation[] = [
      {
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: fixture.records.project,
        after: differentProject,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: fixture.records.instrumentTrack,
        after: trulyDifferentTrack,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
        after: differentNote,
      },
    ]

    for (const mutation of mutations) {
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          {
            type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
            before: fixture.records.audioTrack,
          },
          mutation,
        ]),
      )

      expect(error.code).toBe('record-id-changed')
      expect(error.mutationIndex).toBe(1)
    }
  })

  it('rejects duplicate Note IDs in inserted and removed partition payloads at plan index', () => {
    const fixture = createCompleteProjectFixture()
    const duplicateNotes = [fixture.records.nonLoopNote, fixture.records.nonLoopNote]
    const invalidPartitionMutations: readonly ProjectMutation[] = [
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: fixture.records.nonLoopSource.id,
        after: duplicateNotes,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
        sourceId: fixture.records.nonLoopSource.id,
        before: duplicateNotes,
      },
    ]

    for (const mutation of invalidPartitionMutations) {
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          {
            type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
            before: fixture.records.audioTrack,
          },
          mutation,
        ]),
      )

      expect(error.code).toBe('duplicate-note-id-in-partition')
      expect(error.mutationIndex).toBe(1)
    }
  })

  it('rejects unknown mutation types without a mutation index when inverted directly', () => {
    const unknownMutation = {
      type: 'future.unsupported',
      payload: {},
    } as unknown as ProjectMutation
    const error = captureMutationPlanError(() => invertProjectMutation(unknownMutation))

    expect(error.code).toBe('unknown-mutation-type')
    expect(error.mutationIndex).toBeNull()
  })
})

describe('mutation module boundary', () => {
  it('does not export mutation APIs from the package root', () => {
    for (const exportName of [
      'MutationPlanError',
      'createMutationPlan',
      'invertProjectMutation',
      'copyProjectMutationForPlan',
      'invertNormalizedProjectMutation',
      'PROJECT_MUTATION_TYPE',
    ]) {
      expect(projectCore).not.toHaveProperty(exportName)
    }
  })
})
