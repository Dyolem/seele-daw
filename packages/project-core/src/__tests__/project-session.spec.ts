import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectCommandError,
  createAddNoteCommand,
  createInitialProjectSession,
  createMoveNoteCommand,
  createRemoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  type CommittedProjectCommandExecution,
  type ModelRevision,
  type NoChangeProjectCommandExecution,
  type ProjectCommandExecutionResult,
  type ProjectContentStateId,
  type ProjectSession,
} from '#internal/index'
import { ModelStore } from '#internal/model/model-store'
import { createProjectSession } from '#internal/session/project-session'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { createFixtureProjectSession } from './support/project-session-test-support'

describe('ProjectSession public contract', () => {
  it('exports the minimal Session API without exposing composition or write internals', () => {
    const session = createInitialProjectSession({
      projectId: parseProjectId('project-session-public'),
      projectName: 'Public Session',
      tempoEventId: parseTempoEventId('tempo-session-public'),
      timeSignatureEventId: parseTimeSignatureEventId('time-signature-session-public'),
    })

    expect(session.modelRevision).toBe(0)
    expect(PROJECT_COMMAND_EXECUTION_STATUS).toEqual({
      COMMITTED: 'committed',
      NO_CHANGE: 'no-change',
    })
    expectTypeOf(session).toEqualTypeOf<ProjectSession>()
    expectTypeOf(session.contentStateId).toEqualTypeOf<ProjectContentStateId>()
    expectTypeOf<ProjectCommandExecutionResult>().toEqualTypeOf<
      CommittedProjectCommandExecution | NoChangeProjectCommandExecution
    >()

    expect('createProjectSession' in projectCore).toBe(false)
    expect('createInitialModelStore' in projectCore).toBe(false)
    expect('prepareProjectCommand' in projectCore).toBe(false)
    expect('createProjectCommitCandidate' in projectCore).toBe(false)
    expect('MutationApplier' in projectCore).toBe(false)
    expect('ModelStore' in projectCore).toBe(false)
  })
})

describe('ProjectSession command execution', () => {
  it('executes Add, Move, and Remove as three atomic committed results', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const noteId = parseNoteId('note-session-sequence')
    const addResult = session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId,
        startTick: parseTick(960),
        durationTick: parseTick(240),
        pitch: parseMidiPitch(72),
        velocity: parseMidiVelocity(104),
        channel: parseMidiChannel(2),
      }),
    )

    expect(addResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(addResult).toMatchObject({
      commit: {
        baseRevision: 0,
        modelRevision: 1,
        delta: {
          modelRevision: 1,
          changes: [{ type: PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED, noteId }],
        },
      },
    })
    expect(session.modelRevision).toBe(1)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, noteId)).toBeDefined()

    const moveResult = session.execute(
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId,
        nextStartTick: parseTick(1_200),
        nextPitch: parseMidiPitch(74),
      }),
    )

    expect(moveResult).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 1,
        modelRevision: 2,
        delta: { changes: [{ type: PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED, noteId }] },
      },
    })
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, noteId)).toMatchObject({
      startTick: 1_200,
      pitch: 74,
    })

    const removeResult = session.execute(
      createRemoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId,
      }),
    )

    expect(removeResult).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 2,
        modelRevision: 3,
        delta: { changes: [{ type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED, noteId }] },
      },
    })
    expect(session.modelRevision).toBe(3)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, noteId)).toBeUndefined()
  })

  it('returns a fully frozen committed result after successful application', () => {
    const { fixture, session } = createFixtureProjectSession()
    const result = session.execute(
      createRemoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: fixture.records.nonLoopNote.id,
      }),
    )

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected a committed ProjectCommand result')
    }

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.commit)).toBe(true)
    expect(Object.isFrozen(result.commit.delta)).toBe(true)
    expect(Object.isFrozen(result.commit.delta.changes)).toBe(true)
  })

  it('returns a frozen no-change result without writing or advancing revision', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote
    const result = session.execute(
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: before.id,
        nextStartTick: before.startTick,
        nextPitch: before.pitch,
      }),
    )

    expect(result).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      modelRevision: 0,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
  })

  it('propagates stale Command errors without changing model state', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote
    const command = createRemoveNoteCommand({
      baseRevision: 1 as ModelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: before.id,
    })

    expect(() => session.execute(command)).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'base-revision-mismatch' }),
    )
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
  })

  it('propagates range rejection before any authoritative write', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.nonLoopNote
    const command = createMoveNoteCommand({
      baseRevision: session.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: before.id,
      nextStartTick: parseTick(1_680),
      nextPitch: before.pitch,
    })

    expect(() => session.execute(command)).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'note-out-of-source-range' }),
    )
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(fixture.records.nonLoopSource.id, before.id)).toBe(before)
  })

  it('cannot create a second Session writer for the same ModelStore', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const session = createProjectSession(store)

    expect(session.modelRevision).toBe(0)
    expect(() => createProjectSession(store)).toThrowError(
      expect.objectContaining({ code: 'write-access-unavailable' }),
    )
  })
})
