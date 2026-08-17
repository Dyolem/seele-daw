import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddMidiClipWithNoteCommand,
  createExtendMidiClipWithNoteCommand,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  createProjectFileDTO,
  parseClipId,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTrackId,
  type AddMidiClipWithNoteCommand,
  type CreateAddMidiClipWithNoteCommandInput,
  type CreateExtendMidiClipWithNoteCommandInput,
  type ExtendMidiClipWithNoteCommand,
  type ProjectCommit,
  type ProjectCommandExecutionResult,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPreparation } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createNewClipInput(
  store: ModelStore,
  overrides: Partial<CreateAddMidiClipWithNoteCommandInput> = {},
): CreateAddMidiClipWithNoteCommandInput {
  return {
    baseRevision: store.modelRevision,
    clipId: parseClipId('clip-command-with-note'),
    trackId: parseTrackId('track-instrument'),
    name: 'Created from Piano Roll',
    color: null,
    muted: false,
    startTick: parseTick(7_680),
    spanTick: parseTick(3_840),
    sourceId: parseMidiSourceId('source-command-with-note'),
    sourceLengthTick: parseTick(3_840),
    sourceOffsetTick: parseTick(0),
    loop: null,
    noteId: parseNoteId('note-command-with-new-clip'),
    noteStartTick: parseTick(960),
    noteDurationTick: parseTick(480),
    notePitch: parseMidiPitch(72),
    noteVelocity: parseMidiVelocity(105),
    noteChannel: parseMidiChannel(0),
    ...overrides,
  }
}

function createNewClipCommand(
  store: ModelStore,
  overrides: Partial<CreateAddMidiClipWithNoteCommandInput> = {},
): AddMidiClipWithNoteCommand {
  return createAddMidiClipWithNoteCommand(createNewClipInput(store, overrides))
}

function createExtensionInput(
  store: ModelStore,
  overrides: Partial<CreateExtendMidiClipWithNoteCommandInput> = {},
): CreateExtendMidiClipWithNoteCommandInput {
  const fixture = createCompleteProjectFixture()

  return {
    baseRevision: store.modelRevision,
    clipId: fixture.records.nonLoopClip.id,
    spanTick: parseTick(1_920),
    noteId: parseNoteId('note-command-with-extension'),
    noteStartTick: parseTick(1_080),
    noteDurationTick: parseTick(600),
    notePitch: parseMidiPitch(74),
    noteVelocity: parseMidiVelocity(101),
    noteChannel: parseMidiChannel(0),
    ...overrides,
  }
}

function createExtensionCommand(
  store: ModelStore,
  overrides: Partial<CreateExtendMidiClipWithNoteCommandInput> = {},
): ExtendMidiClipWithNoteCommand {
  return createExtendMidiClipWithNoteCommand(createExtensionInput(store, overrides))
}

function captureCommandError(operation: () => unknown): ProjectCommandError {
  let caught: unknown

  try {
    operation()
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(ProjectCommandError)
  if (!(caught instanceof ProjectCommandError)) throw new Error('Expected ProjectCommandError')
  return caught
}

function requireCommitted(result: ProjectCommandExecutionResult) {
  expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected a committed Project Command')
  }
  return result.commit
}

function requireAddedClipChange(commit: ProjectCommit) {
  const change = commit.delta.changes[0]
  expect(change?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED)
  if (change?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED) {
    throw new Error('Expected a MIDI Clip added change')
  }
  return change
}

describe('MIDI Clip with Note Command public contracts', () => {
  it('normalizes explicit new-Clip and right-extension product intents', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const added = createNewClipCommand(store, { trackId: fixture.records.instrumentTrack.id })
    const extended = createExtensionCommand(store)

    expect(PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE).toBe('midi-clip.add-with-note')
    expect(PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE).toBe('midi-clip.extend-with-note')
    expect(added).toMatchObject({
      type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
      clip: {
        id: parseClipId('clip-command-with-note'),
        loop: null,
        sourceId: parseMidiSourceId('source-command-with-note'),
      },
      source: { lengthTick: 3_840 },
      note: {
        id: parseNoteId('note-command-with-new-clip'),
        startTick: 960,
        durationTick: 480,
        pitch: 72,
        velocity: 105,
        channel: 0,
      },
    })
    expect(extended).toMatchObject({
      type: PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE,
      clipId: fixture.records.nonLoopClip.id,
      spanTick: 1_920,
      note: {
        id: parseNoteId('note-command-with-extension'),
        startTick: 1_080,
        durationTick: 600,
      },
    })
    expectTypeOf(added).toEqualTypeOf<AddMidiClipWithNoteCommand>()
    expectTypeOf(extended).toEqualTypeOf<ExtendMidiClipWithNoteCommand>()
  })
})

describe('AddMidiClipWithNoteCommand preparation', () => {
  it('inserts Source, populated Note Partition, and Clip in one reversible plan', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createNewClipCommand(store, { trackId: fixture.records.instrumentTrack.id })
    const preparation = requireReadyProjectCommandPreparation(prepareProjectCommand(store, command))

    if (preparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE) {
      throw new Error('Expected a normalized add-with-note Command')
    }

    expect(preparation.plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: preparation.command.source,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: preparation.command.source.id,
        after: [preparation.command.note],
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
        after: preparation.command.clip,
      },
    ])
    expect(preparation.plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.CLIP.REMOVE,
        before: preparation.command.clip,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
        sourceId: preparation.command.source.id,
        before: [preparation.command.note],
      },
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE,
        before: preparation.command.source,
      },
    ])
    expect(() => createProjectCommitCandidate(command, preparation.plan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )
    expect(() => createProjectCommitCandidate(preparation.command, preparation.plan)).not.toThrow()
  })

  it('rejects Notes outside the new Clip window and globally occupied Note identities', () => {
    const outsideFixture = createCompleteProjectFixture()
    const outsideStore = new ModelStore(outsideFixture.seed)
    const outside = captureCommandError(() =>
      prepareProjectCommand(
        outsideStore,
        createNewClipCommand(outsideStore, {
          trackId: outsideFixture.records.instrumentTrack.id,
          spanTick: parseTick(960),
          noteStartTick: parseTick(960),
        }),
      ),
    )

    const duplicateFixture = createCompleteProjectFixture()
    const duplicateStore = new ModelStore(duplicateFixture.seed)
    const duplicate = captureCommandError(() =>
      prepareProjectCommand(
        duplicateStore,
        createNewClipCommand(duplicateStore, {
          trackId: duplicateFixture.records.instrumentTrack.id,
          noteId: duplicateFixture.records.nonLoopNote.id,
        }),
      ),
    )

    expect(outside).toMatchObject({
      code: 'note-out-of-clip-range',
      sourceReadStartTick: 0,
      sourceReadEndTick: 960,
      noteStartTick: 960,
      noteEndTick: 1_440,
    })
    expect(duplicate).toMatchObject({
      code: 'note-id-already-exists',
      noteId: duplicateFixture.records.nonLoopNote.id,
    })
  })
})

describe('ExtendMidiClipWithNoteCommand preparation', () => {
  it('grows Source when needed, extends Clip, then inserts the triggering Note', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const preparation = requireReadyProjectCommandPreparation(
      prepareProjectCommand(store, createExtensionCommand(store)),
    )

    if (preparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE) {
      throw new Error('Expected a normalized extend-with-note Command')
    }

    expect(preparation.plan.forward).toHaveLength(3)
    expect(preparation.plan.forward).toMatchObject([
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE,
        before: fixture.records.nonLoopSource,
        after: { id: fixture.records.nonLoopSource.id, lengthTick: 2_160 },
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.REPLACE,
        before: fixture.records.nonLoopClip,
        after: { id: fixture.records.nonLoopClip.id, spanTick: 1_920 },
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
        sourceId: fixture.records.nonLoopSource.id,
        after: preparation.command.note,
      },
    ])
    expect(preparation.plan.inverse.map(({ type }) => type)).toEqual([
      PROJECT_MUTATION_TYPE.NOTE.REMOVE,
      PROJECT_MUTATION_TYPE.CLIP.REPLACE,
      PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE,
    ])
  })

  it('keeps an already long enough Source unchanged', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const preparation = requireReadyProjectCommandPreparation(
      prepareProjectCommand(
        store,
        createExtensionCommand(store, {
          spanTick: parseTick(1_440),
          noteStartTick: parseTick(1_080),
          noteDurationTick: parseTick(480),
        }),
      ),
    )

    expect(preparation.plan.forward.map(({ type }) => type)).toEqual([
      PROJECT_MUTATION_TYPE.CLIP.REPLACE,
      PROJECT_MUTATION_TYPE.NOTE.INSERT,
    ])
  })

  it('rejects missing, looped, non-rightward, and unnecessary extension targets', () => {
    const missingFixture = createCompleteProjectFixture()
    const missingStore = new ModelStore(missingFixture.seed)
    const missing = captureCommandError(() =>
      prepareProjectCommand(
        missingStore,
        createExtensionCommand(missingStore, { clipId: parseClipId('clip-missing') }),
      ),
    )

    const loopFixture = createCompleteProjectFixture()
    const loopStore = new ModelStore(loopFixture.seed)
    const looped = captureCommandError(() =>
      prepareProjectCommand(
        loopStore,
        createExtensionCommand(loopStore, { clipId: loopFixture.records.loopingClip.id }),
      ),
    )

    const directionFixture = createCompleteProjectFixture()
    const directionStore = new ModelStore(directionFixture.seed)
    const notRightward = captureCommandError(() =>
      prepareProjectCommand(
        directionStore,
        createExtensionCommand(directionStore, { spanTick: parseTick(960) }),
      ),
    )

    const unnecessaryFixture = createCompleteProjectFixture()
    const unnecessaryStore = new ModelStore(unnecessaryFixture.seed)
    const unnecessary = captureCommandError(() =>
      prepareProjectCommand(
        unnecessaryStore,
        createExtensionCommand(unnecessaryStore, {
          spanTick: parseTick(1_440),
          noteStartTick: parseTick(960),
          noteDurationTick: parseTick(240),
        }),
      ),
    )

    expect(missing.code).toBe('clip-not-found')
    expect(looped).toMatchObject({
      code: 'looped-midi-clip-unsupported',
      clipId: loopFixture.records.loopingClip.id,
    })
    expect(notRightward).toMatchObject({
      code: 'midi-clip-extension-not-rightward',
      targetSpanTick: 960,
    })
    expect(unnecessary).toMatchObject({
      code: 'midi-clip-extension-not-required',
      noteEndTick: 1_200,
    })
  })

  it('rejects crossing the next Clip, exceeding the target window, and duplicate Note IDs', () => {
    const collisionFixture = createCompleteProjectFixture()
    const collisionStore = new ModelStore(collisionFixture.seed)
    const collision = captureCommandError(() =>
      prepareProjectCommand(
        collisionStore,
        createExtensionCommand(collisionStore, {
          spanTick: parseTick(1_921),
          noteStartTick: parseTick(1_681),
          noteDurationTick: parseTick(480),
        }),
      ),
    )

    const outsideFixture = createCompleteProjectFixture()
    const outsideStore = new ModelStore(outsideFixture.seed)
    const outside = captureCommandError(() =>
      prepareProjectCommand(
        outsideStore,
        createExtensionCommand(outsideStore, {
          spanTick: parseTick(1_440),
          noteStartTick: parseTick(1_320),
          noteDurationTick: parseTick(480),
        }),
      ),
    )

    const duplicateFixture = createCompleteProjectFixture()
    const duplicateStore = new ModelStore(duplicateFixture.seed)
    const duplicate = captureCommandError(() =>
      prepareProjectCommand(
        duplicateStore,
        createExtensionCommand(duplicateStore, {
          noteId: duplicateFixture.records.loopingNote.id,
        }),
      ),
    )

    expect(collision).toMatchObject({
      code: 'midi-clip-extension-crosses-next-clip',
      blockingClipId: collisionFixture.records.loopingClip.id,
      clipEndTick: 1_921,
    })
    expect(outside).toMatchObject({
      code: 'note-out-of-clip-range',
      sourceReadEndTick: 1_680,
      noteEndTick: 1_800,
    })
    expect(duplicate).toMatchObject({
      code: 'note-id-already-exists',
      noteId: duplicateFixture.records.loopingNote.id,
    })
  })
})

describe('MIDI Clip with Note commit, consumers, and History', () => {
  it('commits, queries, publishes, persists, removes, and restores a populated new Clip', async () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const command = createNewClipCommand(store, { trackId: fixture.records.instrumentTrack.id })
    const noteCommits: ProjectCommit[] = []

    session.subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [command.source.id],
        noteIds: [command.note.id],
        affected: { startTick: parseTick(960), endTick: parseTick(1_440) },
      }),
      {
        onCommit: (commit) => noteCommits.push(commit),
        onError: () => undefined,
      },
    )

    const commit = requireCommitted(session.execute(command))
    const added = requireAddedClipChange(commit)
    await Promise.resolve()

    expect(commit.origin).toMatchObject({
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    })
    expect(added.after.notes).toHaveLength(1)
    expect(added.after.notes[0]).toMatchObject({ id: command.note.id })
    expect(noteCommits).toEqual([commit])
    expect(
      session.query(
        createMidiNoteByIdQuery({ sourceId: command.source.id, noteId: command.note.id }),
      ).note,
    ).toBe(added.after.notes[0])

    const dto = createProjectFileDTO(session.getSnapshot())
    expect(dto.clips[command.clip.id]).toMatchObject({ spanTick: command.clip.spanTick })
    expect(dto.midiSources[command.source.id]?.notes[command.note.id]).toMatchObject({
      startTick: command.note.startTick,
      durationTick: command.note.durationTick,
    })

    const undoCommit = session.undo()
    const removed = undoCommit?.delta.changes[0]
    expect(undoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    })
    expect(removed?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED)
    if (removed?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED) {
      throw new Error('Expected populated Clip removal')
    }
    expect(removed.before.notes).toEqual(added.after.notes)
    expect(session.getSnapshot().clips.some(({ id }) => id === command.clip.id)).toBe(false)
    expect(
      session.query(
        createMidiNoteByIdQuery({ sourceId: command.source.id, noteId: command.note.id }),
      ).note,
    ).toBeUndefined()

    const redoCommit = session.redo()
    const restored = redoCommit?.delta.changes[0]
    expect(restored?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED)
    if (restored?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED) {
      throw new Error('Expected populated Clip restoration')
    }
    expect(restored.after.notes).toEqual(added.after.notes)
  })

  it('commits one extension step and atomically restores Clip, Source, Note, Query, and file facts', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const beforeRevision = session.modelRevision
    const command = createExtensionCommand(store)
    const commit = requireCommitted(session.execute(command))

    expect(session.modelRevision).toBe(beforeRevision + 1)
    expect(commit.delta.changes.map(({ type }) => type)).toEqual([
      PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED,
      PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED,
    ])
    const updated = commit.delta.changes[0]
    const added = commit.delta.changes[1]
    if (
      updated?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED ||
      added?.type !== PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED
    ) {
      throw new Error('Expected Clip update followed by Note addition')
    }
    expect(updated).toMatchObject({
      clipId: fixture.records.nonLoopClip.id,
      sourceId: fixture.records.nonLoopSource.id,
      affected: { startTick: 0, endTick: 1_920 },
      before: fixture.records.nonLoopClip,
      after: { spanTick: 1_920 },
      sourceUpdate: {
        before: fixture.records.nonLoopSource,
        after: { lengthTick: 2_160 },
      },
    })
    expect(added.after).toEqual(command.note)
    expect(
      session.query(
        createMidiNoteByIdQuery({
          sourceId: fixture.records.nonLoopSource.id,
          noteId: command.note.id,
        }),
      ).note,
    ).toBe(added.after)

    const dto = createProjectFileDTO(session.getSnapshot())
    expect(dto.clips[fixture.records.nonLoopClip.id]?.spanTick).toBe(1_920)
    expect(dto.midiSources[fixture.records.nonLoopSource.id]?.lengthTick).toBe(2_160)
    expect(dto.midiSources[fixture.records.nonLoopSource.id]?.notes[command.note.id]?.id).toBe(
      command.note.id,
    )

    const undoCommit = session.undo()
    expect(undoCommit?.delta.changes.map(({ type }) => type)).toEqual([
      PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED,
      PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED,
    ])
    expect(session.getSnapshot().clips.find(({ id }) => id === updated.clipId)).toBe(updated.before)
    if (updated.sourceUpdate === null) throw new Error('Expected a Source extension')
    expect(session.getSnapshot().midiSources.find(({ id }) => id === updated.sourceId)).toBe(
      updated.sourceUpdate.before,
    )
    expect(
      session.query(
        createMidiNoteByIdQuery({
          sourceId: fixture.records.nonLoopSource.id,
          noteId: command.note.id,
        }),
      ).note,
    ).toBeUndefined()

    const redoCommit = session.redo()
    expect(redoCommit?.delta.changes.map(({ type }) => type)).toEqual([
      PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED,
      PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED,
    ])
  })

  it('emits a Clip update without a redundant Source replacement when capacity already exists', () => {
    const { store, session } = createFixtureProjectSession()
    const commit = requireCommitted(
      session.execute(
        createExtensionCommand(store, {
          spanTick: parseTick(1_440),
          noteStartTick: parseTick(1_080),
          noteDurationTick: parseTick(480),
        }),
      ),
    )
    const updated = commit.delta.changes[0]

    expect(updated?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED)
    if (updated?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED) {
      throw new Error('Expected a MIDI Clip update')
    }
    expect(updated.sourceUpdate).toBeNull()
  })
})
