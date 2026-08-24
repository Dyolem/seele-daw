import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddTempoEventCommand,
  createAllProjectCommitsSubscription,
  createMidiNoteChangesSubscription,
  createMoveTempoEventCommand,
  createRemoveTempoEventCommand,
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type AddTempoEventCommand,
  type CreateAddTempoEventCommandInput,
  type CreateMoveTempoEventCommandInput,
  type CreateRemoveTempoEventCommandInput,
  type MoveTempoEventCommand,
  type ProjectChange,
  type ProjectCommit,
  type RemoveTempoEventCommand,
  type TempoEventAddedChange,
  type TempoEventRemovedChange,
  type TempoEventUpdatedChange,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

const ADDED_TEMPO_EVENT_ID = parseTempoEventId('tempo-event-added')
const ADDED_TEMPO_EVENT_TICK = parseTick(1_920)
const MOVED_TEMPO_EVENT_TICK = parseTick(5_760)
const ADDED_TEMPO_EVENT_BPM = parseTempoBpm(96.5)

function createAddCommand(
  store: ModelStore,
  overrides: Partial<CreateAddTempoEventCommandInput> = {},
): AddTempoEventCommand {
  return createAddTempoEventCommand({
    baseRevision: store.modelRevision,
    tempoEventId: ADDED_TEMPO_EVENT_ID,
    tick: ADDED_TEMPO_EVENT_TICK,
    bpm: ADDED_TEMPO_EVENT_BPM,
    ...overrides,
  })
}

function createMoveCommand(
  store: ModelStore,
  overrides: Partial<CreateMoveTempoEventCommandInput> = {},
): MoveTempoEventCommand {
  return createMoveTempoEventCommand({
    baseRevision: store.modelRevision,
    tempoEventId: ADDED_TEMPO_EVENT_ID,
    tick: MOVED_TEMPO_EVENT_TICK,
    ...overrides,
  })
}

function createRemoveCommand(
  store: ModelStore,
  overrides: Partial<CreateRemoveTempoEventCommandInput> = {},
): RemoveTempoEventCommand {
  return createRemoveTempoEventCommand({
    baseRevision: store.modelRevision,
    tempoEventId: ADDED_TEMPO_EVENT_ID,
    ...overrides,
  })
}

function requireAddedChange(change: ProjectChange | undefined): TempoEventAddedChange {
  expect(change).toMatchObject({ type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED })
  if (change?.type !== PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED) {
    throw new Error('Expected an added Tempo Event change')
  }
  return change
}

function requireRemovedChange(change: ProjectChange | undefined): TempoEventRemovedChange {
  expect(change).toMatchObject({ type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.REMOVED })
  if (change?.type !== PROJECT_CHANGE_TYPE.TEMPO_EVENT.REMOVED) {
    throw new Error('Expected a removed Tempo Event change')
  }
  return change
}

function requireUpdatedChange(change: ProjectChange | undefined): TempoEventUpdatedChange {
  expect(change).toMatchObject({ type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.UPDATED })
  if (change?.type !== PROJECT_CHANGE_TYPE.TEMPO_EVENT.UPDATED) {
    throw new Error('Expected an updated Tempo Event change')
  }
  return change
}

describe('Tempo Event lifecycle command public contract', () => {
  it('normalizes Add, Move, and Remove intents from the package root', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const add = createAddCommand(store)
    const move = createMoveCommand(store)
    const remove = createRemoveCommand(store)

    expect(add).toEqual({
      type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD,
      baseRevision: store.modelRevision,
      tempoEvent: {
        id: ADDED_TEMPO_EVENT_ID,
        tick: ADDED_TEMPO_EVENT_TICK,
        bpm: ADDED_TEMPO_EVENT_BPM,
      },
    })
    expect(move).toEqual({
      type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
      baseRevision: store.modelRevision,
      tempoEventId: ADDED_TEMPO_EVENT_ID,
      tick: MOVED_TEMPO_EVENT_TICK,
    })
    expect(remove).toEqual({
      type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE,
      baseRevision: store.modelRevision,
      tempoEventId: ADDED_TEMPO_EVENT_ID,
    })
    expectTypeOf(add).toEqualTypeOf<AddTempoEventCommand>()
    expectTypeOf(move).toEqualTypeOf<MoveTempoEventCommand>()
    expectTypeOf(remove).toEqualTypeOf<RemoveTempoEventCommand>()
  })
})

describe('AddTempoEventCommand preparation', () => {
  it('prepares one exact insertion and removal inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    if (preparation.status !== 'ready') {
      throw new Error('Expected a ready Tempo Event insertion')
    }
    if (
      preparation.command.type !== PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD ||
      plan.forward[0]?.type !== PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT
    ) {
      throw new Error('Expected a normalized Tempo Event insertion')
    }

    expect(plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
        after: preparation.command.tempoEvent,
      },
    ])
    expect(plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
        before: preparation.command.tempoEvent,
      },
    ])
    expect(preparation.command).not.toBe(command)
    expect(plan.forward[0]?.after).toBe(preparation.command.tempoEvent)
  })

  it('rejects duplicate identities and occupied Project Ticks before writing', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    expect(() =>
      prepareProjectCommand(
        store,
        createAddCommand(store, { tempoEventId: fixture.records.laterTempoEvent.id }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'tempo-event-id-already-exists',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD,
        tempoEventId: fixture.records.laterTempoEvent.id,
      }),
    )

    expect(() =>
      prepareProjectCommand(
        store,
        createAddCommand(store, { tick: fixture.records.laterTempoEvent.tick }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'tempo-event-tick-already-exists',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD,
        tempoEventId: ADDED_TEMPO_EVENT_ID,
        tempoEventTick: fixture.records.laterTempoEvent.tick,
        blockingTempoEventId: fixture.records.laterTempoEvent.id,
      }),
    )
  })
})

describe('MoveTempoEventCommand preparation', () => {
  it('prepares one identity- and BPM-preserving replacement with an exact inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveTempoEventCommand({
      baseRevision: store.modelRevision,
      tempoEventId: fixture.records.laterTempoEvent.id,
      tick: MOVED_TEMPO_EVENT_TICK,
    })
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    if (
      preparation.status !== 'ready' ||
      preparation.command.type !== PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE ||
      plan.forward[0]?.type !== PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE
    ) {
      throw new Error('Expected a ready Tempo Event move')
    }

    const forward = plan.forward[0]
    expect(forward.before).toBe(fixture.records.laterTempoEvent)
    expect(forward.after).toEqual({
      ...fixture.records.laterTempoEvent,
      tick: MOVED_TEMPO_EVENT_TICK,
    })
    expect(forward.after.bpm).toBe(forward.before.bpm)
    expect(plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before: forward.after,
        after: fixture.records.laterTempoEvent,
      },
    ])
  })

  it('returns no-change for the exact current Tick', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    expect(
      prepareProjectCommand(
        store,
        createMoveTempoEventCommand({
          baseRevision: store.modelRevision,
          tempoEventId: fixture.records.laterTempoEvent.id,
          tick: fixture.records.laterTempoEvent.tick,
        }),
      ),
    ).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
  })

  it('protects the initial Event and rejects missing or occupied targets', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingTempoEventId = parseTempoEventId('tempo-event-missing')

    expect(() =>
      prepareProjectCommand(
        store,
        createMoveTempoEventCommand({
          baseRevision: store.modelRevision,
          tempoEventId: fixture.records.initialTempoEvent.id,
          tick: parseTick(960),
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'initial-tempo-event-cannot-move',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
        tempoEventId: fixture.records.initialTempoEvent.id,
      }),
    )
    expect(() =>
      prepareProjectCommand(
        store,
        createMoveTempoEventCommand({
          baseRevision: store.modelRevision,
          tempoEventId: missingTempoEventId,
          tick: parseTick(960),
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'tempo-event-not-found',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
        tempoEventId: missingTempoEventId,
      }),
    )
    expect(() =>
      prepareProjectCommand(
        store,
        createMoveTempoEventCommand({
          baseRevision: store.modelRevision,
          tempoEventId: fixture.records.laterTempoEvent.id,
          tick: fixture.records.initialTempoEvent.tick,
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'tempo-event-tick-already-exists',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
        tempoEventId: fixture.records.laterTempoEvent.id,
        blockingTempoEventId: fixture.records.initialTempoEvent.id,
      }),
    )
  })
})

describe('RemoveTempoEventCommand preparation', () => {
  it('prepares one exact removal and insertion inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveTempoEventCommand({
      baseRevision: store.modelRevision,
      tempoEventId: fixture.records.laterTempoEvent.id,
    })
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    expect(plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
        before: fixture.records.laterTempoEvent,
      },
    ])
    expect(plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
        after: fixture.records.laterTempoEvent,
      },
    ])
  })

  it('protects the initial Event and rejects a missing Event', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingTempoEventId = parseTempoEventId('tempo-event-missing')

    expect(() =>
      prepareProjectCommand(
        store,
        createRemoveTempoEventCommand({
          baseRevision: store.modelRevision,
          tempoEventId: fixture.records.initialTempoEvent.id,
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'initial-tempo-event-cannot-remove',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE,
        tempoEventId: fixture.records.initialTempoEvent.id,
      }),
    )
    expect(() =>
      prepareProjectCommand(
        store,
        createRemoveTempoEventCommand({
          baseRevision: store.modelRevision,
          tempoEventId: missingTempoEventId,
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'tempo-event-not-found',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE,
        tempoEventId: missingTempoEventId,
      }),
    )
  })
})

describe('Tempo Event lifecycle command-plan correspondence', () => {
  it('fails closed when supplied plans do not represent the exact lifecycle intent', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    const addPreparation = prepareProjectCommand(store, createAddCommand(store))
    const addPlan = requireReadyProjectCommandPlan(addPreparation)
    if (
      addPreparation.status !== 'ready' ||
      addPreparation.command.type !== PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD
    ) {
      throw new Error('Expected a ready Tempo Event insertion')
    }
    const wrongAddPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
        after: createTempoEventRecord({
          ...addPreparation.command.tempoEvent,
          bpm: parseTempoBpm(97),
        }),
      },
    ])
    expect(() => createProjectCommitCandidate(addPreparation.command, wrongAddPlan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )
    expect(() => createProjectCommitCandidate(addPreparation.command, addPlan)).not.toThrow()

    const moveCommand = createMoveTempoEventCommand({
      baseRevision: store.modelRevision,
      tempoEventId: fixture.records.laterTempoEvent.id,
      tick: MOVED_TEMPO_EVENT_TICK,
    })
    const movePreparation = prepareProjectCommand(store, moveCommand)
    if (
      movePreparation.status !== 'ready' ||
      movePreparation.command.type !== PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE
    ) {
      throw new Error('Expected a ready Tempo Event move')
    }
    const wrongMovePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before: fixture.records.laterTempoEvent,
        after: createTempoEventRecord({
          ...fixture.records.laterTempoEvent,
          tick: MOVED_TEMPO_EVENT_TICK,
          bpm: parseTempoBpm(129),
        }),
      },
    ])
    expect(() => createProjectCommitCandidate(movePreparation.command, wrongMovePlan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )

    const removeCommand = createRemoveTempoEventCommand({
      baseRevision: store.modelRevision,
      tempoEventId: fixture.records.laterTempoEvent.id,
    })
    const removePreparation = prepareProjectCommand(store, removeCommand)
    if (
      removePreparation.status !== 'ready' ||
      removePreparation.command.type !== PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE
    ) {
      throw new Error('Expected a ready Tempo Event removal')
    }
    const wrongRemovePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
        before: fixture.records.initialTempoEvent,
      },
    ])
    expect(() =>
      createProjectCommitCandidate(removePreparation.command, wrongRemovePlan),
    ).toThrowError(expect.objectContaining({ code: 'command-plan-mismatch' }))
  })
})

describe('Tempo Event lifecycle commit and History semantics', () => {
  it('round-trips Add, Move, and Remove as semantic changes without notifying Note observers', async () => {
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
      throw new Error('Expected Tempo Event insertion to commit')
    }
    const addedChange = requireAddedChange(addResult.commit.delta.changes[0])
    expect(addedChange).toEqual({
      type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED,
      tempoEventId: ADDED_TEMPO_EVENT_ID,
      after: {
        id: ADDED_TEMPO_EVENT_ID,
        tick: ADDED_TEMPO_EVENT_TICK,
        bpm: ADDED_TEMPO_EVENT_BPM,
      },
    })
    expect(store.getTempoEvent(ADDED_TEMPO_EVENT_ID)).toBe(addedChange.after)

    const moveResult = session.execute(createMoveCommand(store))
    expect(moveResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (moveResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Tempo Event move to commit')
    }
    const movedChange = requireUpdatedChange(moveResult.commit.delta.changes[0])
    expect(movedChange.before).toBe(addedChange.after)
    expect(movedChange.after).toEqual({ ...addedChange.after, tick: MOVED_TEMPO_EVENT_TICK })
    expect(store.getTempoEvent(ADDED_TEMPO_EVENT_ID)).toBe(movedChange.after)
    expect(session.getSnapshot().tempoEvents).toEqual([
      fixture.records.initialTempoEvent,
      fixture.records.laterTempoEvent,
      movedChange.after,
    ])

    const removeResult = session.execute(createRemoveCommand(store))
    expect(removeResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (removeResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Tempo Event removal to commit')
    }
    const removedChange = requireRemovedChange(removeResult.commit.delta.changes[0])
    expect(removedChange.before).toBe(movedChange.after)
    expect(store.getTempoEvent(ADDED_TEMPO_EVENT_ID)).toBeUndefined()

    const undoRemove = session.undo()
    const undoRemoveChange = requireAddedChange(undoRemove?.delta.changes[0])
    expect(undoRemove?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE,
    })
    expect(undoRemoveChange.after).toBe(movedChange.after)

    const undoMove = session.undo()
    const undoMoveChange = requireUpdatedChange(undoMove?.delta.changes[0])
    expect(undoMove?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
    })
    expect(undoMoveChange.before).toBe(movedChange.after)
    expect(undoMoveChange.after).toBe(addedChange.after)

    const undoAdd = session.undo()
    const undoAddChange = requireRemovedChange(undoAdd?.delta.changes[0])
    expect(undoAdd?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD,
    })
    expect(undoAddChange.before).toBe(addedChange.after)
    expect(store.getTempoEvent(ADDED_TEMPO_EVENT_ID)).toBeUndefined()

    const redoAdd = session.redo()
    const redoMove = session.redo()
    const redoRemove = session.redo()
    expect(requireAddedChange(redoAdd?.delta.changes[0]).after).toBe(addedChange.after)
    expect(requireUpdatedChange(redoMove?.delta.changes[0]).after).toBe(movedChange.after)
    expect(requireRemovedChange(redoRemove?.delta.changes[0]).before).toBe(movedChange.after)
    expect(store.getTempoEvent(ADDED_TEMPO_EVENT_ID)).toBeUndefined()
    expect(session.getSnapshot().tempoEvents).toEqual([
      fixture.records.initialTempoEvent,
      fixture.records.laterTempoEvent,
    ])

    await Promise.resolve()
    expect(allCommits).toEqual([
      addResult.commit,
      moveResult.commit,
      removeResult.commit,
      undoRemove,
      undoMove,
      undoAdd,
      redoAdd,
      redoMove,
      redoRemove,
    ])
    expect(noteCommits).toEqual([])
  })
})
