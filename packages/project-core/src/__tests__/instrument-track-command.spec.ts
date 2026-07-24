import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddInstrumentTrackCommand,
  createAllProjectCommitsSubscription,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  parseBipolarValue,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseParameterId,
  parseProjectColor,
  parseTrackId,
  type AddInstrumentTrackCommand,
  type CreateAddInstrumentTrackCommandInput,
  type JsonValue,
  type ParameterId,
  type ProjectCommit,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { QueryIndex } from '#internal/queries/query-index'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createCommandInput(
  store: ModelStore,
  overrides: Partial<CreateAddInstrumentTrackCommandInput> = {},
): CreateAddInstrumentTrackCommandInput {
  return {
    baseRevision: store.modelRevision,
    trackId: parseTrackId('track-command-instrument'),
    name: 'Instrument 3',
    color: parseProjectColor('#7c5cff'),
    channel: {
      gain: parseLinearGain(1),
      pan: parseBipolarValue(0),
      muted: false,
      soloed: false,
    },
    instrumentDevice: {
      id: parseDeviceId('device-command-instrument-slot'),
      typeId: parseDeviceTypeId('seele.instrument-slot'),
      definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
      enabled: true,
      parameters: {},
      opaqueState: null,
    },
    insertAt: 1,
    ...overrides,
  }
}

function createCommand(
  store: ModelStore,
  overrides: Partial<CreateAddInstrumentTrackCommandInput> = {},
): AddInstrumentTrackCommand {
  return createAddInstrumentTrackCommand(createCommandInput(store, overrides))
}

function captureCommandError(operation: () => unknown): ProjectCommandError {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(ProjectCommandError)

  if (!(caughtError instanceof ProjectCommandError)) {
    throw new Error('Expected a ProjectCommandError')
  }

  return caughtError
}

function requireCommittedTrackChange(commit: ProjectCommit) {
  const change = commit.delta.changes[0]

  expect(commit.delta.changes).toHaveLength(1)
  expect(change?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED)

  if (change?.type !== PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED) {
    throw new Error('Expected an added Instrument Track change')
  }

  return change
}

describe('AddInstrumentTrackCommand public contract', () => {
  it('normalizes a complete empty Instrument Track and copies caller-owned values', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const presetId = parseParameterId('preset')
    const preset = { family: 'piano' }
    const parameters: Record<ParameterId, JsonValue> = { [presetId]: preset }
    const channel = {
      gain: parseLinearGain(1),
      pan: parseBipolarValue(0),
      muted: false,
      soloed: false,
    }
    const command = createCommand(store, {
      color: '#7c5cff' as ReturnType<typeof parseProjectColor>,
      channel,
      instrumentDevice: {
        ...createCommandInput(store).instrumentDevice,
        parameters,
      },
    })

    channel.gain = parseLinearGain(0.5)
    preset.family = 'changed'

    expect(PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD).toBe('instrument-track.add')
    expect(command).toMatchObject({
      type: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD,
      baseRevision: store.modelRevision,
      insertAt: 1,
      track: {
        id: parseTrackId('track-command-instrument'),
        kind: 'instrument',
        name: 'Instrument 3',
        color: '#7C5CFF',
        channel: {
          gain: 1,
          pan: 0,
          muted: false,
          soloed: false,
        },
        midiEffectIds: [],
        audioEffectIds: [],
        instrumentDeviceId: parseDeviceId('device-command-instrument-slot'),
      },
      instrumentDevice: {
        typeId: parseDeviceTypeId('seele.instrument-slot'),
        parameters: { [presetId]: { family: 'piano' } },
      },
    })
    expectTypeOf(command).toEqualTypeOf<AddInstrumentTrackCommand>()
  })

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid Track Order index: %s',
    (insertAt) => {
      const fixture = createCompleteProjectFixture()
      const store = new ModelStore(fixture.seed)
      const error = captureCommandError(() => createCommand(store, { insertAt }))

      expect(error.code).toBe('invalid-track-order-index')
      expect(error.insertAt).toBe(insertAt)
    },
  )
})

describe('AddInstrumentTrackCommand preparation', () => {
  it('prepares Device, Track, and Track Order insertion with the exact reverse sequence', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store)
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    expect(plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.INSERT,
        after: command.instrumentDevice,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.INSERT,
        after: command.track,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
        index: command.insertAt,
        trackId: command.track.id,
      },
    ])
    expect(plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE,
        index: command.insertAt,
        trackId: command.track.id,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
        before: command.track,
      },
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.REMOVE,
        before: command.instrumentDevice,
      },
    ])
  })

  it('rejects occupied Track and Device identities and an out-of-bounds position', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    const duplicateTrack = captureCommandError(() =>
      prepareProjectCommand(
        store,
        createCommand(store, { trackId: fixture.records.instrumentTrack.id }),
      ),
    )
    expect(duplicateTrack).toMatchObject({
      code: 'track-id-already-exists',
      trackId: fixture.records.instrumentTrack.id,
    })

    const duplicateDevice = captureCommandError(() =>
      prepareProjectCommand(
        store,
        createCommand(store, {
          instrumentDevice: {
            ...createCommandInput(store).instrumentDevice,
            id: fixture.records.instrumentDevice.id,
          },
        }),
      ),
    )
    expect(duplicateDevice).toMatchObject({
      code: 'device-id-already-exists',
      deviceId: fixture.records.instrumentDevice.id,
    })

    const outOfBounds = captureCommandError(() =>
      prepareProjectCommand(store, createCommand(store, { insertAt: 3 })),
    )
    expect(outOfBounds).toMatchObject({
      code: 'track-order-index-out-of-bounds',
      insertAt: 3,
      trackOrderLength: 2,
    })
  })
})

describe('Instrument Track commit and History semantics', () => {
  it('commits one aggregate change and restores the exact placement through Undo / Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const command = createCommand(store)
    const result = session.execute(command)

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected AddInstrumentTrack to commit')
    }

    const change = requireCommittedTrackChange(result.commit)

    expect(change.trackId).toBe(command.track.id)
    expect(change.after).toEqual({
      track: command.track,
      instrumentDevice: command.instrumentDevice,
      index: command.insertAt,
    })
    expect(Object.isFrozen(change)).toBe(true)
    expect(Object.isFrozen(change.after)).toBe(true)
    expect(change.after.track).toBe(store.getTrack(command.track.id))
    expect(change.after.instrumentDevice).toBe(store.getDevice(command.instrumentDevice.id))
    expect([...store.orderedTrackIds()]).toEqual([
      fixture.records.instrumentTrack.id,
      command.track.id,
      fixture.records.audioTrack.id,
    ])

    const undoCommit = session.undo()
    const undoChange = undoCommit?.delta.changes[0]

    expect(undoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD,
    })
    expect(undoChange?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED)
    if (undoChange?.type !== PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED) {
      throw new Error('Expected a removed Instrument Track change')
    }
    expect(undoChange.before.track).toBe(change.after.track)
    expect(undoChange.before.instrumentDevice).toBe(change.after.instrumentDevice)
    expect(undoChange.before.index).toBe(command.insertAt)
    expect(store.getTrack(command.track.id)).toBeUndefined()
    expect(store.getDevice(command.instrumentDevice.id)).toBeUndefined()
    expect([...store.orderedTrackIds()]).toEqual([
      fixture.records.instrumentTrack.id,
      fixture.records.audioTrack.id,
    ])

    const redoCommit = session.redo()
    const redoChange = redoCommit?.delta.changes[0]

    expect(redoChange?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED)
    if (redoChange?.type !== PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED) {
      throw new Error('Expected a restored Instrument Track change')
    }
    expect(redoChange.after.track).toBe(change.after.track)
    expect(redoChange.after.instrumentDevice).toBe(change.after.instrumentDevice)
    expect([...store.orderedTrackIds()]).toEqual([
      fixture.records.instrumentTrack.id,
      command.track.id,
      fixture.records.audioTrack.id,
    ])
  })

  it('fails closed when an Instrument Track graph insertion is incomplete', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store)
    const incompletePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.INSERT,
        after: command.instrumentDevice,
      },
    ])

    expect(() => createProjectCommitCandidate(command, incompletePlan)).toThrowError(
      expect.objectContaining({ code: 'unsupported-mutation-type' }),
    )
  })
})

describe('Instrument Track consumer compatibility', () => {
  it('advances the Note QueryIndex revision without changing Note results', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const index = new QueryIndex(store)
    const query = createMidiNoteByIdQuery({
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const before = index.execute(store, query)
    const command = createCommand(store)
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const commit = createProjectCommitCandidate(command, plan)
    const transition = index.prepare(store, commit.delta)

    transition.stage()
    new MutationApplier(store).apply(plan)

    const after = index.execute(store, query)

    expect(index.modelRevision).toBe(commit.modelRevision)
    expect(after.modelRevision).toBe(commit.modelRevision)
    expect(after.note).toBe(before.note)
  })

  it('publishes to all-commits but not to MIDI Note subscriptions', async () => {
    const { store, session } = createFixtureProjectSession()
    const allCommits: ProjectCommit[] = []
    const noteCommits: ProjectCommit[] = []

    session.subscribe(createAllProjectCommitsSubscription(), {
      onCommit: (commit) => allCommits.push(commit),
      onError: () => undefined,
    })
    session.subscribe(createMidiNoteChangesSubscription(), {
      onCommit: (commit) => noteCommits.push(commit),
      onError: () => undefined,
    })

    const result = session.execute(createCommand(store))

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    await Promise.resolve()

    expect(allCommits).toHaveLength(1)
    expect(noteCommits).toEqual([])
  })
})
