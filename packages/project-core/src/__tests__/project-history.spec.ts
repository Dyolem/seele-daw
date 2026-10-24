import { describe, expect, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_COMMIT_ORIGIN_KIND,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTickDelta,
  type ProjectCommandExecutionResult,
  type ProjectCommit,
  type ProjectSession,
} from '#internal/index'
import { MutationApplyError } from '#internal/mutation/mutation-apply-error'
import { withAuthoritativeMapSetInterceptor } from './support/map-set-interceptor'
import { requireChange } from './support/project-change-test-support'
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
  sourceId: Parameters<typeof createMoveNotesCommand>[0]['sourceId'],
  noteId: Parameters<typeof createMoveNotesCommand>[0]['noteIds'][number],
  nextStartTick: ReturnType<typeof parseTick>,
  nextPitch: ReturnType<typeof parseMidiPitch>,
): ProjectCommit {
  const before = session.query(createMidiNoteByIdQuery({ sourceId, noteId })).note
  if (before === undefined) throw new Error(`Expected MIDI Note ${noteId}`)

  return requireCommitted(
    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
        deltaTick: parseTickDelta(nextStartTick - before.startTick),
        deltaPitch: parseMidiPitchDelta(nextPitch - before.pitch),
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
    expect(typeof session.contentStateId).toBe('symbol')
    expect('HistoryController' in projectCore).toBe(false)
    expect('createProjectContentStateId' in projectCore).toBe(false)
    expect('createHistoryProjectCommitCandidate' in projectCore).toBe(false)
  })
})

describe('ProjectSession Undo / Redo', () => {
  it('restores stable content-state identities and assigns a new identity to a branch', () => {
    const { fixture, session } = createFixtureProjectSession()
    const initialContentStateId = session.contentStateId

    executeMove(
      session,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      parseTick(960),
      parseMidiPitch(67),
    )
    const movedContentStateId = session.contentStateId
    expect(movedContentStateId).not.toBe(initialContentStateId)

    session.undo()
    expect(session.contentStateId).toBe(initialContentStateId)

    session.redo()
    expect(session.contentStateId).toBe(movedContentStateId)

    session.undo()
    requireCommitted(
      session.execute(
        createAddNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId: parseNoteId('note-history-content-state-branch'),
          startTick: parseTick(1_200),
          durationTick: parseTick(240),
          pitch: parseMidiPitch(72),
          velocity: parseMidiVelocity(100),
          channel: parseMidiChannel(0),
        }),
      ),
    )

    expect(session.contentStateId).not.toBe(initialContentStateId)
    expect(session.contentStateId).not.toBe(movedContentStateId)
    expect(session.canRedo).toBe(false)
  })

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
      changes: [{ op: 'remove', table: 'midiNotes', before: addedRecord }],
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
      changes: [{ op: 'insert', table: 'midiNotes', after: addedRecord }],
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
    const moveChange = requireChange(moveCommit, 'midiNotes', 'replace')

    const after = moveChange.after
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)

    const undoCommit = session.undo()

    expect(undoCommit?.origin).toEqual({
      kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
    expect(undoCommit?.changes[0]).toMatchObject({ before: after, after: before })

    const redoCommit = session.redo()

    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)
    expect(redoCommit?.changes[0]).toMatchObject({ before, after })
  })

  it('restores exact before and after Record references across ResizeNote Undo / Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote
    const resizeCommit = requireCommitted(
      session.execute(
        createResizeNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId: before.id,
          startTick: parseTick(120),
          durationTick: parseTick(600),
        }),
      ),
    )
    const resizeChange = requireChange(resizeCommit, 'midiNotes', 'replace')

    const after = resizeChange.after
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)

    expect(session.undo()?.origin).toEqual({
      kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)

    expect(session.redo()?.origin).toEqual({
      kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
      direction: PROJECT_HISTORY_DIRECTION.REDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)
  })

  it('restores a removed Note by its original Record reference', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote

    requireCommitted(
      session.execute(
        createRemoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteIds: [before.id],
        }),
      ),
    )

    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBeUndefined()
    expect(session.undo()?.changes[0]).toMatchObject({
      op: 'insert',
      table: 'midiNotes',
      after: before,
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)

    expect(session.redo()?.changes[0]).toMatchObject({
      op: 'remove',
      table: 'midiNotes',
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

    const secondUndoChange = requireChange(session.undo(), 'midiNotes', 'replace')
    expect(secondUndoChange.after.id).toBe(second.id)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, second.id)).toBe(second)
    const firstUndoChange = requireChange(session.undo(), 'midiNotes', 'replace')
    expect(firstUndoChange.after.id).toBe(first.id)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, first.id)).toBe(first)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    const firstRedoChange = requireChange(session.redo(), 'midiNotes', 'replace')
    expect(firstRedoChange.after.id).toBe(first.id)
    const secondRedoChange = requireChange(session.redo(), 'midiNotes', 'replace')
    expect(secondRedoChange.after.id).toBe(second.id)
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
    const contentStateId = session.contentStateId

    const noChange = session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteIds: [before.id],
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(0),
      }),
    )

    expect(noChange.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE)
    expect(session.canRedo).toBe(true)
    expect(session.contentStateId).toBe(contentStateId)

    expect(() =>
      session.execute(
        createMoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteIds: [before.id],
          deltaTick: parseTickDelta(1_440),
          deltaPitch: parseMidiPitchDelta(0),
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'note-out-of-source-range' }),
    )
    expect(session.canRedo).toBe(true)
    expect(session.contentStateId).toBe(contentStateId)
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
    const contentStateIdBeforeFailure = session.contentStateId
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
    expect(session.contentStateId).toBe(contentStateIdBeforeFailure)
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
    const moveChange = requireChange(moveCommit, 'midiNotes', 'replace')

    const after = moveChange.after
    const afterContentStateId = session.contentStateId
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
    expect(session.contentStateId).toBe(afterContentStateId)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    session.undo()
    const beforeContentStateId = session.contentStateId
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
    expect(session.modelRevision).toBe(2)
    expect(session.contentStateId).toBe(beforeContentStateId)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    failAuthoritativeWrite(after, () => session.redo())
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
    expect(session.modelRevision).toBe(2)
    expect(session.contentStateId).toBe(beforeContentStateId)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    session.redo()
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(after)
    expect(session.modelRevision).toBe(3)
    expect(session.contentStateId).toBe(afterContentStateId)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
  })
})
