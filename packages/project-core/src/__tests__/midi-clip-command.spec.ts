import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_CHANGE_TYPE,
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
import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
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
    loop: null,
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

function requireAddedMidiClipChange(commit: ProjectCommit) {
  const change = commit.delta.changes[0]

  expect(commit.delta.changes).toHaveLength(1)
  expect(change?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED)

  if (change?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED) {
    throw new Error('Expected an added MIDI Clip change')
  }

  return change
}

describe('AddMidiClipCommand public contract', () => {
  it('normalizes a complete MIDI Clip and its exclusively owned Source', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const loop = {
      sourceStartTick: parseTick(0),
      sourceSpanTick: parseTick(960),
    }
    const command = createCommand(store, {
      color: '#7c5cff' as ReturnType<typeof parseProjectColor>,
      spanTick: parseTick(3_840),
      sourceLengthTick: parseTick(1_920),
      sourceOffsetTick: parseTick(240),
      loop,
    })

    loop.sourceSpanTick = parseTick(480)

    expect(PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD).toBe('midi-clip.add')
    expect(command).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
      baseRevision: store.modelRevision,
      clip: {
        id: parseClipId('clip-command-empty'),
        kind: 'midi',
        trackId: fixture.records.instrumentTrack.id,
        name: 'Fixture Instrument',
        color: '#7C5CFF',
        muted: false,
        startTick: parseTick(3_840),
        spanTick: parseTick(3_840),
        sourceId: parseMidiSourceId('source-command-empty'),
        sourceOffsetTick: parseTick(240),
        loop: {
          sourceStartTick: parseTick(0),
          sourceSpanTick: parseTick(960),
        },
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
  it('prepares Source, empty Note Partition, and Clip insertion with an exact inverse', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store)
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)

    expect(plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: command.source,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: command.source.id,
        after: [],
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
        after: command.clip,
      },
    ])
    expect(plan.inverse).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.CLIP.REMOVE,
        before: command.clip,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
        sourceId: command.source.id,
        before: [],
      },
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE,
        before: command.source,
      },
    ])

    if (
      preparation.status !== 'ready' ||
      preparation.command.type !== PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD ||
      plan.forward[0]?.type !== PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT ||
      plan.forward[2]?.type !== PROJECT_MUTATION_TYPE.CLIP.INSERT
    ) {
      throw new Error('Expected a ready MIDI Clip graph insertion')
    }

    expect(preparation.command).not.toBe(command)
    expect(plan.forward[0].after).toBe(preparation.command.source)
    expect(plan.forward[2].after).toBe(preparation.command.clip)
  })

  it('binds aggregate correspondence to the normalized Record references', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const preparation = prepareProjectCommand(store, createCommand(store))

    if (preparation.status !== 'ready') {
      throw new Error('Expected a ready MIDI Clip command preparation')
    }

    const valueEqualCommand = createCommand(store)

    expect(() =>
      createProjectCommitCandidate(valueEqualCommand, preparation.plan),
    ).toThrowError(expect.objectContaining({ code: 'command-plan-mismatch' }))
    expect(() =>
      createProjectCommitCandidate(preparation.command, preparation.plan),
    ).not.toThrow()
  })

  it('rejects missing and non-Instrument target Tracks', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingTrackId = parseTrackId('track-command-missing')
    const missingTrack = captureCommandError(() =>
      prepareProjectCommand(store, createCommand(store, { trackId: missingTrackId })),
    )
    const audioTrack = captureCommandError(() =>
      prepareProjectCommand(
        store,
        createCommand(store, { trackId: fixture.records.audioTrack.id }),
      ),
    )

    expect(missingTrack).toMatchObject({
      code: 'track-not-found',
      clipId: parseClipId('clip-command-empty'),
      trackId: missingTrackId,
    })
    expect(audioTrack).toMatchObject({
      code: 'midi-clip-track-kind-mismatch',
      trackId: fixture.records.audioTrack.id,
      trackKind: 'audio',
    })
  })

  it('rejects occupied Clip, Source, and Note Partition identities', () => {
    const duplicateClipFixture = createCompleteProjectFixture()
    const duplicateClipStore = new ModelStore(duplicateClipFixture.seed)
    const duplicateClip = captureCommandError(() =>
      prepareProjectCommand(
        duplicateClipStore,
        createCommand(duplicateClipStore, {
          clipId: duplicateClipFixture.records.nonLoopClip.id,
        }),
      ),
    )

    const duplicateSourceFixture = createCompleteProjectFixture()
    const duplicateSourceStore = new ModelStore(duplicateSourceFixture.seed)
    const duplicateSource = captureCommandError(() =>
      prepareProjectCommand(
        duplicateSourceStore,
        createCommand(duplicateSourceStore, {
          sourceId: duplicateSourceFixture.records.nonLoopSource.id,
        }),
      ),
    )

    const duplicatePartitionFixture = createCompleteProjectFixture()
    const partitionSourceId = parseMidiSourceId('source-command-partition-only')
    duplicatePartitionFixture.containers.midiNotesBySource.set(partitionSourceId, new Map())
    const duplicatePartitionStore = new ModelStore(duplicatePartitionFixture.seed)
    const duplicatePartition = captureCommandError(() =>
      prepareProjectCommand(
        duplicatePartitionStore,
        createCommand(duplicatePartitionStore, { sourceId: partitionSourceId }),
      ),
    )

    expect(duplicateClip).toMatchObject({
      code: 'clip-id-already-exists',
      clipId: duplicateClipFixture.records.nonLoopClip.id,
    })
    expect(duplicateSource).toMatchObject({
      code: 'midi-source-id-already-exists',
      sourceId: duplicateSourceFixture.records.nonLoopSource.id,
    })
    expect(duplicatePartition).toMatchObject({
      code: 'midi-note-partition-already-exists',
      sourceId: partitionSourceId,
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
      clipId: command.clip.id,
      sourceId: command.source.id,
      sourceLengthTick: parseTick(1_920),
      sourceReadEndTick: parseTick(3_840),
    })
  })
})

describe('MIDI Clip commit and History semantics', () => {
  it('commits one aggregate change and restores the complete ownership graph', () => {
    const { store, session } = createFixtureProjectSession()
    const command = createCommand(store)
    const result = session.execute(command)

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected AddMidiClip to commit')
    }

    const change = requireAddedMidiClipChange(result.commit)

    expect(change).toMatchObject({
      clipId: command.clip.id,
      sourceId: command.source.id,
      trackId: command.clip.trackId,
      affected: {
        startTick: command.clip.startTick,
        endTick: parseTick(7_680),
      },
      after: {
        clip: command.clip,
        source: command.source,
        notes: [],
      },
    })
    expect(Object.isFrozen(change)).toBe(true)
    expect(Object.isFrozen(change.affected)).toBe(true)
    expect(Object.isFrozen(change.after)).toBe(true)
    expect(Object.isFrozen(change.after.notes)).toBe(true)
    expect(store.getClip(command.clip.id)).toBe(change.after.clip)
    expect(store.getMidiSource(command.source.id)).toBe(change.after.source)
    expect(store.hasMidiNotePartition(command.source.id)).toBe(true)
    expect([...store.midiNoteEntries(command.source.id)]).toEqual([])

    const undoCommit = session.undo()
    const undoChange = undoCommit?.delta.changes[0]

    expect(undoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
    })
    expect(undoChange?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED)
    if (undoChange?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED) {
      throw new Error('Expected a removed MIDI Clip change')
    }
    expect(undoChange.before.clip).toBe(change.after.clip)
    expect(undoChange.before.source).toBe(change.after.source)
    expect(undoChange.before.notes).toEqual([])
    expect(store.getClip(command.clip.id)).toBeUndefined()
    expect(store.getMidiSource(command.source.id)).toBeUndefined()
    expect(store.hasMidiNotePartition(command.source.id)).toBe(false)

    const redoCommit = session.redo()
    const redoChange = redoCommit?.delta.changes[0]

    expect(redoChange?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED)
    if (redoChange?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED) {
      throw new Error('Expected a restored MIDI Clip change')
    }
    expect(redoChange.after.clip).toBe(change.after.clip)
    expect(redoChange.after.source).toBe(change.after.source)
    expect(store.getClip(command.clip.id)).toBe(change.after.clip)
    expect(store.getMidiSource(command.source.id)).toBe(change.after.source)
    expect(store.hasMidiNotePartition(command.source.id)).toBe(true)
  })

  it('fails closed when a MIDI Clip graph is incomplete or not empty', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store)
    const incompletePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: command.source,
      },
    ])
    const populatedPlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: command.source,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: command.source.id,
        after: [fixture.records.nonLoopNote],
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
        after: command.clip,
      },
    ])

    expect(() => createProjectCommitCandidate(command, incompletePlan)).toThrowError(
      expect.objectContaining({ code: 'unsupported-mutation-type' }),
    )
    expect(() => createProjectCommitCandidate(command, populatedPlan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )
  })
})

describe('MIDI Clip consumer compatibility', () => {
  it('adds an empty QueryIndex partition that can immediately receive Note commands', () => {
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

    session.subscribe(createAllProjectCommitsSubscription(), {
      onCommit: (commit) => allCommits.push(commit),
      onError: () => undefined,
    })
    session.subscribe(createMidiNoteChangesSubscription(), {
      onCommit: (commit) => noteCommits.push(commit),
      onError: () => undefined,
    })

    const result = session.execute(createCommand(store))

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    await Promise.resolve()

    expect(allCommits).toHaveLength(1)
    expect(noteCommits).toEqual([])
  })
})
