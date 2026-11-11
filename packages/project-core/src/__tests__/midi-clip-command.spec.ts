import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddMidiClipCommand,
  createAddNoteCommand,
  createAllProjectCommitsSubscription,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  parseClipId,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectColor,
  parseTick,
  parseTrackId,
  type AddMidiClipCommand,
  type CreateAddMidiClipCommandInput,
  type ProjectCommit,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { ModelStore } from '#internal/model/model-store'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { describeChanges, requireChange } from './support/project-change-test-support'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createCommandInput(
  store: ModelStore,
  overrides: Partial<CreateAddMidiClipCommandInput> = {},
): CreateAddMidiClipCommandInput {
  return {
    baseRevision: store.modelRevision,
    clipId: parseClipId('clip-command-empty'),
    trackId: parseTrackId('track-instrument'),
    name: 'Fixture Instrument',
    color: null,
    muted: false,
    startTick: parseTick(3_840),
    spanTick: parseTick(3_840),
    sourceId: parseMidiSourceId('source-command-empty'),
    sourceLengthTick: parseTick(3_840),
    sourceOffsetTick: parseTick(0),
    ...overrides,
  }
}

function createCommand(
  store: ModelStore,
  overrides: Partial<CreateAddMidiClipCommandInput> = {},
): AddMidiClipCommand {
  return createAddMidiClipCommand(createCommandInput(store, overrides))
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

describe('AddMidiClipCommand public contract', () => {
  it('normalizes a complete MIDI Clip and its exclusively owned Source', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store, {
      color: '#7c5cff' as ReturnType<typeof parseProjectColor>,
      spanTick: parseTick(1_680),
      sourceLengthTick: parseTick(1_920),
      sourceOffsetTick: parseTick(240),
    })

    expect(PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD).toBe('midi-clip.add')
    expect(command).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
      baseRevision: store.modelRevision,
      clip: {
        id: parseClipId('clip-command-empty'),
        trackId: fixture.records.instrumentTrack.id,
        name: 'Fixture Instrument',
        color: '#7C5CFF',
        muted: false,
        startTick: parseTick(3_840),
        spanTick: parseTick(1_680),
        sourceId: parseMidiSourceId('source-command-empty'),
        sourceOffsetTick: parseTick(240),
      },
      source: {
        id: parseMidiSourceId('source-command-empty'),
        lengthTick: parseTick(1_920),
      },
    })
    expectTypeOf(command).toEqualTypeOf<AddMidiClipCommand>()
  })
})

describe('AddMidiClipCommand preparation', () => {
  it('prepares Source, empty event partitions, and Clip insertion with an exact inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store)
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    expect(plan.forward).toEqual([
      {
        op: 'insert',
        table: 'midiSources',
        after: command.source,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: command.source.id,
        records: [],
      },
      {
        op: 'insert-partition',
        table: 'midiSustainPedalEvents',
        sourceId: command.source.id,
        records: [],
      },
      {
        op: 'insert',
        table: 'clips',
        after: command.clip,
      },
    ])
    expect(plan.inverse).toEqual([
      {
        op: 'remove',
        table: 'clips',
        before: command.clip,
      },
      {
        op: 'remove-partition',
        table: 'midiSustainPedalEvents',
        sourceId: command.source.id,
        records: [],
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: command.source.id,
        records: [],
      },
      {
        op: 'remove',
        table: 'midiSources',
        before: command.source,
      },
    ])

    if (
      preparation.status !== 'ready' ||
      preparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD ||
      plan.forward[0]?.op !== 'insert' ||
      plan.forward[0].table !== 'midiSources' ||
      plan.forward[3]?.op !== 'insert' ||
      plan.forward[3].table !== 'clips'
    ) {
      throw new Error('Expected a ready MIDI Clip graph insertion')
    }

    expect(preparation.command).toBe(command)
    expect(plan.forward[0].after).toBe(preparation.command.source)
    expect(plan.forward[3].after).toBe(preparation.command.clip)
  })

  it('rejects a missing target Track', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingTrackId = parseTrackId('track-command-missing')
    const missingTrack = captureCommandError(() =>
      prepareProjectCommand(store, createCommand(store, { trackId: missingTrackId })),
    )

    expect(missingTrack).toMatchObject({
      code: 'track-not-found',
    })
  })

  it('rejects occupied Clip and Source identities', () => {
    const duplicateClipFixture = createCompleteProjectFixture()
    const duplicateClipStore = new ModelStore(duplicateClipFixture.seed)
    const duplicateClip = captureCommandError(() =>
      prepareProjectCommand(
        duplicateClipStore,
        createCommand(duplicateClipStore, {
          clipId: duplicateClipFixture.records.verseClip.id,
        }),
      ),
    )

    const duplicateSourceFixture = createCompleteProjectFixture()
    const duplicateSourceStore = new ModelStore(duplicateSourceFixture.seed)
    const duplicateSource = captureCommandError(() =>
      prepareProjectCommand(
        duplicateSourceStore,
        createCommand(duplicateSourceStore, {
          sourceId: duplicateSourceFixture.records.verseSource.id,
        }),
      ),
    )

    expect(duplicateClip).toMatchObject({
      code: 'clip-id-already-exists',
    })
    expect(duplicateSource).toMatchObject({
      code: 'midi-source-id-already-exists',
    })
  })

  it('rejects a Clip window that reads beyond its new Source', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store, {
      spanTick: parseTick(3_840),
      sourceLengthTick: parseTick(1_920),
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error).toMatchObject({
      code: 'midi-clip-out-of-source-range',
    })
  })
})

describe('MIDI Clip commit and History semantics', () => {
  it('commits the Source, its partitions and the Clip, and replays them exactly', () => {
    const { store, session } = createFixtureProjectSession()
    const command = createCommand(store)
    const result = session.execute(command)

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected AddMidiClip to commit')
    }

    expect(describeChanges(result.commit)).toEqual([
      `midiSources.insert ${command.source.id}`,
      `midiNotes.insert-partition ${command.source.id}`,
      `midiSustainPedalEvents.insert-partition ${command.source.id}`,
      `clips.insert ${command.clip.id}`,
    ])
    const clipInsert = requireChange(result.commit, 'clips', 'insert')
    const sourceInsert = requireChange(result.commit, 'midiSources', 'insert')

    expect(clipInsert.after).toEqual(command.clip)
    expect(sourceInsert.after).toEqual(command.source)
    expect(Object.isFrozen(clipInsert)).toBe(true)
    expect(store.getClip(command.clip.id)).toBe(clipInsert.after)
    expect(store.getMidiSource(command.source.id)).toBe(sourceInsert.after)
    expect(store.hasMidiNotePartition(command.source.id)).toBe(true)
    expect([...store.midiNoteEntries(command.source.id)]).toEqual([])
    expect(store.hasMidiSustainPedalEventPartition(command.source.id)).toBe(true)
    expect([...store.midiSustainPedalEventEntries(command.source.id)]).toEqual([])

    const undoCommit = session.undo()

    expect(undoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
    })
    expect(describeChanges(undoCommit)).toEqual([
      `clips.remove ${command.clip.id}`,
      `midiSustainPedalEvents.remove-partition ${command.source.id}`,
      `midiNotes.remove-partition ${command.source.id}`,
      `midiSources.remove ${command.source.id}`,
    ])
    expect(requireChange(undoCommit, 'clips', 'remove').before).toBe(clipInsert.after)
    expect(requireChange(undoCommit, 'midiSources', 'remove').before).toBe(sourceInsert.after)
    expect(store.getClip(command.clip.id)).toBeUndefined()
    expect(store.getMidiSource(command.source.id)).toBeUndefined()
    expect(store.hasMidiNotePartition(command.source.id)).toBe(false)
    expect(store.hasMidiSustainPedalEventPartition(command.source.id)).toBe(false)

    const redoCommit = session.redo()

    expect(requireChange(redoCommit, 'clips', 'insert').after).toBe(clipInsert.after)
    expect(requireChange(redoCommit, 'midiSources', 'insert').after).toBe(sourceInsert.after)
    expect(store.getClip(command.clip.id)).toBe(clipInsert.after)
    expect(store.getMidiSource(command.source.id)).toBe(sourceInsert.after)
    expect(store.hasMidiNotePartition(command.source.id)).toBe(true)
    expect(store.hasMidiSustainPedalEventPartition(command.source.id)).toBe(true)
  })
})

describe('MIDI Clip consumer compatibility', () => {
  it('adds an empty Note partition that can immediately receive and answer Note commands', () => {
    const { store, session } = createFixtureProjectSession()
    const clipCommand = createCommand(store)
    const clipResult = session.execute(clipCommand)

    expect(clipResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

    const noteId = parseNoteId('note-command-new-clip')
    const noteResult = session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: clipCommand.source.id,
        noteId,
        startTick: parseTick(0),
        durationTick: parseTick(480),
        pitch: parseMidiPitch(60),
        velocity: parseMidiVelocity(100),
        channel: parseMidiChannel(0),
      }),
    )
    const queryResult = session.query(
      createMidiNoteByIdQuery({
        sourceId: clipCommand.source.id,
        noteId,
      }),
    )

    expect(noteResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(queryResult.modelRevision).toBe(session.modelRevision)
    expect(queryResult.note?.id).toBe(noteId)
  })

  it('publishes to all-commits but not to MIDI Note subscriptions', async () => {
    const { store, session } = createFixtureProjectSession()
    const allCommits: ProjectCommit[] = []
    const noteCommits: ProjectCommit[] = []

    session.subscribe(createAllProjectCommitsSubscription(), (commit) => allCommits.push(commit))
    session.subscribe(createMidiNoteChangesSubscription(), (commit) => noteCommits.push(commit))

    const result = session.execute(createCommand(store))

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    await Promise.resolve()

    expect(allCommits).toHaveLength(1)
    expect(noteCommits).toEqual([])
  })
})
