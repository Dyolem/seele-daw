import { describe, expect, it } from 'vitest'

import * as projectCore from '~/index'
import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_COMMIT_ORIGIN_KIND,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddNoteCommand,
  createMoveNoteCommand,
  createRemoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type ProjectCommandExecutionResult,
  type ProjectCommit,
  type ProjectSession,
} from '~/index'
import { MutationApplyError } from '@/mutation/mutation-apply-error'
import { withAuthoritativeMapSetInterceptor } from './support/map-set-interceptor'
import { createFixtureProjectSession } from './support/project-session-test-support'

function requireCommitted(result: ProjectCommandExecutionResult): ProjectCommit {
  expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected a committed ProjectCommand result')
  }

  return result.commit
}

function executeMove(
  session: ProjectSession,
  sourceId: Parameters<typeof createMoveNoteCommand>[0]['sourceId'],
  noteId: Parameters<typeof createMoveNoteCommand>[0]['noteId'],
  nextStartTick: Parameters<typeof createMoveNoteCommand>[0]['nextStartTick'],
  nextPitch: Parameters<typeof createMoveNoteCommand>[0]['nextPitch'],
): ProjectCommit {
  return requireCommitted(
    session.execute(
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId,
        nextStartTick,
        nextPitch,
      }),
    ),
  )
}

describe('Project History public boundary', () => {
  it('starts empty and keeps HistoryController out of the package root', () => {
    const { session } = createFixtureProjectSession()

    expect(PROJECT_COMMIT_ORIGIN_KIND.HISTORY).toBe('history')
    expect(PROJECT_HISTORY_DIRECTION).toEqual({ REDO: 'redo', UNDO: 'undo' })
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(false)
    expect(session.undo()).toBeNull()
    expect(session.redo()).toBeNull()
    expect(session.modelRevision).toBe(0)
    expect('HistoryController' in projectCore).toBe(false)
    expect('createHistoryProjectCommitCandidate' in projectCore).toBe(false)
  })
})

describe('ProjectSession Undo / Redo', () => {
  it('undoes and redoes AddNote with new commits and the original Record reference', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const noteId = parseNoteId('note-history-added')
    const command = createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(104),
      channel: parseMidiChannel(2),
    })
    const originalCommit = requireCommitted(session.execute(command))
    const addedRecord = store.getMidiNote(command.sourceId, noteId)

    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    const undoCommit = session.undo()

    expect(undoCommit).toMatchObject({
      baseRevision: 1,
      modelRevision: 2,
      origin: {
        kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
        direction: PROJECT_HISTORY_DIRECTION.UNDO,
        commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
      },
      delta: { changes: [{ type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED, before: addedRecord }] },
    })
    expect(store.getMidiNote(command.sourceId, noteId)).toBeUndefined()
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    const redoCommit = session.redo()

    expect(redoCommit).toMatchObject({
      baseRevision: 2,
      modelRevision: 3,
      origin: {
        kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
        direction: PROJECT_HISTORY_DIRECTION.REDO,
        commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
      },
      delta: { changes: [{ type: PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED, after: addedRecord }] },
    })
    expect(store.getMidiNote(command.sourceId, noteId)).toBe(addedRecord)
    expect(redoCommit).not.toBe(originalCommit)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
    expect(session.modelRevision).toBe(3)
  })

  it('restores exact before and after Record references across MoveNote Undo / Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote
    const moveCommit = executeMove(
      session,
      fixture.records.nonLoopSource.id,
      before.id,
      parseTick(960),
      parseMidiPitch(67),
    )
    const moveChange = moveCommit.delta.changes[0]

    expect(moveChange?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED)
    if (moveChange?.type !== PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED) {
      throw new Error('Expected MoveNote to produce a moved Note change')
    }

    const after = moveChange.after
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)

    const undoCommit = session.undo()

    expect(undoCommit?.origin).toEqual({
      kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
    expect(undoCommit?.delta.changes[0]).toMatchObject({ before: after, after: before })

    const redoCommit = session.redo()

    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)
    expect(redoCommit?.delta.changes[0]).toMatchObject({ before, after })
  })

  it('restores a removed Note by its original Record reference', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote

    requireCommitted(
      session.execute(
        createRemoveNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId: before.id,
        }),
      ),
    )

    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBeUndefined()
    expect(session.undo()?.delta.changes[0]).toMatchObject({
      type: PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED,
      after: before,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)

    expect(session.redo()?.delta.changes[0]).toMatchObject({
      type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED,
      before,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBeUndefined()
  })

  it('moves multiple entries between stacks in LIFO order', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const first = fixture.records.nonLoopNote
    const second = fixture.records.nonLoopHarmonyNote

    executeMove(
      session,
      fixture.records.nonLoopSource.id,
      first.id,
      parseTick(960),
      parseMidiPitch(61),
    )
    executeMove(
      session,
      fixture.records.nonLoopSource.id,
      second.id,
      parseTick(1_200),
      parseMidiPitch(65),
    )

    expect(session.undo()?.delta.changes[0]?.noteId).toBe(second.id)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, second.id)).toBe(second)
    expect(session.undo()?.delta.changes[0]?.noteId).toBe(first.id)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, first.id)).toBe(first)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    expect(session.redo()?.delta.changes[0]?.noteId).toBe(first.id)
    expect(session.redo()?.delta.changes[0]?.noteId).toBe(second.id)
    expect(session.canRedo).toBe(false)
    expect(session.modelRevision).toBe(6)
  })

  it('clears redo only after a new committed Command', () => {
    const { fixture, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote

    executeMove(
      session,
      fixture.records.nonLoopSource.id,
      before.id,
      parseTick(960),
      parseMidiPitch(67),
    )
    session.undo()
    expect(session.canRedo).toBe(true)

    const noteId = parseNoteId('note-history-branch')
    requireCommitted(
      session.execute(
        createAddNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId,
          startTick: parseTick(1_200),
          durationTick: parseTick(240),
          pitch: parseMidiPitch(72),
          velocity: parseMidiVelocity(100),
          channel: parseMidiChannel(0),
        }),
      ),
    )

    expect(session.canRedo).toBe(false)
    expect(session.redo()).toBeNull()
  })

  it('preserves redo across no-change and rejected Commands', () => {
    const { fixture, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote

    executeMove(
      session,
      fixture.records.nonLoopSource.id,
      before.id,
      parseTick(960),
      parseMidiPitch(67),
    )
    session.undo()

    const noChange = session.execute(
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: before.id,
        nextStartTick: before.startTick,
        nextPitch: before.pitch,
      }),
    )

    expect(noChange.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE)
    expect(session.canRedo).toBe(true)

    expect(() =>
      session.execute(
        createMoveNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId: before.id,
          nextStartTick: parseTick(1_680),
          nextPitch: before.pitch,
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'note-out-of-source-range' }),
    )
    expect(session.canRedo).toBe(true)
  })

  it('restores the previous History branch when authoritative apply fails', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote

    executeMove(
      session,
      fixture.records.nonLoopSource.id,
      before.id,
      parseTick(960),
      parseMidiPitch(67),
    )
    session.undo()
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    const noteId = parseNoteId('note-history-write-failure')
    const command = createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    const injectedFailure = new Error('injected History write failure')
    expect(() =>
      withAuthoritativeMapSetInterceptor(
        (key, value) => {
          if (
            key === noteId &&
            typeof value === 'object' &&
            value !== null &&
            'id' in value &&
            value.id === noteId
          ) {
            throw injectedFailure
          }
        },
        () => session.execute(command),
      ),
    ).toThrowError(expect.objectContaining<Partial<MutationApplyError>>({ code: 'write-failed' }))

    expect(session.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, noteId)).toBeUndefined()
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)
    expect(session.redo()?.origin).toMatchObject({
      kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
      direction: PROJECT_HISTORY_DIRECTION.REDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    })
  })

  it('restores Undo and Redo stack heads when a History replay write fails', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote
    const moveCommit = executeMove(
      session,
      fixture.records.nonLoopSource.id,
      before.id,
      parseTick(960),
      parseMidiPitch(67),
    )
    const moveChange = moveCommit.delta.changes[0]

    if (moveChange?.type !== PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED) {
      throw new Error('Expected MoveNote to produce an updated Note change')
    }

    const after = moveChange.after
    const failAuthoritativeWrite = (expectedValue: unknown, operation: () => unknown): void => {
      expect(() =>
        withAuthoritativeMapSetInterceptor((key, value) => {
          if (key === before.id && value === expectedValue) {
            throw new Error('injected History replay write failure')
          }
        }, operation),
      ).toThrowError(expect.objectContaining<Partial<MutationApplyError>>({ code: 'write-failed' }))
    }

    failAuthoritativeWrite(before, () => session.undo())
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)
    expect(session.modelRevision).toBe(1)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    session.undo()
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
    expect(session.modelRevision).toBe(2)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    failAuthoritativeWrite(after, () => session.redo())
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
    expect(session.modelRevision).toBe(2)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    session.redo()
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)
    expect(session.modelRevision).toBe(3)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
  })
})
