import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAudioTrackRecord,
  createDeviceDescriptor,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseLinearGain,
  parseMidiControlValue,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoBpm,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
} from '#internal/index'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import type { ModelRevision } from '#internal/model/model-revision'
import { INITIAL_MODEL_REVISION } from '#internal/model/model-revision'
import {
  PARTITIONED_TABLE_NAMES,
  RECORD_TABLE_NAMES,
  type PartitionedTableName,
  type RecordTableName,
} from '#internal/model/model-tables'
import { MutationPlanError } from '#internal/mutation/mutation-plan-error'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import {
  changeLabel,
  invertProjectChange,
  type ProjectChange,
} from '#internal/mutation/project-change'

/** One change for every table and operation the vocabulary accepts. */
function createChangeExamples(): readonly ProjectChange[] {
  const { records } = createCompleteProjectFixture()
  const sourceId = records.nonLoopSource.id
  const notes = [records.nonLoopNote, records.nonLoopHarmonyNote]
  const pedalEvents = [records.nonLoopPedalDown, records.nonLoopPedalUp]
  const project = createProjectRecord({ id: records.project.id, name: 'Updated Project' })
  const master = createMasterChannelRecord({
    gain: parseLinearGain(0.75),
    muted: true,
    audioEffectIds: records.master.audioEffectIds,
  })
  const track = createAudioTrackRecord({
    id: records.audioTrack.id,
    name: 'Updated Audio Track',
    color: records.audioTrack.color,
    channel: records.audioTrack.channel,
    audioEffectIds: records.audioTrack.audioEffectIds,
  })
  const clip = createMidiClipRecord({ ...records.nonLoopClip, name: 'Updated Clip' })
  const source = createMidiSourceRecord({ id: sourceId, lengthTick: parseTick(2_400) })
  const tempoEvent = createTempoEventRecord({ ...records.laterTempoEvent, bpm: parseTempoBpm(132) })
  const timeSignatureEvent = createTimeSignatureEventRecord({
    ...records.laterTimeSignatureEvent,
    numerator: parseTimeSignatureNumerator(5),
    denominator: parseTimeSignatureDenominator(4),
  })
  const device = createDeviceDescriptor({
    id: records.instrumentDevice.id,
    typeId: records.instrumentDevice.typeId,
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: false,
    parameters: records.instrumentDevice.parameters,
    opaqueState: records.instrumentDevice.opaqueState,
  })
  const note = createMidiNoteRecord({ ...records.nonLoopNote, velocity: parseMidiVelocity(112) })
  const pedalEvent = createMidiSustainPedalEventRecord({
    ...records.nonLoopPedalDown,
    value: parseMidiControlValue(96),
  })

  return [
    { op: 'replace', table: 'project', before: records.project, after: project },
    { op: 'replace', table: 'master', before: records.master, after: master },
    { op: 'insert', table: 'tracks', after: records.audioTrack },
    { op: 'remove', table: 'tracks', before: records.audioTrack },
    { op: 'replace', table: 'tracks', before: records.audioTrack, after: track },
    { op: 'insert', table: 'clips', after: records.nonLoopClip },
    { op: 'remove', table: 'clips', before: records.nonLoopClip },
    { op: 'replace', table: 'clips', before: records.nonLoopClip, after: clip },
    { op: 'insert', table: 'midiSources', after: records.nonLoopSource },
    { op: 'remove', table: 'midiSources', before: records.nonLoopSource },
    { op: 'replace', table: 'midiSources', before: records.nonLoopSource, after: source },
    { op: 'insert', table: 'tempoEvents', after: records.laterTempoEvent },
    { op: 'remove', table: 'tempoEvents', before: records.laterTempoEvent },
    { op: 'replace', table: 'tempoEvents', before: records.laterTempoEvent, after: tempoEvent },
    { op: 'insert', table: 'timeSignatureEvents', after: records.laterTimeSignatureEvent },
    { op: 'remove', table: 'timeSignatureEvents', before: records.laterTimeSignatureEvent },
    {
      op: 'replace',
      table: 'timeSignatureEvents',
      before: records.laterTimeSignatureEvent,
      after: timeSignatureEvent,
    },
    { op: 'insert', table: 'devices', after: records.instrumentDevice },
    { op: 'remove', table: 'devices', before: records.instrumentDevice },
    { op: 'replace', table: 'devices', before: records.instrumentDevice, after: device },
    { op: 'insert', table: 'trackOrder', index: 1, trackId: records.audioTrack.id },
    { op: 'remove', table: 'trackOrder', index: 1, trackId: records.audioTrack.id },
    { op: 'insert-partition', table: 'midiNotes', sourceId, records: notes },
    { op: 'remove-partition', table: 'midiNotes', sourceId, records: notes },
    { op: 'insert', table: 'midiNotes', sourceId, after: records.nonLoopNote },
    { op: 'remove', table: 'midiNotes', sourceId, before: records.nonLoopNote },
    { op: 'replace', table: 'midiNotes', sourceId, before: records.nonLoopNote, after: note },
    { op: 'insert-partition', table: 'midiSustainPedalEvents', sourceId, records: pedalEvents },
    { op: 'remove-partition', table: 'midiSustainPedalEvents', sourceId, records: pedalEvents },
    { op: 'insert', table: 'midiSustainPedalEvents', sourceId, after: records.nonLoopPedalDown },
    { op: 'remove', table: 'midiSustainPedalEvents', sourceId, before: records.nonLoopPedalDown },
    {
      op: 'replace',
      table: 'midiSustainPedalEvents',
      sourceId,
      before: records.nonLoopPedalDown,
      after: pedalEvent,
    },
  ]
}

const INVERSE_OPERATION = {
  insert: 'remove',
  remove: 'insert',
  replace: 'replace',
  'insert-partition': 'remove-partition',
  'remove-partition': 'insert-partition',
} as const

/** The records a change carries, before first. */
function recordsOf(change: ProjectChange): readonly object[] {
  if (change.table === 'trackOrder') return []
  if (change.op === 'insert-partition' || change.op === 'remove-partition') return change.records
  return [
    ...('before' in change ? [change.before] : []),
    ...('after' in change ? [change.after] : []),
  ]
}

/** Where a change writes, apart from the records it carries. */
function locationOf(change: ProjectChange): Readonly<Record<string, number | string>> {
  if (change.table === 'trackOrder') return { index: change.index, trackId: change.trackId }
  return 'sourceId' in change ? { sourceId: change.sourceId } : {}
}

function expectSameRecords(actual: ProjectChange, expected: readonly object[]): void {
  const records = recordsOf(actual)

  expect(records).toHaveLength(expected.length)
  records.forEach((record, index) => expect(record).toBe(expected[index]))
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

describe('ProjectChange vocabulary', () => {
  it('names every model table, and each example covers one table and operation', () => {
    expectTypeOf<ProjectChange['table']>().toEqualTypeOf<
      'project' | 'master' | 'trackOrder' | RecordTableName | PartitionedTableName
    >()

    const vocabulary = [
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

    expect(createChangeExamples().map(changeLabel).sort()).toEqual(vocabulary.sort())
  })

  it.each([
    ['project', 'insert'],
    ['master', 'remove'],
    ['trackOrder', 'replace'],
    ['tracks', 'insert-partition'],
    ['future', 'insert'],
  ])('rejects %s.%s as an unknown change', (table, op) => {
    const error = captureMutationPlanError(() =>
      invertProjectChange({ op, table } as unknown as ProjectChange),
    )

    expect(error.code).toBe('unknown-change')
    expect(error.changeIndex).toBeNull()
  })
})

describe('invertProjectChange', () => {
  it('flips the operation and swaps before and after, keeping every record reference', () => {
    for (const change of createChangeExamples()) {
      const label = changeLabel(change)
      const inverse = invertProjectChange(change)
      const records = recordsOf(change)

      expect({ label, inverse: changeLabel(inverse) }).toEqual({
        label,
        inverse: `${change.table}.${INVERSE_OPERATION[change.op]}`,
      })
      expect({ label, location: locationOf(inverse) }).toEqual({
        label,
        location: locationOf(change),
      })
      expectSameRecords(inverse, change.op === 'replace' ? [...records].reverse() : records)
      expect(Object.isFrozen(inverse)).toBe(true)
    }
  })

  it('returns the original change after a double inverse', () => {
    for (const change of createChangeExamples()) {
      const doubleInverse = invertProjectChange(invertProjectChange(change))

      expect({ label: changeLabel(change), change: doubleInverse }).toEqual({
        label: changeLabel(change),
        change,
      })
      expectSameRecords(doubleInverse, recordsOf(change))
    }
  })
})

describe('createMutationPlan', () => {
  it('builds inverse entries from the forward entries in reverse execution order', () => {
    const plan = createMutationPlan(INITIAL_MODEL_REVISION, createChangeExamples())

    expect(plan.inverse).toHaveLength(plan.forward.length)
    plan.inverse.forEach((inverse, index) => {
      const expected = invertProjectChange(plan.forward[plan.forward.length - 1 - index]!)

      expect(inverse).toEqual(expected)
      expectSameRecords(inverse, recordsOf(expected))
    })
  })

  it('copies and freezes the plan, its changes and partition payloads', () => {
    const fixture = createCompleteProjectFixture()
    const externalPartition = [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote]
    const partitionChange: ProjectChange = {
      op: 'insert-partition',
      table: 'midiNotes',
      sourceId: fixture.records.nonLoopSource.id,
      records: externalPartition,
    }
    const trackOrderChange: ProjectChange = {
      op: 'insert',
      table: 'trackOrder',
      index: 1,
      trackId: fixture.records.audioTrack.id,
    }
    const externalForward: ProjectChange[] = [partitionChange, trackOrderChange]
    const plan = createMutationPlan(INITIAL_MODEL_REVISION, externalForward)

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.forward)).toBe(true)
    expect(Object.isFrozen(plan.inverse)).toBe(true)
    expect(plan.forward).not.toBe(externalForward)
    expect(plan.forward[0]).not.toBe(partitionChange)
    expect(plan.forward[1]).not.toBe(trackOrderChange)
    expect(plan.forward.every(Object.isFrozen)).toBe(true)
    expect(plan.inverse.every(Object.isFrozen)).toBe(true)

    const forwardPartition = plan.forward[0]
    const inversePartition = plan.inverse[1]

    if (
      forwardPartition?.op !== 'insert-partition' ||
      inversePartition?.op !== 'remove-partition'
    ) {
      throw new Error('Expected the copied partition insertion and its inverse')
    }

    expect(forwardPartition.records).not.toBe(externalPartition)
    expect(Object.isFrozen(forwardPartition.records)).toBe(true)
    expect(inversePartition.records).toBe(forwardPartition.records)

    externalPartition.push(fixture.records.loopingNote)
    externalForward.push({
      op: 'insert',
      table: 'midiNotes',
      sourceId: fixture.records.loopingSource.id,
      after: fixture.records.loopingNote,
    })

    expect(plan.forward).toHaveLength(2)
    expect(forwardPartition.records).toEqual([
      fixture.records.nonLoopNote,
      fixture.records.nonLoopHarmonyNote,
    ])
  })

  it('drops fields the table and operation do not define', () => {
    const fixture = createCompleteProjectFixture()
    const insertWithExtras = {
      op: 'insert',
      table: 'tracks',
      after: fixture.records.instrumentTrack,
      before: fixture.records.audioTrack,
      arbitrary: 'ignored insert metadata',
    } as const
    const removeWithExtras = {
      op: 'remove',
      table: 'tracks',
      before: fixture.records.audioTrack,
      after: fixture.records.instrumentTrack,
      arbitrary: 'ignored remove metadata',
    } as const
    const plan = createMutationPlan(INITIAL_MODEL_REVISION, [insertWithExtras, removeWithExtras])

    expect(plan.forward).toEqual([
      { op: 'insert', table: 'tracks', after: fixture.records.instrumentTrack },
      { op: 'remove', table: 'tracks', before: fixture.records.audioTrack },
    ])
    expect(plan.inverse).toEqual([
      { op: 'insert', table: 'tracks', after: fixture.records.audioTrack },
      { op: 'remove', table: 'tracks', before: fixture.records.instrumentTrack },
    ])
  })
})

describe('MutationPlanError', () => {
  it('rejects an empty forward list without a change index', () => {
    const error = captureMutationPlanError(() => createMutationPlan(INITIAL_MODEL_REVISION, []))

    expect(error.code).toBe('empty-forward')
    expect(error.changeIndex).toBeNull()
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid base revision %s without a change index',
    (value) => {
      const revision = value as unknown as ModelRevision
      const error = captureMutationPlanError(() =>
        createMutationPlan(revision, createChangeExamples().slice(0, 1)),
      )

      expect(error.code).toBe('invalid-base-revision')
      expect(error.changeIndex).toBeNull()
    },
  )

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid track-order index %s at its plan position',
    (index) => {
      const fixture = createCompleteProjectFixture()
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          { op: 'insert', table: 'tracks', after: fixture.records.instrumentTrack },
          {
            op: 'remove',
            table: 'trackOrder',
            index,
            trackId: fixture.records.instrumentTrack.id,
          },
        ]),
      )

      expect(error.code).toBe('invalid-track-order-index')
      expect(error.changeIndex).toBe(1)
    },
  )

  it('rejects same-reference replacements', () => {
    const fixture = createCompleteProjectFixture()
    const { records } = fixture
    const sourceId = records.nonLoopSource.id
    const changes: readonly ProjectChange[] = [
      { op: 'replace', table: 'project', before: records.project, after: records.project },
      { op: 'replace', table: 'master', before: records.master, after: records.master },
      {
        op: 'replace',
        table: 'tracks',
        before: records.instrumentTrack,
        after: records.instrumentTrack,
      },
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId,
        before: records.nonLoopNote,
        after: records.nonLoopNote,
      },
      {
        op: 'replace',
        table: 'midiSustainPedalEvents',
        sourceId,
        before: records.nonLoopPedalDown,
        after: records.nonLoopPedalDown,
      },
    ]

    for (const change of changes) {
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          { op: 'insert', table: 'trackOrder', index: 0, trackId: records.instrumentTrack.id },
          change,
        ]),
      )

      expect(error.code).toBe('no-op-replace')
      expect(error.changeIndex).toBe(1)
    }

    const directError = captureMutationPlanError(() => invertProjectChange(changes[0]!))

    expect(directError.code).toBe('no-op-replace')
    expect(directError.changeIndex).toBeNull()
  })

  it('rejects replacement records whose IDs change', () => {
    const fixture = createCompleteProjectFixture()
    const { records } = fixture
    const sourceId = records.nonLoopSource.id
    const differentProject = createProjectRecord({
      id: parseProjectId('different-project'),
      name: records.project.name,
    })
    const differentTrack = createAudioTrackRecord({
      id: records.audioTrack.id,
      name: 'Temporary Track',
      color: null,
      channel: records.instrumentTrack.channel,
      audioEffectIds: [],
    })
    const differentNote = createMidiNoteRecord({
      ...records.nonLoopNote,
      id: parseNoteId('different-note'),
    })
    const differentPedalEvent = createMidiSustainPedalEventRecord({
      ...records.nonLoopPedalDown,
      id: parseMidiSustainPedalEventId('different-sustain-pedal-event'),
    })
    const changes: readonly ProjectChange[] = [
      { op: 'replace', table: 'project', before: records.project, after: differentProject },
      { op: 'replace', table: 'tracks', before: records.instrumentTrack, after: differentTrack },
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId,
        before: records.nonLoopNote,
        after: differentNote,
      },
      {
        op: 'replace',
        table: 'midiSustainPedalEvents',
        sourceId,
        before: records.nonLoopPedalDown,
        after: differentPedalEvent,
      },
    ]

    for (const change of changes) {
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          { op: 'remove', table: 'tracks', before: records.audioTrack },
          change,
        ]),
      )

      expect(error.code).toBe('record-id-changed')
      expect(error.changeIndex).toBe(1)
    }
  })

  it('rejects duplicate record IDs in partition payloads at their plan position', () => {
    const fixture = createCompleteProjectFixture()
    const { nonLoopNote, nonLoopPedalDown, nonLoopSource, audioTrack } = fixture.records
    const sourceId = nonLoopSource.id
    const notes = [nonLoopNote, nonLoopNote]
    const pedalEvents = [nonLoopPedalDown, nonLoopPedalDown]
    const changes: readonly ProjectChange[] = [
      { op: 'insert-partition', table: 'midiNotes', sourceId, records: notes },
      { op: 'remove-partition', table: 'midiNotes', sourceId, records: notes },
      { op: 'insert-partition', table: 'midiSustainPedalEvents', sourceId, records: pedalEvents },
      { op: 'remove-partition', table: 'midiSustainPedalEvents', sourceId, records: pedalEvents },
    ]

    for (const change of changes) {
      const error = captureMutationPlanError(() =>
        createMutationPlan(INITIAL_MODEL_REVISION, [
          { op: 'remove', table: 'tracks', before: audioTrack },
          change,
        ]),
      )

      expect(error.code).toBe('duplicate-id-in-partition')
      expect(error.changeIndex).toBe(1)
    }
  })
})

describe('change module boundary', () => {
  it('does not export plan or change helpers from the package root', () => {
    for (const exportName of [
      'MutationPlanError',
      'createMutationPlan',
      'changeLabel',
      'invertProjectChange',
      'normalizeChangeForPlan',
      'invertChangeForPlan',
    ]) {
      expect(projectCore).not.toHaveProperty(exportName)
    }
  })
})
