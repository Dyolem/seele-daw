import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectCommandError,
  createAddNoteCommand,
  createInitialProjectSession,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
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
        sourceId: fixture.records.verseSource.id,
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
        changes: [{ op: 'insert', table: 'midiNotes', after: { id: noteId } }],
      },
    })
    expect(session.modelRevision).toBe(1)
    expect(store.getMidiNote(fixture.records.verseSource.id, noteId)).toBeDefined()

    const moveResult = session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteIds: [noteId],
        deltaTick: parseTickDelta(240),
        deltaPitch: parseMidiPitchDelta(2),
      }),
    )

    expect(moveResult).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 1,
        modelRevision: 2,
        changes: [{ op: 'replace', table: 'midiNotes', after: { id: noteId } }],
      },
    })
    expect(store.getMidiNote(fixture.records.verseSource.id, noteId)).toMatchObject({
      startTick: 1_200,
      pitch: 74,
    })

    const removeResult = session.execute(
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteIds: [noteId],
      }),
    )

    expect(removeResult).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 2,
        modelRevision: 3,
        changes: [{ op: 'remove', table: 'midiNotes', before: { id: noteId } }],
      },
    })
    expect(session.modelRevision).toBe(3)
    expect(store.getMidiNote(fixture.records.verseSource.id, noteId)).toBeUndefined()
  })

  it('executes one Resize as one committed Note update', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.verseNote
    const result = session.execute(
      createResizeNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteId: before.id,
        startTick: parseTick(120),
        durationTick: parseTick(600),
      }),
    )

    expect(result).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 0,
        modelRevision: 1,
        origin: {
          kind: 'command',
          commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
        },
        changes: [
          {
            op: 'replace',
            table: 'midiNotes',
            before,
            after: { id: before.id, startTick: 120, durationTick: 600 },
          },
        ],
      },
    })
    expect(session.modelRevision).toBe(1)
    expect(store.getMidiNote(fixture.records.verseSource.id, before.id)).toEqual({
      ...before,
      startTick: parseTick(120),
      durationTick: parseTick(600),
    })
  })

  it('moves multiple Notes in one Commit and one reversible History step', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const first = fixture.records.verseNote
    const second = fixture.records.verseHarmonyNote
    const result = session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteIds: [first.id, second.id],
        deltaTick: parseTickDelta(240),
        deltaPitch: parseMidiPitchDelta(2),
      }),
    )

    expect(result).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 0,
        modelRevision: 1,
        changes: [
          { op: 'replace', table: 'midiNotes', after: { id: first.id } },
          { op: 'replace', table: 'midiNotes', after: { id: second.id } },
        ],
      },
    })
    expect(store.getMidiNote(fixture.records.verseSource.id, first.id)).toMatchObject({
      startTick: 480,
      pitch: 62,
    })
    expect(store.getMidiNote(fixture.records.verseSource.id, second.id)).toMatchObject({
      startTick: 960,
      pitch: 66,
    })

    session.undo()

    expect(store.getMidiNote(fixture.records.verseSource.id, first.id)).toBe(first)
    expect(store.getMidiNote(fixture.records.verseSource.id, second.id)).toBe(second)
  })

  it('returns a fully frozen committed result after successful application', () => {
    const { fixture, session } = createFixtureProjectSession()
    const result = session.execute(
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteIds: [fixture.records.verseNote.id],
      }),
    )

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected a committed ProjectCommand result')
    }

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.commit)).toBe(true)
    expect(Object.isFrozen(result.commit.changes)).toBe(true)
  })

  it('removes multiple Notes in one Commit and one reversible History step', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const sourceId = fixture.records.verseSource.id
    const noteIds = [fixture.records.verseNote.id, fixture.records.verseHarmonyNote.id]
    const result = session.execute(
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds,
      }),
    )

    expect(result).toMatchObject({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit: {
        baseRevision: 0,
        modelRevision: 1,
        origin: {
          commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
          kind: 'command',
        },
        changes: [
          { op: 'remove', table: 'midiNotes', before: { id: noteIds[0] } },
          { op: 'remove', table: 'midiNotes', before: { id: noteIds[1] } },
        ],
      },
    })
    expect(session.modelRevision).toBe(1)
    expect(noteIds.every((noteId) => store.getMidiNote(sourceId, noteId) === undefined)).toBe(true)

    session.undo()
    expect(session.modelRevision).toBe(2)
    expect(noteIds.every((noteId) => store.getMidiNote(sourceId, noteId) !== undefined)).toBe(true)

    session.redo()
    expect(session.modelRevision).toBe(3)
    expect(noteIds.every((noteId) => store.getMidiNote(sourceId, noteId) === undefined)).toBe(true)
  })

  it('rejects a missing multi-Note target before removing any Note', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const sourceId = fixture.records.verseSource.id
    const existingNoteId = fixture.records.verseNote.id
    const missingNoteId = parseNoteId('note-session-remove-many-missing')

    expect(() =>
      session.execute(
        createRemoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId,
          noteIds: [existingNoteId, missingNoteId],
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'midi-note-not-found',
      }),
    )
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(sourceId, existingNoteId)).toBe(fixture.records.verseNote)
  })

  it('returns a frozen no-change result without writing or advancing revision', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.verseNote
    const result = session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteIds: [before.id],
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(0),
      }),
    )

    expect(result).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      modelRevision: 0,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(fixture.records.verseSource.id, before.id)).toBe(before)
  })

  it('propagates stale Command errors without changing model state', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.verseNote
    const command = createRemoveNotesCommand({
      baseRevision: 1 as ModelRevision,
      sourceId: fixture.records.verseSource.id,
      noteIds: [before.id],
    })

    expect(() => session.execute(command)).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'base-revision-mismatch' }),
    )
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(fixture.records.verseSource.id, before.id)).toBe(before)
  })

  it('propagates range rejection before any authoritative write', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const before = fixture.records.verseNote
    const command = createMoveNotesCommand({
      baseRevision: session.modelRevision,
      sourceId: fixture.records.verseSource.id,
      noteIds: [before.id],
      deltaTick: parseTickDelta(1_440),
      deltaPitch: parseMidiPitchDelta(0),
    })

    expect(() => session.execute(command)).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'note-out-of-source-range' }),
    )
    expect(session.modelRevision).toBe(0)
    expect(store.getMidiNote(fixture.records.verseSource.id, before.id)).toBe(before)
  })

  it('cannot create a second Session writer for the same ModelStore', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const session = createProjectSession(store)

    expect(session.modelRevision).toBe(0)
    expect(() => createProjectSession(store)).toThrowError(
      'ModelStore write access is unavailable or has already been claimed',
    )
  })
})
