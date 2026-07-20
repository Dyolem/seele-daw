import {
  normalizeProjectCommand,
  PROJECT_COMMAND_TYPE,
  type AddNoteCommand,
  type MoveNoteCommand,
  type ProjectCommand,
  type RemoveNoteCommand,
} from '@/commands/project-command'
import {
  PROJECT_CHANGE_TYPE,
  type AffectedTickRange,
  type MidiNoteAddedChange,
  type MidiNoteRemovedChange,
  type MidiNoteUpdatedChange,
  type ProjectChange,
} from '@/commit/project-change'
import {
  ProjectCommitPreparationError,
  type ProjectCommitPreparationErrorDetails,
} from '@/commit/project-commit-preparation-error'
import {
  PROJECT_COMMIT_ORIGIN_KIND,
  type ProjectCommit,
  type ProjectCommandCommitOrigin,
} from '@/commit/project-commit'
import type { ProjectDelta } from '@/commit/project-delta'
import type { MidiNoteRecord } from '@/model/midi-note'
import { nextModelRevision } from '@/model/model-revision'
import { assertCreatedMutationPlan, type MutationPlan } from '@/mutation/mutation-plan'
import type { ProjectMutation } from '@/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE } from '@/mutation/mutation-type'
import { addTicks } from '@/time/tick'

function rejectPreparation(
  code: ProjectCommitPreparationError['code'],
  message: string,
  details: ProjectCommitPreparationErrorDetails = {},
): never {
  throw new ProjectCommitPreparationError(code, message, details)
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
      return rejectPreparation(
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
    rejectPreparation(
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
export function prepareProjectDelta(plan: MutationPlan): ProjectDelta {
  assertCreatedMutationPlan(plan)

  const modelRevision = nextModelRevision(plan.baseRevision)
  const changes = Object.freeze(plan.forward.map(mapMutationToChange))

  return Object.freeze({ modelRevision, changes })
}

/**
 * Builds an immutable candidate before MutationApplier runs. A future Session
 * may publish it only after apply returns the same modelRevision.
 */
export function prepareProjectCommit(command: ProjectCommand, plan: MutationPlan): ProjectCommit {
  assertCreatedMutationPlan(plan)

  const normalizedCommand = normalizeProjectCommand(command)

  if (normalizedCommand.baseRevision !== plan.baseRevision) {
    rejectPreparation(
      'base-revision-mismatch',
      `Command revision ${normalizedCommand.baseRevision} does not match plan revision ${plan.baseRevision}`,
      { commandType: normalizedCommand.type },
    )
  }

  assertCommandPlanCorrespondence(normalizedCommand, plan)

  const delta = prepareProjectDelta(plan)
  const origin = Object.freeze<ProjectCommandCommitOrigin>({
    kind: PROJECT_COMMIT_ORIGIN_KIND.COMMAND,
    commandType: normalizedCommand.type,
  })

  return Object.freeze({
    baseRevision: plan.baseRevision,
    modelRevision: delta.modelRevision,
    origin,
    delta,
  })
}
