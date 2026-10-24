import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_TYPE,
  PROJECT_COMMIT_ORIGIN_KIND,
  createAddNoteCommand,
  createMidiNoteRecord,
  createRemoveNotesCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type AddNoteCommand,
  type ModelRevision,
  type ProjectChange,
  type ProjectCommit,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import {
  ProjectCommitCandidateError,
  type ProjectCommitCandidateErrorCode,
} from '#internal/commit/project-commit-candidate-error'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { ModelRevisionError } from '#internal/model/model-revision'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { MutationPlanError } from '#internal/mutation/mutation-plan-error'
import { createMutationPlan, type MutationPlan } from '#internal/mutation/mutation-plan'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireChange } from './support/project-change-test-support'
import { requireReadyProjectCommandPreparation } from './support/project-command-test-support'

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
  it('exports the commit shape without exposing preparation or writes', () => {
    expect(PROJECT_COMMIT_ORIGIN_KIND.COMMAND).toBe('command')
    expectTypeOf<ProjectCommit['changes'][number]>().toEqualTypeOf<ProjectChange>()

    expect('createProjectCommitCandidate' in projectCore).toBe(false)
    expect('ProjectCommitCandidateError' in projectCore).toBe(false)
    expect('createMutationPlan' in projectCore).toBe(false)
    expect('MutationApplier' in projectCore).toBe(false)
  })
})

describe('ProjectCommit candidate boundary', () => {
  it("publishes the plan's forward changes in a frozen shell", () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const preparation = requireReadyProjectCommandPreparation(prepareProjectCommand(store, command))
    const commit = createProjectCommitCandidate(preparation.command, preparation.plan)

    expect(commit).toMatchObject({
      baseRevision: 0,
      modelRevision: 1,
      origin: {
        kind: PROJECT_COMMIT_ORIGIN_KIND.COMMAND,
        commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
      },
    })
    expect(commit.changes).toBe(preparation.plan.forward)
    expect(Object.isFrozen(commit)).toBe(true)
    expect(Object.isFrozen(commit.origin)).toBe(true)
    expect(Object.isFrozen(commit.changes)).toBe(true)
    expect(Object.isFrozen(commit.changes[0])).toBe(true)
  })

  it('prepares the candidate without writing and matches the later applied revision', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const preparation = requireReadyProjectCommandPreparation(prepareProjectCommand(store, command))
    const plan = preparation.plan
    const commit = createProjectCommitCandidate(preparation.command, plan)

    expect(store.modelRevision).toBe(0)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBeUndefined()

    const committedRevision = new MutationApplier(store).apply(plan)

    expect(committedRevision).toBe(commit.modelRevision)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBe(
      requireChange(commit, 'midiNotes', 'insert').after,
    )
  })

  it('rejects a structurally similar plan without factory provenance', () => {
    const fixture = createCompleteProjectFixture()
    const fakePlan = {
      baseRevision: 0 as ModelRevision,
      forward: [
        {
          op: 'remove',
          table: 'midiNotes',
          sourceId: fixture.records.nonLoopSource.id,
          before: fixture.records.nonLoopNote,
        },
      ],
      inverse: [],
    } as MutationPlan

    const command = createRemoveNotesCommand({
      baseRevision: fakePlan.baseRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteIds: [fixture.records.nonLoopNote.id],
    })

    expect(() => createProjectCommitCandidate(command, fakePlan)).toThrowError(
      expect.objectContaining<Partial<MutationPlanError>>({ code: 'unrecognized-plan' }),
    )
  })

  it('rejects revision exhaustion before a candidate can be produced', () => {
    const fixture = createCompleteProjectFixture()
    const baseRevision = Number.MAX_SAFE_INTEGER as ModelRevision
    const command = createRemoveNotesCommand({
      baseRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteIds: [fixture.records.nonLoopNote.id],
    })
    const plan = createMutationPlan(baseRevision, [
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
      },
    ])

    expect(() => createProjectCommitCandidate(command, plan)).toThrowError(
      expect.objectContaining<Partial<ModelRevisionError>>({ code: 'model-revision-overflow' }),
    )
  })

  it('rejects a Command and Plan with different base revisions', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store)
    const plan = createMutationPlan(1 as ModelRevision, [
      {
        op: 'insert',
        table: 'midiNotes',
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
})
