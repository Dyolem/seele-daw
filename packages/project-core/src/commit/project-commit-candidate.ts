import {
  normalizeProjectCommand,
  PROJECT_COMMAND_TYPE,
  type AddNoteCommand,
  type MoveNoteCommand,
  type ProjectCommand,
  type ProjectCommandType,
  type RemoveNoteCommand,
} from '#internal/commands/project-command'
import {
  PROJECT_CHANGE_TYPE,
  type AffectedTickRange,
  type MidiNoteAddedChange,
  type MidiNoteRemovedChange,
  type MidiNoteUpdatedChange,
  type ProjectChange,
} from '#internal/commit/project-change'
import {
  ProjectCommitCandidateError,
  type ProjectCommitCandidateErrorDetails,
} from '#internal/commit/project-commit-candidate-error'
import {
  PROJECT_COMMIT_ORIGIN_KIND,
  type ProjectCommit,
  type ProjectCommandCommitOrigin,
  type ProjectHistoryCommitOrigin,
  type ProjectHistoryDirection,
} from '#internal/commit/project-commit'
import type { ProjectDelta } from '#internal/commit/project-delta'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import { nextModelRevision } from '#internal/model/model-revision'
import { assertCreatedMutationPlan, type MutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectMutation } from '#internal/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { addTicks } from '#internal/time/tick'

function rejectCandidate(
  code: ProjectCommitCandidateError['code'],
  message: string,
  details: ProjectCommitCandidateErrorDetails = {},
): never {
  throw new ProjectCommitCandidateError(code, message, details)
}

function createNoteRange(note: MidiNoteRecord): AffectedTickRange {
  return Object.freeze({
    startTick: note.startTick,
    endTick: addTicks(note.startTick, note.durationTick),
  })
}

function createUpdatedNoteRange(before: MidiNoteRecord, after: MidiNoteRecord): AffectedTickRange {
  const beforeEndTick = addTicks(before.startTick, before.durationTick)
  const afterEndTick = addTicks(after.startTick, after.durationTick)

  return Object.freeze({
    startTick: before.startTick < after.startTick ? before.startTick : after.startTick,
    endTick: beforeEndTick > afterEndTick ? beforeEndTick : afterEndTick,
  })
}

function mapMutationToChange(mutation: ProjectMutation, mutationIndex: number): ProjectChange {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.NOTE.INSERT:
      return Object.freeze<MidiNoteAddedChange>({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED,
        sourceId: mutation.sourceId,
        noteId: mutation.after.id,
        after: mutation.after,
        affected: createNoteRange(mutation.after),
      })

    case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
      return Object.freeze<MidiNoteRemovedChange>({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED,
        sourceId: mutation.sourceId,
        noteId: mutation.before.id,
        before: mutation.before,
        affected: createNoteRange(mutation.before),
      })

    case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
      return Object.freeze<MidiNoteUpdatedChange>({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED,
        sourceId: mutation.sourceId,
        noteId: mutation.after.id,
        before: mutation.before,
        after: mutation.after,
        affected: createUpdatedNoteRange(mutation.before, mutation.after),
      })

    default:
      return rejectCandidate(
        'unsupported-mutation-type',
        `Mutation ${mutation.type} at index ${mutationIndex} does not have ProjectDelta semantics`,
        { mutationIndex, mutationType: mutation.type },
      )
  }
}

function matchesAddedNote(command: AddNoteCommand, mutation: ProjectMutation): boolean {
  return (
    mutation.type === PROJECT_MUTATION_TYPE.NOTE.INSERT &&
    mutation.sourceId === command.sourceId &&
    mutation.after.id === command.noteId &&
    mutation.after.startTick === command.startTick &&
    mutation.after.durationTick === command.durationTick &&
    mutation.after.pitch === command.pitch &&
    mutation.after.velocity === command.velocity &&
    mutation.after.channel === command.channel
  )
}

function matchesMovedNote(command: MoveNoteCommand, mutation: ProjectMutation): boolean {
  return (
    mutation.type === PROJECT_MUTATION_TYPE.NOTE.REPLACE &&
    mutation.sourceId === command.sourceId &&
    mutation.before.id === command.noteId &&
    mutation.after.id === command.noteId &&
    (mutation.before.startTick !== command.nextStartTick ||
      mutation.before.pitch !== command.nextPitch) &&
    mutation.after.startTick === command.nextStartTick &&
    mutation.after.pitch === command.nextPitch &&
    mutation.after.durationTick === mutation.before.durationTick &&
    mutation.after.velocity === mutation.before.velocity &&
    mutation.after.channel === mutation.before.channel
  )
}

function matchesRemovedNote(command: RemoveNoteCommand, mutation: ProjectMutation): boolean {
  return (
    mutation.type === PROJECT_MUTATION_TYPE.NOTE.REMOVE &&
    mutation.sourceId === command.sourceId &&
    mutation.before.id === command.noteId
  )
}

function assertCommandPlanCorrespondence(command: ProjectCommand, plan: MutationPlan): void {
  const mutation = plan.forward[0]
  let matches = false

  if (plan.forward.length === 1 && mutation !== undefined) {
    switch (command.type) {
      case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
        matches = matchesAddedNote(command, mutation)
        break
      case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
        matches = matchesMovedNote(command, mutation)
        break
      case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
        matches = matchesRemovedNote(command, mutation)
        break
    }
  }

  if (!matches) {
    rejectCandidate(
      'command-plan-mismatch',
      `Command ${command.type} does not correspond to its MutationPlan`,
      {
        commandType: command.type,
        mutationIndex: mutation === undefined ? undefined : 0,
        mutationType: mutation?.type,
      },
    )
  }
}

/**
 * Derives every semantic change before authoritative writes begin. Unsupported
 * mutation types fail closed so a commit can never silently omit a model change.
 */
function createProjectDelta(plan: MutationPlan): ProjectDelta {
  assertCreatedMutationPlan(plan)

  const modelRevision = nextModelRevision(plan.baseRevision)
  const changes = Object.freeze(plan.forward.map(mapMutationToChange))

  return Object.freeze({ modelRevision, changes })
}

function createCandidate(
  plan: MutationPlan,
  origin: ProjectCommandCommitOrigin | ProjectHistoryCommitOrigin,
  delta: ProjectDelta,
): ProjectCommit {
  return Object.freeze({
    baseRevision: plan.baseRevision,
    modelRevision: delta.modelRevision,
    origin,
    delta,
  })
}

/**
 * Builds an immutable candidate before MutationApplier runs. A future Session
 * may publish it only after apply returns the same modelRevision.
 */
export function createProjectCommitCandidate(
  command: ProjectCommand,
  plan: MutationPlan,
): ProjectCommit {
  assertCreatedMutationPlan(plan)

  const normalizedCommand = normalizeProjectCommand(command)

  if (normalizedCommand.baseRevision !== plan.baseRevision) {
    rejectCandidate(
      'base-revision-mismatch',
      `Command revision ${normalizedCommand.baseRevision} does not match plan revision ${plan.baseRevision}`,
      { commandType: normalizedCommand.type },
    )
  }

  // Delta construction stays private: only a complete Commit candidate is a current
  // production boundary. History may introduce another real origin when it is built.
  const delta = createProjectDelta(plan)
  assertCommandPlanCorrespondence(normalizedCommand, plan)
  const origin = Object.freeze<ProjectCommandCommitOrigin>({
    kind: PROJECT_COMMIT_ORIGIN_KIND.COMMAND,
    commandType: normalizedCommand.type,
  })

  return createCandidate(plan, origin, delta)
}

export interface CreateHistoryProjectCommitCandidateInput {
  readonly direction: ProjectHistoryDirection
  readonly commandType: ProjectCommandType
}

/** @internal Builds the new commit produced by executing one History replay plan. */
export function createHistoryProjectCommitCandidate(
  input: CreateHistoryProjectCommitCandidateInput,
  plan: MutationPlan,
): ProjectCommit {
  assertCreatedMutationPlan(plan)

  const delta = createProjectDelta(plan)
  const origin = Object.freeze<ProjectHistoryCommitOrigin>({
    kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
    direction: input.direction,
    commandType: input.commandType,
  })

  return createCandidate(plan, origin, delta)
}
