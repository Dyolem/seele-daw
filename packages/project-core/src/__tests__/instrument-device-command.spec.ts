import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAllProjectCommitsSubscription,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  createProjectCheckpoint,
  createProjectFileDTO,
  createProjectSessionFromProjectFile,
  createReplaceInstrumentDeviceCommand,
  parseDeviceId,
  parseDeviceTypeId,
  parseParameterId,
  parseProjectCheckpointId,
  parseTrackId,
  type CreateReplaceInstrumentDeviceCommandInput,
  type JsonValue,
  type ParameterId,
  type ProjectCommit,
  type ReplaceInstrumentDeviceCommand,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import {
  createHistoryProjectCommitCandidate,
  createProjectCommitCandidate,
} from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import {
  createCompleteProjectFixture,
  type CompleteProjectFixture,
} from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createCommandInput(
  store: ModelStore,
  fixture: CompleteProjectFixture,
  overrides: Partial<CreateReplaceInstrumentDeviceCommandInput> = {},
): CreateReplaceInstrumentDeviceCommandInput {
  return {
    baseRevision: store.modelRevision,
    trackId: fixture.records.instrumentTrack.id,
    instrumentDevice: {
      id: fixture.records.instrumentDevice.id,
      typeId: parseDeviceTypeId('seele.sample-instrument'),
      definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
      enabled: true,
      parameters: {},
      opaqueState: { soundbankId: 'studio-grand' },
    },
    ...overrides,
  }
}

function createCommand(
  store: ModelStore,
  fixture: CompleteProjectFixture,
  overrides: Partial<CreateReplaceInstrumentDeviceCommandInput> = {},
): ReplaceInstrumentDeviceCommand {
  return createReplaceInstrumentDeviceCommand(createCommandInput(store, fixture, overrides))
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

describe('ReplaceInstrumentDeviceCommand public contract', () => {
  it('normalizes and copies a complete opaque Device Descriptor', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const toneId = parseParameterId('tone')
    const tone = { curve: [0.2, 0.8] }
    const parameters: Record<ParameterId, JsonValue> = { [toneId]: tone }
    const metadata = { family: 'piano' }
    const opaqueState = {
      metadata,
      soundbankId: 'third-party-grand',
    }
    const command = createCommand(store, fixture, {
      instrumentDevice: {
        id: fixture.records.instrumentDevice.id,
        typeId: parseDeviceTypeId('third-party.future-instrument'),
        definitionVersion: 7,
        enabled: false,
        parameters,
        opaqueState,
      },
    })

    tone.curve[0] = 1
    metadata.family = 'changed'
    opaqueState.soundbankId = 'changed'

    expect(PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE).toBe('instrument-device.replace')
    expect(command).toEqual({
      type: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
      baseRevision: store.modelRevision,
      trackId: fixture.records.instrumentTrack.id,
      instrumentDevice: {
        id: fixture.records.instrumentDevice.id,
        typeId: parseDeviceTypeId('third-party.future-instrument'),
        definitionVersion: 7,
        enabled: false,
        parameters: { [toneId]: { curve: [0.2, 0.8] } },
        opaqueState: {
          metadata: { family: 'piano' },
          soundbankId: 'third-party-grand',
        },
      },
    })
    expectTypeOf(command).toEqualTypeOf<ReplaceInstrumentDeviceCommand>()
  })
})

describe('ReplaceInstrumentDeviceCommand preparation', () => {
  it('prepares one identity-preserving Device replacement and its exact inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store, fixture)
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    if (
      preparation.status !== 'ready' ||
      preparation.command.type !== PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE ||
      plan.forward[0]?.type !== PROJECT_MUTATION_TYPE.DEVICE.REPLACE
    ) {
      throw new Error('Expected a ready Instrument Device replacement')
    }

    const forwardMutation = plan.forward[0]

    expect(plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
        trackId: fixture.records.instrumentTrack.id,
        before: fixture.records.instrumentDevice,
        after: expect.objectContaining({
          id: fixture.records.instrumentDevice.id,
          typeId: parseDeviceTypeId('seele.sample-instrument'),
          opaqueState: { soundbankId: 'studio-grand' },
        }),
      },
    ])
    expect(plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
        trackId: fixture.records.instrumentTrack.id,
        before: forwardMutation.after,
        after: fixture.records.instrumentDevice,
      },
    ])

    expect(preparation.command).not.toBe(command)
    expect(forwardMutation.after).toBe(preparation.command.instrumentDevice)
  })

  it('returns no-change for a value-equal Descriptor', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const preparation = prepareProjectCommand(
      store,
      createCommand(store, fixture, {
        instrumentDevice: fixture.records.instrumentDevice,
      }),
    )

    expect(preparation).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
  })

  it('rejects a missing Track, a non-Instrument Track, a changed Device ID, and a missing Device', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingTrackId = parseTrackId('track-missing-instrument-device')

    const missingTrack = captureCommandError(() =>
      prepareProjectCommand(store, createCommand(store, fixture, { trackId: missingTrackId })),
    )
    expect(missingTrack).toMatchObject({
      code: 'track-not-found',
      trackId: missingTrackId,
    })

    const wrongTrackKind = captureCommandError(() =>
      prepareProjectCommand(
        store,
        createCommand(store, fixture, { trackId: fixture.records.audioTrack.id }),
      ),
    )
    expect(wrongTrackKind).toMatchObject({
      code: 'instrument-device-track-kind-mismatch',
      trackId: fixture.records.audioTrack.id,
      trackKind: 'audio',
    })

    const changedDeviceId = parseDeviceId('device-replacement-with-new-id')
    const changedIdentity = captureCommandError(() =>
      prepareProjectCommand(
        store,
        createCommand(store, fixture, {
          instrumentDevice: {
            ...createCommandInput(store, fixture).instrumentDevice,
            id: changedDeviceId,
          },
        }),
      ),
    )
    expect(changedIdentity).toMatchObject({
      code: 'instrument-device-id-mismatch',
      deviceId: changedDeviceId,
      trackId: fixture.records.instrumentTrack.id,
    })

    const devicesWithoutInstrument = new Map(fixture.seed.devices)
    devicesWithoutInstrument.delete(fixture.records.instrumentDevice.id)
    const incompleteStore = new ModelStore({
      ...fixture.seed,
      devices: devicesWithoutInstrument,
    })
    const missingDevice = captureCommandError(() =>
      prepareProjectCommand(incompleteStore, createCommand(incompleteStore, fixture)),
    )
    expect(missingDevice).toMatchObject({
      code: 'device-not-found',
      deviceId: fixture.records.instrumentDevice.id,
      trackId: fixture.records.instrumentTrack.id,
    })
  })

  it('fails closed for altered ownership and an unowned raw Device replacement', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const preparation = prepareProjectCommand(store, createCommand(store, fixture))
    const plan = requireReadyProjectCommandPlan(preparation)

    if (
      preparation.status !== 'ready' ||
      preparation.command.type !== PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE ||
      plan.forward[0]?.type !== PROJECT_MUTATION_TYPE.DEVICE.REPLACE
    ) {
      throw new Error('Expected a ready Instrument Device replacement')
    }

    const wrongOwnerPlan = createMutationPlan(store.modelRevision, [
      {
        ...plan.forward[0],
        trackId: fixture.records.audioTrack.id,
      },
    ])
    expect(() => createProjectCommitCandidate(preparation.command, wrongOwnerPlan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )

    const unownedPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
        before: fixture.records.instrumentDevice,
        after: preparation.command.instrumentDevice,
      },
    ])
    expect(() =>
      createHistoryProjectCommitCandidate(
        {
          direction: PROJECT_HISTORY_DIRECTION.REDO,
          commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
        },
        unownedPlan,
      ),
    ).toThrowError(expect.objectContaining({ code: 'unsupported-mutation-type' }))
  })
})

describe('Instrument Device commit and History semantics', () => {
  it('commits one semantic update without changing Track identity and restores it through Undo / Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const trackBefore = store.getTrack(fixture.records.instrumentTrack.id)
    const result = session.execute(createCommand(store, fixture))

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Instrument Device replacement to commit')
    }

    const change = result.commit.delta.changes[0]
    expect(result.commit).toMatchObject({
      baseRevision: 0,
      modelRevision: 1,
      origin: {
        kind: 'command',
        commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
      },
    })
    expect(result.commit.delta.changes).toHaveLength(1)
    expect(change?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED)
    if (change?.type !== PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED) {
      throw new Error('Expected an updated Instrument Device change')
    }

    expect(change).toMatchObject({
      trackId: fixture.records.instrumentTrack.id,
      deviceId: fixture.records.instrumentDevice.id,
      before: fixture.records.instrumentDevice,
      after: {
        id: fixture.records.instrumentDevice.id,
        typeId: parseDeviceTypeId('seele.sample-instrument'),
        opaqueState: { soundbankId: 'studio-grand' },
      },
    })
    expect(Object.isFrozen(change)).toBe(true)
    expect(store.getTrack(fixture.records.instrumentTrack.id)).toBe(trackBefore)
    expect(store.getDevice(fixture.records.instrumentDevice.id)).toBe(change.after)

    const undoCommit = session.undo()
    const undoChange = undoCommit?.delta.changes[0]
    expect(undoCommit?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
    })
    expect(undoChange?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED)
    if (undoChange?.type !== PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED) {
      throw new Error('Expected an undone Instrument Device update')
    }
    expect(undoChange.before).toBe(change.after)
    expect(undoChange.after).toBe(fixture.records.instrumentDevice)
    expect(store.getDevice(fixture.records.instrumentDevice.id)).toBe(
      fixture.records.instrumentDevice,
    )

    const redoCommit = session.redo()
    const redoChange = redoCommit?.delta.changes[0]
    expect(redoCommit?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.REDO,
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
    })
    expect(redoChange?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED)
    if (redoChange?.type !== PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED) {
      throw new Error('Expected a redone Instrument Device update')
    }
    expect(redoChange.before).toBe(fixture.records.instrumentDevice)
    expect(redoChange.after).toBe(change.after)
    expect(store.getDevice(fixture.records.instrumentDevice.id)).toBe(change.after)
    expect(store.getTrack(fixture.records.instrumentTrack.id)).toBe(trackBefore)
  })

  it('does not advance revision, History, content state, or notifications for a deep value match', async () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const allCommits: ProjectCommit[] = []
    const toneId = parseParameterId('tone')
    session.subscribe(createAllProjectCommitsSubscription(), {
      onCommit: (commit) => allCommits.push(commit),
      onError: () => undefined,
    })
    const firstResult = session.execute(
      createCommand(store, fixture, {
        instrumentDevice: {
          ...createCommandInput(store, fixture).instrumentDevice,
          parameters: {
            [toneId]: { curve: [0.2, 0.8], mode: 'soft' },
          },
          opaqueState: {
            metadata: { family: 'piano', tags: ['grand', 'studio'] },
            soundbankId: 'studio-grand',
          },
        },
      }),
    )
    expect(firstResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    const contentStateId = session.contentStateId

    const noChangeResult = session.execute(
      createCommand(store, fixture, {
        instrumentDevice: {
          ...createCommandInput(store, fixture).instrumentDevice,
          parameters: {
            [toneId]: { mode: 'soft', curve: [0.2, 0.8] },
          },
          opaqueState: {
            soundbankId: 'studio-grand',
            metadata: { tags: ['grand', 'studio'], family: 'piano' },
          },
        },
      }),
    )

    expect(noChangeResult).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      modelRevision: 1,
    })
    expect(session.modelRevision).toBe(1)
    expect(session.contentStateId).toBe(contentStateId)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
    await Promise.resolve()
    expect(allCommits).toHaveLength(1)
  })
})

describe('Instrument Device consumer and persistence compatibility', () => {
  it('advances Note query revision without changing its result', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const query = createMidiNoteByIdQuery({
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const before = session.query(query)

    const result = session.execute(createCommand(store, fixture))
    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

    const after = session.query(query)
    expect(after.modelRevision).toBe(1)
    expect(after.note).toBe(before.note)
  })

  it('publishes to all-commits but not to MIDI Note subscriptions', async () => {
    const { fixture, store, session } = createFixtureProjectSession()
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

    const result = session.execute(createCommand(store, fixture))
    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    await Promise.resolve()

    expect(allCommits).toHaveLength(1)
    expect(noteCommits).toEqual([])
  })

  it('round-trips an unknown Descriptor through Project File V1 and Checkpoint V1', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const expressionId = parseParameterId('expression')
    const command = createCommand(store, fixture, {
      instrumentDevice: {
        id: fixture.records.instrumentDevice.id,
        typeId: parseDeviceTypeId('third-party.future-instrument'),
        definitionVersion: 12,
        enabled: true,
        parameters: {
          [expressionId]: 0.75,
        },
        opaqueState: {
          futureSchema: { revision: 3 },
          presetId: 'concert-grand',
        },
      },
    })
    const result = session.execute(command)
    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

    const projectFile = createProjectFileDTO(session.getSnapshot())
    const projectedDevice = projectFile.devices[fixture.records.instrumentDevice.id]
    expect(projectedDevice).toEqual(command.instrumentDevice)

    const loadedSession = createProjectSessionFromProjectFile(projectFile)
    expect(createProjectFileDTO(loadedSession.getSnapshot())).toEqual(projectFile)

    const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId('checkpoint-instrument-device-replace'),
    })
    expect(checkpoint.projectFile.devices[fixture.records.instrumentDevice.id]).toEqual(
      command.instrumentDevice,
    )
  })
})
