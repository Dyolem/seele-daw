import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '~/index'
import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_TYPE,
  PROJECT_COMMIT_ORIGIN_KIND,
  createAddNoteCommand,
  createMidiNoteRecord,
  createMoveNoteCommand,
  createRemoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type AddNoteCommand,
  type ModelRevision,
  type ProjectChange,
  type ProjectCommit,
  type ProjectDelta,
} from '~/index'
import { prepareProjectCommand } from '@/commands/project-command-preparer'
import {
  ProjectCommitCandidateError,
  type ProjectCommitCandidateErrorCode,
} from '@/commit/project-commit-candidate-error'
import { createProjectCommitCandidate } from '@/commit/project-commit-candidate'
import { ModelStore } from '@/model/model-store'
import { ModelRevisionError } from '@/model/model-revision'
import { MutationApplier } from '@/mutation/mutation-applier'
import { MutationPlanError } from '@/mutation/mutation-plan-error'
import { createMutationPlan, type MutationPlan } from '@/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '@/mutation/mutation-type'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'

function captureCandidateError(
  operation: () => unknown,
  code: ProjectCommitCandidateErrorCode,
): ProjectCommitCandidateError {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(ProjectCommitCandidateError)
  expect(caughtError).toMatchObject({ code })

  if (!(caughtError instanceof ProjectCommitCandidateError)) {
    throw new Error('Expected a ProjectCommitCandidateError')
  }

  return caughtError
}

function createAddCommand(store: ModelStore): AddNoteCommand {
  const fixture = createCompleteProjectFixture()

  return createAddNoteCommand({
    baseRevision: store.modelRevision,
    sourceId: fixture.records.nonLoopSource.id,
    noteId: parseNoteId('note-commit-added'),
    startTick: parseTick(960),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(72),
    velocity: parseMidiVelocity(104),
    channel: parseMidiChannel(2),
  })
}

describe('ProjectCommit public contract', () => {
  it('exports semantic result types and constants without exposing preparation or writes', () => {
    expect(PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED).toBe('midi-note.added')
    expect(PROJECT_COMMIT_ORIGIN_KIND.COMMAND).toBe('command')
    expectTypeOf<ProjectCommit['delta']>().toEqualTypeOf<ProjectDelta>()
    expectTypeOf<ProjectDelta['changes'][number]>().toEqualTypeOf<ProjectChange>()

    expect('createProjectCommitCandidate' in projectCore).toBe(false)
    expect('ProjectCommitCandidateError' in projectCore).toBe(false)
    expect('createMutationPlan' in projectCore).toBe(false)
    expect('MutationApplier' in projectCore).toBe(false)
  })
})

describe('ProjectDelta Note semantics', () => {
  it('maps AddNote to an added change with the new Note interval', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const commit = createProjectCommitCandidate(command, plan)
    const mutation = plan.forward[0]
    const change = commit.delta.changes[0]

    expect(commit).toMatchObject({
      baseRevision: 0,
      modelRevision: 1,
      origin: {
        kind: PROJECT_COMMIT_ORIGIN_KIND.COMMAND,
        commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
      },
      delta: { modelRevision: 1 },
    })
    expect(change).toEqual({
      type: PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED,
      sourceId: command.sourceId,
      noteId: command.noteId,
      after: mutation !== undefined && 'after' in mutation ? mutation.after : undefined,
      affected: { startTick: parseTick(960), endTick: parseTick(1_200) },
    })

    if (
      mutation === undefined ||
      mutation.type !== PROJECT_MUTATION_TYPE.NOTE.INSERT ||
      change === undefined ||
      change.type !== PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED
    ) {
      throw new Error('Expected matching Note insert and added change')
    }

    expect(change.after).toBe(mutation.after)
  })

  it('maps RemoveNote to a removed change with the old Note interval', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const commit = createProjectCommitCandidate(command, plan)
    const change = commit.delta.changes[0]

    expect(change).toEqual({
      type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      before: fixture.records.nonLoopNote,
      affected: { startTick: parseTick(240), endTick: parseTick(720) },
    })
  })

  it('uses the conservative union of old and new intervals for MoveNote', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      nextStartTick: parseTick(1_200),
      nextPitch: parseMidiPitch(67),
    })
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const change = createProjectCommitCandidate(command, plan).delta.changes[0]

    expect(change).toMatchObject({
      type: PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      before: fixture.records.nonLoopNote,
      affected: { startTick: parseTick(240), endTick: parseTick(1_680) },
    })
  })

  it('keeps the same interval when only Note pitch changes', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      nextStartTick: fixture.records.nonLoopNote.startTick,
      nextPitch: parseMidiPitch(61),
    })
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const change = createProjectCommitCandidate(command, plan).delta.changes[0]

    expect(change?.affected).toEqual({ startTick: parseTick(240), endTick: parseTick(720) })
  })
})

describe('ProjectCommit candidate boundary', () => {
  it('freezes every owned result shell while retaining Record references', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const commit = createProjectCommitCandidate(command, plan)
    const change = commit.delta.changes[0]

    expect(Object.isFrozen(commit)).toBe(true)
    expect(Object.isFrozen(commit.origin)).toBe(true)
    expect(Object.isFrozen(commit.delta)).toBe(true)
    expect(Object.isFrozen(commit.delta.changes)).toBe(true)
    expect(Object.isFrozen(change)).toBe(true)
    expect(Object.isFrozen(change?.affected)).toBe(true)

    if (
      change === undefined ||
      change.type !== PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED ||
      plan.forward[0]?.type !== PROJECT_MUTATION_TYPE.NOTE.INSERT
    ) {
      throw new Error('Expected an added Note change')
    }

    expect(change.after).toBe(plan.forward[0].after)
  })

  it('prepares the candidate without writing and matches the later applied revision', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const commit = createProjectCommitCandidate(command, plan)

    expect(store.modelRevision).toBe(0)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBeUndefined()

    const committedRevision = new MutationApplier(store).apply(plan)
    const change = commit.delta.changes[0]

    if (change === undefined || change.type !== PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED) {
      throw new Error('Expected an added Note change')
    }

    expect(committedRevision).toBe(commit.modelRevision)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBe(change.after)
  })

  it('rejects a structurally similar plan without factory provenance', () => {
    const fixture = createCompleteProjectFixture()
    const fakePlan = {
      baseRevision: 0 as ModelRevision,
      forward: [
        {
          type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
          sourceId: fixture.records.nonLoopSource.id,
          before: fixture.records.nonLoopNote,
        },
      ],
      inverse: [],
    } as MutationPlan

    const command = createRemoveNoteCommand({
      baseRevision: fakePlan.baseRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })

    expect(() => createProjectCommitCandidate(command, fakePlan)).toThrowError(
      expect.objectContaining<Partial<MutationPlanError>>({ code: 'unrecognized-plan' }),
    )
  })

  it('rejects revision exhaustion before a candidate can be produced', () => {
    const fixture = createCompleteProjectFixture()
    const baseRevision = Number.MAX_SAFE_INTEGER as ModelRevision
    const command = createRemoveNoteCommand({
      baseRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const plan = createMutationPlan(baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
      },
    ])

    expect(() => createProjectCommitCandidate(command, plan)).toThrowError(
      expect.objectContaining<Partial<ModelRevisionError>>({ code: 'model-revision-overflow' }),
    )
  })

  it('rejects an unsupported mutation instead of emitting a partial Delta', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
        before: fixture.records.audioTrack,
      },
    ])
    const error = captureCandidateError(
      () => createProjectCommitCandidate(command, plan),
      'unsupported-mutation-type',
    )

    expect(error.mutationIndex).toBe(0)
    expect(error.mutationType).toBe(PROJECT_MUTATION_TYPE.TRACK.REMOVE)
    expect(store.modelRevision).toBe(0)
    expect(store.getTrack(fixture.records.audioTrack.id)).toBe(fixture.records.audioTrack)
  })

  it('rejects a Command and Plan with different base revisions', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const plan = createMutationPlan(1 as ModelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
        sourceId: command.sourceId,
        after: createMidiNoteRecord({
          id: command.noteId,
          startTick: command.startTick,
          durationTick: command.durationTick,
          pitch: command.pitch,
          velocity: command.velocity,
          channel: command.channel,
        }),
      },
    ])
    const error = captureCandidateError(
      () => createProjectCommitCandidate(command, plan),
      'base-revision-mismatch',
    )

    expect(error.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD)
  })

  it('rejects an AddNote Plan whose Note payload differs from the Command', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
        sourceId: command.sourceId,
        after: createMidiNoteRecord({
          id: command.noteId,
          startTick: command.startTick,
          durationTick: command.durationTick,
          pitch: parseMidiPitch(71),
          velocity: command.velocity,
          channel: command.channel,
        }),
      },
    ])
    const error = captureCandidateError(
      () => createProjectCommitCandidate(command, plan),
      'command-plan-mismatch',
    )

    expect(error.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD)
    expect(error.mutationType).toBe(PROJECT_MUTATION_TYPE.NOTE.INSERT)
  })

  it('rejects a RemoveNote Plan for a different Note address', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
        sourceId: command.sourceId,
        before: fixture.records.nonLoopHarmonyNote,
      },
    ])
    const error = captureCandidateError(
      () => createProjectCommitCandidate(command, plan),
      'command-plan-mismatch',
    )

    expect(error.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE)
    expect(error.mutationType).toBe(PROJECT_MUTATION_TYPE.NOTE.REMOVE)
  })

  it('rejects Plans that change extra fields or bypass MoveNote no-change semantics', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      nextStartTick: parseTick(960),
      nextPitch: parseMidiPitch(65),
    })
    const plan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: command.sourceId,
        before: fixture.records.nonLoopNote,
        after: createMidiNoteRecord({
          ...fixture.records.nonLoopNote,
          startTick: command.nextStartTick,
          pitch: command.nextPitch,
          velocity: parseMidiVelocity(1),
        }),
      },
    ])
    const error = captureCandidateError(
      () => createProjectCommitCandidate(command, plan),
      'command-plan-mismatch',
    )
    const noChangeCommand = createMoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      nextStartTick: fixture.records.nonLoopNote.startTick,
      nextPitch: fixture.records.nonLoopNote.pitch,
    })
    const noChangePlan = createMutationPlan(store.modelRevision, [
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: noChangeCommand.sourceId,
        before: fixture.records.nonLoopNote,
        after: createMidiNoteRecord(fixture.records.nonLoopNote),
      },
    ])

    expect(error.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE)
    expect(error.mutationIndex).toBe(0)
    expect(error.mutationType).toBe(PROJECT_MUTATION_TYPE.NOTE.REPLACE)
    captureCandidateError(
      () => createProjectCommitCandidate(noChangeCommand, noChangePlan),
      'command-plan-mismatch',
    )
    expect(store.modelRevision).toBe(0)
  })
})
