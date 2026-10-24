import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddMidiClipWithNoteCommand,
  createExtendMidiClipWithNoteCommand,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  createProjectFile,
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
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { ModelStore } from '#internal/model/model-store'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { describeChanges, requireChange } from './support/project-change-test-support'
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
  it('inserts Source, Note and Sustain Pedal Event partitions, and Clip in one reversible plan', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createNewClipCommand(store, { trackId: fixture.records.instrumentTrack.id })
    const preparation = requireReadyProjectCommandPreparation(prepareProjectCommand(store, command))

    if (preparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE) {
      throw new Error('Expected a normalized add-with-note Command')
    }

    expect(preparation.plan.forward).toEqual([
      {
        op: 'insert',
        table: 'midiSources',
        after: preparation.command.source,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: preparation.command.source.id,
        records: [preparation.command.note],
      },
      {
        op: 'insert-partition',
        table: 'midiSustainPedalEvents',
        sourceId: preparation.command.source.id,
        records: [],
      },
      {
        op: 'insert',
        table: 'clips',
        after: preparation.command.clip,
      },
    ])
    expect(preparation.plan.inverse).toEqual([
      {
        op: 'remove',
        table: 'clips',
        before: preparation.command.clip,
      },
      {
        op: 'remove-partition',
        table: 'midiSustainPedalEvents',
        sourceId: preparation.command.source.id,
        records: [],
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: preparation.command.source.id,
        records: [preparation.command.note],
      },
      {
        op: 'remove',
        table: 'midiSources',
        before: preparation.command.source,
      },
    ])
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
        op: 'replace',
        table: 'midiSources',
        before: fixture.records.nonLoopSource,
        after: { id: fixture.records.nonLoopSource.id, lengthTick: 2_160 },
      },
      {
        op: 'replace',
        table: 'clips',
        before: fixture.records.nonLoopClip,
        after: { id: fixture.records.nonLoopClip.id, spanTick: 1_920 },
      },
      {
        op: 'insert',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        after: preparation.command.note,
      },
    ])
    expect(describeChanges(preparation.plan.inverse)).toEqual([
      `midiNotes.remove ${preparation.command.note.id}`,
      `clips.replace ${fixture.records.nonLoopClip.id}`,
      `midiSources.replace ${fixture.records.nonLoopSource.id}`,
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

    expect(describeChanges(preparation.plan.forward)).toEqual([
      `clips.replace ${fixture.records.nonLoopClip.id}`,
      'midiNotes.insert note-command-with-extension',
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
    const addedNotes = requireChange(commit, 'midiNotes', 'insert-partition').records
    await Promise.resolve()

    expect(commit.origin).toMatchObject({
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    })
    expect(addedNotes).toHaveLength(1)
    expect(addedNotes[0]).toMatchObject({ id: command.note.id })
    expect(noteCommits).toEqual([commit])
    expect(
      session.query(
        createMidiNoteByIdQuery({ sourceId: command.source.id, noteId: command.note.id }),
      ).note,
    ).toBe(addedNotes[0])

    const file = createProjectFile(session.getSnapshot())
    expect(file.clips.find(({ id }) => id === command.clip.id)).toMatchObject({
      spanTick: command.clip.spanTick,
    })
    expect(
      file.midiNotes[command.source.id]?.find(({ id }) => id === command.note.id),
    ).toMatchObject({
      startTick: command.note.startTick,
      durationTick: command.note.durationTick,
    })

    const undoCommit = session.undo()
    expect(undoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    })
    expect(requireChange(undoCommit, 'midiNotes', 'remove-partition').records).toEqual(addedNotes)
    expect(session.getSnapshot().clips.some(({ id }) => id === command.clip.id)).toBe(false)
    expect(
      session.query(
        createMidiNoteByIdQuery({ sourceId: command.source.id, noteId: command.note.id }),
      ).note,
    ).toBeUndefined()

    const redoCommit = session.redo()
    expect(requireChange(redoCommit, 'midiNotes', 'insert-partition').records).toEqual(addedNotes)
  })

  it('commits one extension step and atomically restores Clip, Source, Note, Query, and file facts', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const beforeRevision = session.modelRevision
    const command = createExtensionCommand(store)
    const commit = requireCommitted(session.execute(command))

    expect(session.modelRevision).toBe(beforeRevision + 1)
    expect(describeChanges(commit)).toEqual([
      `midiSources.replace ${fixture.records.nonLoopSource.id}`,
      `clips.replace ${fixture.records.nonLoopClip.id}`,
      `midiNotes.insert ${command.note.id}`,
    ])
    const sourceReplace = requireChange(commit, 'midiSources', 'replace')
    const clipReplace = requireChange(commit, 'clips', 'replace')
    const added = requireChange(commit, 'midiNotes', 'insert')

    expect(sourceReplace).toMatchObject({
      before: fixture.records.nonLoopSource,
      after: { lengthTick: 2_160 },
    })
    expect(clipReplace).toMatchObject({
      before: fixture.records.nonLoopClip,
      after: { spanTick: 1_920 },
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

    const file = createProjectFile(session.getSnapshot())
    const sourceId = fixture.records.nonLoopSource.id
    expect(file.clips.find(({ id }) => id === fixture.records.nonLoopClip.id)?.spanTick).toBe(1_920)
    expect(file.midiSources.find(({ id }) => id === sourceId)?.lengthTick).toBe(2_160)
    expect(file.midiNotes[sourceId]?.some(({ id }) => id === command.note.id)).toBe(true)

    const undoCommit = session.undo()
    expect(describeChanges(undoCommit)).toEqual([
      `midiNotes.remove ${command.note.id}`,
      `clips.replace ${fixture.records.nonLoopClip.id}`,
      `midiSources.replace ${fixture.records.nonLoopSource.id}`,
    ])
    expect(session.getSnapshot().clips.find(({ id }) => id === clipReplace.before.id)).toBe(
      clipReplace.before,
    )
    expect(session.getSnapshot().midiSources.find(({ id }) => id === sourceReplace.before.id)).toBe(
      sourceReplace.before,
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
    expect(describeChanges(redoCommit)).toEqual(describeChanges(commit))
  })
})
