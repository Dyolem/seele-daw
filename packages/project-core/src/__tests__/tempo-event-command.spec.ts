import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAllProjectCommitsSubscription,
  createMidiNoteChangesSubscription,
  createReplaceTempoEventBpmCommand,
  parseTempoBpm,
  parseTempoEventId,
  type CreateReplaceTempoEventBpmCommandInput,
  type ProjectCommit,
  type ReplaceTempoEventBpmCommand,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { ModelStore } from '#internal/model/model-store'
import {
  createCompleteProjectFixture,
  type CompleteProjectFixture,
} from './support/complete-project-fixture'
import { requireChange } from './support/project-change-test-support'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createCommandInput(
  store: ModelStore,
  fixture: CompleteProjectFixture,
  overrides: Partial<CreateReplaceTempoEventBpmCommandInput> = {},
): CreateReplaceTempoEventBpmCommandInput {
  return {
    baseRevision: store.modelRevision,
    tempoEventId: fixture.records.initialTempoEvent.id,
    bpm: parseTempoBpm(143.999_884_800_092_16),
    ...overrides,
  }
}

function createCommand(
  store: ModelStore,
  fixture: CompleteProjectFixture,
  overrides: Partial<CreateReplaceTempoEventBpmCommandInput> = {},
): ReplaceTempoEventBpmCommand {
  return createReplaceTempoEventBpmCommand(createCommandInput(store, fixture, overrides))
}

describe('ReplaceTempoEventBpmCommand public contract', () => {
  it('normalizes one BPM-only Tempo Event intent from the package root', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store, fixture)

    expect(PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM).toBe('tempo-event.replace-bpm')
    expect(command).toEqual({
      type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
      baseRevision: store.modelRevision,
      tempoEventId: fixture.records.initialTempoEvent.id,
      bpm: parseTempoBpm(143.999_884_800_092_16),
    })
    expectTypeOf(command).toEqualTypeOf<ReplaceTempoEventBpmCommand>()
  })
})

describe('ReplaceTempoEventBpmCommand preparation', () => {
  it('prepares one identity- and Tick-preserving replacement with an exact inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store, fixture)
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    if (
      preparation.status !== 'ready' ||
      preparation.command.type !== PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM
    ) {
      throw new Error('Expected a ready Tempo Event BPM replacement')
    }

    const forward = requireChange(plan.forward, 'tempoEvents', 'replace')
    expect(forward.before).toBe(fixture.records.initialTempoEvent)
    expect(forward.after).toEqual({
      ...fixture.records.initialTempoEvent,
      bpm: command.bpm,
    })
    expect(forward.after.id).toBe(forward.before.id)
    expect(forward.after.tick).toBe(forward.before.tick)
    expect(plan.inverse).toEqual([
      {
        op: 'replace',
        table: 'tempoEvents',
        before: forward.after,
        after: fixture.records.initialTempoEvent,
      },
    ])
    expect(preparation.command).not.toBe(command)
    expect(preparation.command.bpm).toBe(forward.after.bpm)
  })

  it('returns no-change when the exact stored BPM is already at the target', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)

    expect(
      prepareProjectCommand(
        store,
        createCommand(store, fixture, { bpm: fixture.records.initialTempoEvent.bpm }),
      ),
    ).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
  })

  it('rejects a missing Tempo Event with stable command details', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingTempoEventId = parseTempoEventId('tempo-event-missing')

    expect(() =>
      prepareProjectCommand(
        store,
        createCommand(store, fixture, { tempoEventId: missingTempoEventId }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'tempo-event-not-found',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
        tempoEventId: missingTempoEventId,
      }),
    )
  })
})

describe('Tempo Event BPM commit and History semantics', () => {
  it('commits one semantic update and restores the exact imported BPM through Undo / Redo', async () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const original = fixture.records.initialTempoEvent
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
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Tempo Event BPM replacement to commit')
    }

    const change = requireChange(result.commit, 'tempoEvents', 'replace')
    expect(result.commit).toMatchObject({
      baseRevision: 0,
      modelRevision: 1,
      origin: {
        kind: 'command',
        commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
      },
    })
    expect(result.commit.changes).toHaveLength(1)
    expect(change).toEqual({
      op: 'replace',
      table: 'tempoEvents',
      before: original,
      after: {
        ...original,
        bpm: parseTempoBpm(143.999_884_800_092_16),
      },
    })
    expect(Object.isFrozen(change)).toBe(true)
    expect(store.getTempoEvent(original.id)).toBe(change.after)

    const undoCommit = session.undo()
    const undoChange = requireChange(undoCommit, 'tempoEvents', 'replace')
    expect(undoCommit?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
    })
    expect(undoChange.before).toBe(change.after)
    expect(undoChange.after).toBe(original)
    expect(store.getTempoEvent(original.id)).toBe(original)

    const redoCommit = session.redo()
    const redoChange = requireChange(redoCommit, 'tempoEvents', 'replace')
    expect(redoCommit?.origin).toEqual({
      kind: 'history',
      direction: PROJECT_HISTORY_DIRECTION.REDO,
      commandType: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
    })
    expect(redoChange.before).toBe(original)
    expect(redoChange.after).toBe(change.after)
    expect(store.getTempoEvent(original.id)).toBe(change.after)

    await Promise.resolve()
    expect(allCommits).toEqual([result.commit, undoCommit, redoCommit])
    expect(noteCommits).toEqual([])
  })

  it('does not advance revision, History, or content identity for an exact BPM match', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const contentStateId = session.contentStateId
    const result = session.execute(
      createCommand(store, fixture, { bpm: fixture.records.initialTempoEvent.bpm }),
    )

    expect(result).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      modelRevision: 0,
    })
    expect(session.modelRevision).toBe(0)
    expect(session.contentStateId).toBe(contentStateId)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(false)
    expect(store.getTempoEvent(fixture.records.initialTempoEvent.id)).toBe(
      fixture.records.initialTempoEvent,
    )
  })
})
