import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddMidiSustainPedalEventCommand,
  createAllProjectCommitsSubscription,
  createMidiNoteChangesSubscription,
  createMidiSustainPedalEventRecord,
  createMoveMidiSustainPedalEventsCommand,
  createRemoveMidiSustainPedalEventsCommand,
  createReplaceMidiSustainPedalEventValueCommand,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseTick,
  parseTickDelta,
  type AddMidiSustainPedalEventCommand,
  type CreateAddMidiSustainPedalEventCommandInput,
  type CreateMoveMidiSustainPedalEventsCommandInput,
  type CreateRemoveMidiSustainPedalEventsCommandInput,
  type CreateReplaceMidiSustainPedalEventValueCommandInput,
  type MidiSustainPedalEventAddedChange,
  type MidiSustainPedalEventRemovedChange,
  type MidiSustainPedalEventUpdatedChange,
  type MoveMidiSustainPedalEventsCommand,
  type ProjectChange,
  type ProjectCommit,
  type RemoveMidiSustainPedalEventsCommand,
  type ReplaceMidiSustainPedalEventValueCommand,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPreparation } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

const ADDED_EVENT_ID = parseMidiSustainPedalEventId('sustain-pedal-command-added')
const ADDED_EVENT_TICK = parseTick(1_200)
const ADDED_EVENT_VALUE = parseMidiControlValue(127)
const ADDED_EVENT_CHANNEL = parseMidiChannel(2)

function createAddCommand(
  store: ModelStore,
  overrides: Partial<CreateAddMidiSustainPedalEventCommandInput> = {},
): AddMidiSustainPedalEventCommand {
  const fixture = createCompleteProjectFixture()

  return createAddMidiSustainPedalEventCommand({
    baseRevision: store.modelRevision,
    sourceId: fixture.records.nonLoopSource.id,
    eventId: ADDED_EVENT_ID,
    tick: ADDED_EVENT_TICK,
    value: ADDED_EVENT_VALUE,
    channel: ADDED_EVENT_CHANNEL,
    ...overrides,
  })
}

function createMoveCommand(
  store: ModelStore,
  overrides: Partial<CreateMoveMidiSustainPedalEventsCommandInput> = {},
): MoveMidiSustainPedalEventsCommand {
  const fixture = createCompleteProjectFixture()

  return createMoveMidiSustainPedalEventsCommand({
    baseRevision: store.modelRevision,
    sourceId: fixture.records.nonLoopSource.id,
    eventIds: [fixture.records.nonLoopPedalDown.id, fixture.records.nonLoopPedalUp.id],
    deltaTick: parseTickDelta(120),
    ...overrides,
  })
}

function createRemoveCommand(
  store: ModelStore,
  overrides: Partial<CreateRemoveMidiSustainPedalEventsCommandInput> = {},
): RemoveMidiSustainPedalEventsCommand {
  const fixture = createCompleteProjectFixture()

  return createRemoveMidiSustainPedalEventsCommand({
    baseRevision: store.modelRevision,
    sourceId: fixture.records.nonLoopSource.id,
    eventIds: [fixture.records.nonLoopPedalDown.id, fixture.records.nonLoopPedalUp.id],
    ...overrides,
  })
}

function createReplaceValueCommand(
  store: ModelStore,
  overrides: Partial<CreateReplaceMidiSustainPedalEventValueCommandInput> = {},
): ReplaceMidiSustainPedalEventValueCommand {
  const fixture = createCompleteProjectFixture()

  return createReplaceMidiSustainPedalEventValueCommand({
    baseRevision: store.modelRevision,
    sourceId: fixture.records.nonLoopSource.id,
    eventId: fixture.records.nonLoopPedalDown.id,
    value: parseMidiControlValue(64),
    ...overrides,
  })
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

function requireAddedChange(change: ProjectChange | undefined): MidiSustainPedalEventAddedChange {
  expect(change?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADDED)
  if (change?.type !== PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADDED) {
    throw new Error('Expected an added MIDI Sustain Pedal Event change')
  }
  return change
}

function requireRemovedChange(
  change: ProjectChange | undefined,
): MidiSustainPedalEventRemovedChange {
  expect(change?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVED)
  if (change?.type !== PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVED) {
    throw new Error('Expected a removed MIDI Sustain Pedal Event change')
  }
  return change
}

function requireUpdatedChange(
  change: ProjectChange | undefined,
): MidiSustainPedalEventUpdatedChange {
  expect(change?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.UPDATED)
  if (change?.type !== PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.UPDATED) {
    throw new Error('Expected an updated MIDI Sustain Pedal Event change')
  }
  return change
}

describe('MIDI Sustain Pedal Event command public contract', () => {
  it('normalizes Add, collection Move / Remove, and Value Replace intents', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const add = createAddCommand(store)
    const move = createMoveCommand(store)
    const remove = createRemoveCommand(store)
    const replaceValue = createReplaceValueCommand(store)

    expect(add).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      event: {
        id: ADDED_EVENT_ID,
        tick: ADDED_EVENT_TICK,
        value: ADDED_EVENT_VALUE,
        channel: ADDED_EVENT_CHANNEL,
      },
    })
    expect(move.type).toBe(PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE)
    expect(remove.type).toBe(PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE)
    expect(replaceValue).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      eventId: fixture.records.nonLoopPedalDown.id,
      value: parseMidiControlValue(64),
    })
    expect(Object.isFrozen(move.eventIds)).toBe(true)
    expect(Object.isFrozen(remove.eventIds)).toBe(true)
    expectTypeOf(add).toEqualTypeOf<AddMidiSustainPedalEventCommand>()
    expectTypeOf(move).toEqualTypeOf<MoveMidiSustainPedalEventsCommand>()
    expectTypeOf(remove).toEqualTypeOf<RemoveMidiSustainPedalEventsCommand>()
    expectTypeOf(replaceValue).toEqualTypeOf<ReplaceMidiSustainPedalEventValueCommand>()
  })

  it('rejects empty and duplicate collection targets', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    expect(
      captureCommandError(() =>
        createMoveCommand(store, { eventIds: [], deltaTick: parseTickDelta(0) }),
      ).code,
    ).toBe('empty-sustain-pedal-event-id-list')
    expect(
      captureCommandError(() =>
        createRemoveCommand(store, {
          eventIds: [fixture.records.nonLoopPedalDown.id, fixture.records.nonLoopPedalDown.id],
        }),
      ),
    ).toMatchObject({
      code: 'duplicate-sustain-pedal-event-id',
      sustainPedalEventId: fixture.records.nonLoopPedalDown.id,
    })
  })
})

describe('Add MIDI Sustain Pedal Event preparation', () => {
  it('prepares one exact insertion and removal inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const preparation = requireReadyProjectCommandPreparation(prepareProjectCommand(store, command))

    if (preparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD) {
      throw new Error('Expected a normalized Sustain Pedal Event Add command')
    }

    expect(preparation.command).not.toBe(command)
    expect(preparation.plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.INSERT,
        sourceId: command.sourceId,
        after: preparation.command.event,
      },
    ])
    expect(preparation.plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE,
        sourceId: command.sourceId,
        before: preparation.command.event,
      },
    ])
  })

  it('allows the Source terminal Tick and the same Tick on another MIDI Channel', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    expect(() =>
      prepareProjectCommand(
        store,
        createAddCommand(store, {
          eventId: parseMidiSustainPedalEventId('sustain-pedal-at-source-end'),
          tick: fixture.records.nonLoopSource.lengthTick,
        }),
      ),
    ).not.toThrow()
    expect(() =>
      prepareProjectCommand(
        store,
        createAddCommand(store, {
          eventId: parseMidiSustainPedalEventId('sustain-pedal-same-tick-other-channel'),
          tick: fixture.records.nonLoopPedalDown.tick,
          channel: parseMidiChannel(1),
        }),
      ),
    ).not.toThrow()
  })

  it('rejects missing ownership, duplicate identity, occupied position, and out-of-range Tick', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingSourceId = parseMidiSourceId('missing-sustain-pedal-source')

    expect(
      captureCommandError(() =>
        prepareProjectCommand(store, createAddCommand(store, { sourceId: missingSourceId })),
      ),
    ).toMatchObject({ code: 'midi-source-not-found', sourceId: missingSourceId })
    expect(
      captureCommandError(() =>
        prepareProjectCommand(
          store,
          createAddCommand(store, { eventId: fixture.records.loopingPedalDown.id }),
        ),
      ),
    ).toMatchObject({
      code: 'sustain-pedal-event-id-already-exists',
      sustainPedalEventId: fixture.records.loopingPedalDown.id,
    })
    expect(
      captureCommandError(() =>
        prepareProjectCommand(
          store,
          createAddCommand(store, {
            tick: fixture.records.nonLoopPedalDown.tick,
            channel: parseMidiChannel(0),
          }),
        ),
      ),
    ).toMatchObject({
      code: 'sustain-pedal-event-tick-channel-already-exists',
      blockingSustainPedalEventId: fixture.records.nonLoopPedalDown.id,
    })
    expect(
      captureCommandError(() =>
        prepareProjectCommand(
          store,
          createAddCommand(store, {
            tick: parseTick(fixture.records.nonLoopSource.lengthTick + 1),
          }),
        ),
      ).code,
    ).toBe('sustain-pedal-event-out-of-source-range')

    const missingPartitionFixture = createCompleteProjectFixture()
    missingPartitionFixture.containers.midiSustainPedalEventsBySource.delete(
      missingPartitionFixture.records.nonLoopSource.id,
    )
    const missingPartitionStore = new ModelStore(missingPartitionFixture.seed)
    expect(
      captureCommandError(() =>
        prepareProjectCommand(missingPartitionStore, createAddCommand(missingPartitionStore)),
      ).code,
    ).toBe('sustain-pedal-event-partition-missing')
  })
})

describe('Move, Remove, and Value Replace preparation', () => {
  it('moves an ordered collection with one shared Tick delta and exact inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(store)
    const preparation = requireReadyProjectCommandPreparation(prepareProjectCommand(store, command))

    expect(preparation.plan.forward).toHaveLength(2)
    expect(preparation.plan.forward).toMatchObject([
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalDown,
        after: { ...fixture.records.nonLoopPedalDown, tick: 480 },
      },
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalUp,
        after: { ...fixture.records.nonLoopPedalUp, tick: 1_020 },
      },
    ])
    expect(preparation.plan.inverse.map(({ type }) => type)).toEqual([
      PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
      PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
    ])
  })

  it('returns no-change for a zero Tick delta or an unchanged raw value', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    expect(
      prepareProjectCommand(store, createMoveCommand(store, { deltaTick: parseTickDelta(0) })),
    ).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
    expect(
      prepareProjectCommand(
        store,
        createReplaceValueCommand(store, { value: fixture.records.nonLoopPedalDown.value }),
      ),
    ).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
  })

  it('replaces only the raw value and removes a collection in requested order', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const replacePreparation = requireReadyProjectCommandPreparation(
      prepareProjectCommand(store, createReplaceValueCommand(store)),
    )
    const removePreparation = requireReadyProjectCommandPreparation(
      prepareProjectCommand(store, createRemoveCommand(store)),
    )

    expect(replacePreparation.plan.forward).toMatchObject([
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalDown,
        after: {
          ...fixture.records.nonLoopPedalDown,
          value: 64,
        },
      },
    ])
    expect(removePreparation.plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalDown,
      },
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalUp,
      },
    ])
  })

  it('rejects missing targets, range overflow, and collision with an unselected Event', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingEventId = parseMidiSustainPedalEventId('missing-sustain-pedal-event')

    expect(
      captureCommandError(() =>
        prepareProjectCommand(store, createRemoveCommand(store, { eventIds: [missingEventId] })),
      ),
    ).toMatchObject({
      code: 'sustain-pedal-event-not-found',
      sustainPedalEventId: missingEventId,
    })
    expect(
      captureCommandError(() =>
        prepareProjectCommand(
          store,
          createMoveCommand(store, {
            eventIds: [fixture.records.nonLoopPedalDown.id],
            deltaTick: parseTickDelta(-400),
          }),
        ),
      ).code,
    ).toBe('sustain-pedal-event-out-of-source-range')
    expect(
      captureCommandError(() =>
        prepareProjectCommand(
          store,
          createMoveCommand(store, {
            eventIds: [fixture.records.nonLoopPedalUp.id],
            deltaTick: parseTickDelta(1_100),
          }),
        ),
      ).code,
    ).toBe('sustain-pedal-event-out-of-source-range')
    expect(
      captureCommandError(() =>
        prepareProjectCommand(
          store,
          createMoveCommand(store, {
            eventIds: [fixture.records.nonLoopPedalDown.id],
            deltaTick: parseTickDelta(540),
          }),
        ),
      ),
    ).toMatchObject({
      code: 'sustain-pedal-event-tick-channel-already-exists',
      blockingSustainPedalEventId: fixture.records.nonLoopPedalUp.id,
    })
  })
})

describe('MIDI Sustain Pedal Event command-plan correspondence', () => {
  it('fails closed when a plan changes the Add payload or reorders collection removal', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const addPreparation = requireReadyProjectCommandPreparation(
      prepareProjectCommand(store, createAddCommand(store)),
    )
    if (addPreparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD) {
      throw new Error('Expected a normalized Sustain Pedal Event Add command')
    }
    const wrongAddPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.INSERT,
        sourceId: addPreparation.command.sourceId,
        after: createMidiSustainPedalEventRecord({
          ...addPreparation.command.event,
          value: parseMidiControlValue(64),
        }),
      },
    ])
    expect(() => createProjectCommitCandidate(addPreparation.command, wrongAddPlan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )

    const removePreparation = requireReadyProjectCommandPreparation(
      prepareProjectCommand(store, createRemoveCommand(store)),
    )
    if (removePreparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE) {
      throw new Error('Expected a normalized Sustain Pedal Event Remove command')
    }
    const reorderedRemovePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalUp,
      },
      {
        type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopPedalDown,
      },
    ])
    expect(() =>
      createProjectCommitCandidate(removePreparation.command, reorderedRemovePlan),
    ).toThrowError(expect.objectContaining({ code: 'command-plan-mismatch' }))
  })
})

describe('MIDI Sustain Pedal Event commit and History semantics', () => {
  it('round-trips Add, Move, Value Replace, and Remove without notifying Note observers', async () => {
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

    const addResult = session.execute(createAddCommand(store))
    expect(addResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (addResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Sustain Pedal Event Add to commit')
    }
    const added = requireAddedChange(addResult.commit.delta.changes[0])
    expect(added.affectedFromTick).toBe(ADDED_EVENT_TICK)
    expect(store.getMidiSustainPedalEvent(added.sourceId, added.sustainPedalEventId)).toBe(
      added.after,
    )

    const moveResult = session.execute(
      createMoveMidiSustainPedalEventsCommand({
        baseRevision: session.modelRevision,
        sourceId: added.sourceId,
        eventIds: [added.sustainPedalEventId],
        deltaTick: parseTickDelta(120),
      }),
    )
    expect(moveResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (moveResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Sustain Pedal Event Move to commit')
    }
    const moved = requireUpdatedChange(moveResult.commit.delta.changes[0])
    expect(moved.before).toBe(added.after)
    expect(moved.after.tick).toBe(1_320)
    expect(moved.affectedFromTick).toBe(1_200)

    const replaceResult = session.execute(
      createReplaceMidiSustainPedalEventValueCommand({
        baseRevision: session.modelRevision,
        sourceId: moved.sourceId,
        eventId: moved.sustainPedalEventId,
        value: parseMidiControlValue(0),
      }),
    )
    expect(replaceResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (replaceResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Sustain Pedal Event Value Replace to commit')
    }
    const replaced = requireUpdatedChange(replaceResult.commit.delta.changes[0])
    expect(replaced.before).toBe(moved.after)
    expect(replaced.after.value).toBe(0)
    expect(replaced.affectedFromTick).toBe(1_320)

    const removeResult = session.execute(
      createRemoveMidiSustainPedalEventsCommand({
        baseRevision: session.modelRevision,
        sourceId: replaced.sourceId,
        eventIds: [replaced.sustainPedalEventId],
      }),
    )
    expect(removeResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (removeResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Sustain Pedal Event Remove to commit')
    }
    const removed = requireRemovedChange(removeResult.commit.delta.changes[0])
    expect(removed.before).toBe(replaced.after)
    expect(removed.affectedFromTick).toBe(1_320)
    expect(
      store.getMidiSustainPedalEvent(removed.sourceId, removed.sustainPedalEventId),
    ).toBeUndefined()

    const undoRemove = session.undo()
    const undoReplace = session.undo()
    const undoMove = session.undo()
    const undoAdd = session.undo()
    expect(requireAddedChange(undoRemove?.delta.changes[0]).after).toBe(replaced.after)
    expect(requireUpdatedChange(undoReplace?.delta.changes[0])).toMatchObject({
      before: replaced.after,
      after: moved.after,
    })
    expect(requireUpdatedChange(undoMove?.delta.changes[0])).toMatchObject({
      before: moved.after,
      after: added.after,
    })
    expect(requireRemovedChange(undoAdd?.delta.changes[0]).before).toBe(added.after)
    expect(undoAdd?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD,
    })

    const redoAdd = session.redo()
    const redoMove = session.redo()
    const redoReplace = session.redo()
    const redoRemove = session.redo()
    expect(requireAddedChange(redoAdd?.delta.changes[0]).after).toBe(added.after)
    expect(requireUpdatedChange(redoMove?.delta.changes[0]).after).toBe(moved.after)
    expect(requireUpdatedChange(redoReplace?.delta.changes[0]).after).toBe(replaced.after)
    expect(requireRemovedChange(redoRemove?.delta.changes[0]).before).toBe(replaced.after)
    expect(
      store.getMidiSustainPedalEvent(added.sourceId, added.sustainPedalEventId),
    ).toBeUndefined()

    await Promise.resolve()
    expect(allCommits).toEqual([
      addResult.commit,
      moveResult.commit,
      replaceResult.commit,
      removeResult.commit,
      undoRemove,
      undoReplace,
      undoMove,
      undoAdd,
      redoAdd,
      redoMove,
      redoReplace,
      redoRemove,
    ])
    expect(noteCommits).toEqual([])
    expect(
      store.getMidiSustainPedalEvent(
        fixture.records.nonLoopSource.id,
        fixture.records.nonLoopPedalDown.id,
      ),
    ).toBe(fixture.records.nonLoopPedalDown)
  })
})
