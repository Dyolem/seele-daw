import {
  PROJECT_COMMAND_TYPE,
  type AddInstrumentTrackCommand,
  type AddMidiClipCommand,
  type AddNoteCommand,
  type MoveNoteCommand,
  type ProjectCommand,
  type ProjectCommandType,
  type RemoveNoteCommand,
  type RemoveNotesCommand,
} from '#internal/commands/project-command'
import {
  PROJECT_CHANGE_TYPE,
  type AffectedTickRange,
  type InstrumentTrackAddedChange,
  type InstrumentTrackPlacement,
  type InstrumentTrackRemovedChange,
  type MidiClipAddedChange,
  type MidiClipPlacement,
  type MidiClipRemovedChange,
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
import { createMidiNoteRecord, type MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiClipRecord } from '#internal/model/midi-clip'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import { nextModelRevision } from '#internal/model/model-revision'
import type { InstrumentTrackRecord } from '#internal/model/track'
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

function createInstrumentTrackPlacement(
  track: InstrumentTrackRecord,
  instrumentDevice: InstrumentTrackPlacement['instrumentDevice'],
  index: number,
): InstrumentTrackPlacement {
  return Object.freeze({ track, instrumentDevice, index })
}

function createMidiClipPlacement(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
  notes: readonly MidiNoteRecord[],
): MidiClipPlacement {
  return Object.freeze({ clip, source, notes })
}

function createClipRange(clip: MidiClipRecord): AffectedTickRange {
  return Object.freeze({
    startTick: clip.startTick,
    endTick: addTicks(clip.startTick, clip.spanTick),
  })
}

function mapNoteMutationToChange(mutation: ProjectMutation, mutationIndex: number): ProjectChange {
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

function mapAddedInstrumentTrack(
  mutations: readonly ProjectMutation[],
  mutationIndex: number,
): InstrumentTrackAddedChange {
  const deviceMutation = mutations[mutationIndex]
  const trackMutation = mutations[mutationIndex + 1]
  const orderMutation = mutations[mutationIndex + 2]

  if (
    deviceMutation?.type !== PROJECT_MUTATION_TYPE.DEVICE.INSERT ||
    trackMutation?.type !== PROJECT_MUTATION_TYPE.TRACK.INSERT ||
    trackMutation.after.kind !== 'instrument' ||
    orderMutation?.type !== PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT ||
    trackMutation.after.instrumentDeviceId !== deviceMutation.after.id ||
    orderMutation.trackId !== trackMutation.after.id
  ) {
    return rejectCandidate(
      'unsupported-mutation-type',
      `Mutation ${String(deviceMutation?.type)} at index ${mutationIndex} does not begin a complete Instrument Track insertion`,
      { mutationIndex, mutationType: deviceMutation?.type },
    )
  }

  return Object.freeze({
    type: PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED,
    trackId: trackMutation.after.id,
    after: createInstrumentTrackPlacement(
      trackMutation.after,
      deviceMutation.after,
      orderMutation.index,
    ),
  })
}

function mapRemovedInstrumentTrack(
  mutations: readonly ProjectMutation[],
  mutationIndex: number,
): InstrumentTrackRemovedChange {
  const orderMutation = mutations[mutationIndex]
  const trackMutation = mutations[mutationIndex + 1]
  const deviceMutation = mutations[mutationIndex + 2]

  if (
    orderMutation?.type !== PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE ||
    trackMutation?.type !== PROJECT_MUTATION_TYPE.TRACK.REMOVE ||
    trackMutation.before.kind !== 'instrument' ||
    deviceMutation?.type !== PROJECT_MUTATION_TYPE.DEVICE.REMOVE ||
    orderMutation.trackId !== trackMutation.before.id ||
    trackMutation.before.instrumentDeviceId !== deviceMutation.before.id
  ) {
    return rejectCandidate(
      'unsupported-mutation-type',
      `Mutation ${String(orderMutation?.type)} at index ${mutationIndex} does not begin a complete Instrument Track removal`,
      { mutationIndex, mutationType: orderMutation?.type },
    )
  }

  return Object.freeze({
    type: PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED,
    trackId: trackMutation.before.id,
    before: createInstrumentTrackPlacement(
      trackMutation.before,
      deviceMutation.before,
      orderMutation.index,
    ),
  })
}

function mapAddedMidiClip(
  mutations: readonly ProjectMutation[],
  mutationIndex: number,
): MidiClipAddedChange {
  const sourceMutation = mutations[mutationIndex]
  const partitionMutation = mutations[mutationIndex + 1]
  const clipMutation = mutations[mutationIndex + 2]

  if (
    sourceMutation?.type !== PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT ||
    partitionMutation?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT ||
    clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.INSERT ||
    partitionMutation.sourceId !== sourceMutation.after.id ||
    clipMutation.after.sourceId !== sourceMutation.after.id
  ) {
    return rejectCandidate(
      'unsupported-mutation-type',
      `Mutation ${String(sourceMutation?.type)} at index ${mutationIndex} does not begin a complete MIDI Clip insertion`,
      { mutationIndex, mutationType: sourceMutation?.type },
    )
  }

  const clip = clipMutation.after

  return Object.freeze({
    type: PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED,
    clipId: clip.id,
    sourceId: sourceMutation.after.id,
    trackId: clip.trackId,
    affected: createClipRange(clip),
    after: createMidiClipPlacement(clip, sourceMutation.after, partitionMutation.after),
  })
}

function mapRemovedMidiClip(
  mutations: readonly ProjectMutation[],
  mutationIndex: number,
): MidiClipRemovedChange {
  const clipMutation = mutations[mutationIndex]
  const partitionMutation = mutations[mutationIndex + 1]
  const sourceMutation = mutations[mutationIndex + 2]

  if (
    clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.REMOVE ||
    partitionMutation?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE ||
    sourceMutation?.type !== PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE ||
    partitionMutation.sourceId !== sourceMutation.before.id ||
    clipMutation.before.sourceId !== sourceMutation.before.id
  ) {
    return rejectCandidate(
      'unsupported-mutation-type',
      `Mutation ${String(clipMutation?.type)} at index ${mutationIndex} does not begin a complete MIDI Clip removal`,
      { mutationIndex, mutationType: clipMutation?.type },
    )
  }

  const clip = clipMutation.before

  return Object.freeze({
    type: PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED,
    clipId: clip.id,
    sourceId: sourceMutation.before.id,
    trackId: clip.trackId,
    affected: createClipRange(clip),
    before: createMidiClipPlacement(clip, sourceMutation.before, partitionMutation.before),
  })
}

function createProjectChanges(mutations: readonly ProjectMutation[]): readonly ProjectChange[] {
  const changes: ProjectChange[] = []

  for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
    const mutation = mutations[mutationIndex]!

    switch (mutation.type) {
      case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
        changes.push(mapAddedInstrumentTrack(mutations, mutationIndex))
        mutationIndex += 2
        break

      case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
        changes.push(mapRemovedInstrumentTrack(mutations, mutationIndex))
        mutationIndex += 2
        break

      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
        changes.push(mapAddedMidiClip(mutations, mutationIndex))
        mutationIndex += 2
        break

      case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
        changes.push(mapRemovedMidiClip(mutations, mutationIndex))
        mutationIndex += 2
        break

      default:
        changes.push(mapNoteMutationToChange(mutation, mutationIndex))
        break
    }
  }

  return Object.freeze(changes)
}

function matchesAddedInstrumentTrack(
  command: AddInstrumentTrackCommand,
  mutations: readonly ProjectMutation[],
): boolean {
  const deviceMutation = mutations[0]
  const trackMutation = mutations[1]
  const orderMutation = mutations[2]

  if (
    mutations.length !== 3 ||
    deviceMutation?.type !== PROJECT_MUTATION_TYPE.DEVICE.INSERT ||
    trackMutation?.type !== PROJECT_MUTATION_TYPE.TRACK.INSERT ||
    trackMutation.after.kind !== 'instrument' ||
    orderMutation?.type !== PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT
  ) {
    return false
  }

  return (
    trackMutation.after === command.track &&
    deviceMutation.after === command.instrumentDevice &&
    trackMutation.after.instrumentDeviceId === deviceMutation.after.id &&
    orderMutation.trackId === trackMutation.after.id &&
    orderMutation.index === command.insertAt
  )
}

function matchesAddedMidiClip(
  command: AddMidiClipCommand,
  mutations: readonly ProjectMutation[],
): boolean {
  const sourceMutation = mutations[0]
  const partitionMutation = mutations[1]
  const clipMutation = mutations[2]

  if (
    mutations.length !== 3 ||
    sourceMutation?.type !== PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT ||
    partitionMutation?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT ||
    clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.INSERT
  ) {
    return false
  }

  return (
    sourceMutation.after === command.source &&
    clipMutation.after === command.clip &&
    partitionMutation.sourceId === sourceMutation.after.id &&
    partitionMutation.after.length === 0 &&
    clipMutation.after.sourceId === sourceMutation.after.id
  )
}

function recordsHaveSameOwnValues(left: object, right: object): boolean {
  const leftKeys = Reflect.ownKeys(left)
  const rightKeys = Reflect.ownKeys(right)

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        Object.is(Reflect.get(left, key), Reflect.get(right, key)),
    )
  )
}

function matchesAddedNote(command: AddNoteCommand, mutation: ProjectMutation): boolean {
  if (
    mutation.type !== PROJECT_MUTATION_TYPE.NOTE.INSERT ||
    mutation.sourceId !== command.sourceId
  ) {
    return false
  }

  const expectedNote = createMidiNoteRecord({
    id: command.noteId,
    startTick: command.startTick,
    durationTick: command.durationTick,
    pitch: command.pitch,
    velocity: command.velocity,
    channel: command.channel,
  })

  return recordsHaveSameOwnValues(mutation.after, expectedNote)
}

function matchesMovedNote(command: MoveNoteCommand, mutation: ProjectMutation): boolean {
  if (
    mutation.type !== PROJECT_MUTATION_TYPE.NOTE.REPLACE ||
    mutation.sourceId !== command.sourceId ||
    mutation.before.id !== command.noteId ||
    mutation.after.id !== command.noteId ||
    (mutation.before.startTick === command.nextStartTick &&
      mutation.before.pitch === command.nextPitch)
  ) {
    return false
  }

  const expectedAfter = createMidiNoteRecord({
    ...mutation.before,
    startTick: command.nextStartTick,
    pitch: command.nextPitch,
  })

  return recordsHaveSameOwnValues(mutation.after, expectedAfter)
}

function matchesRemovedNote(command: RemoveNoteCommand, mutation: ProjectMutation): boolean {
  return (
    mutation.type === PROJECT_MUTATION_TYPE.NOTE.REMOVE &&
    mutation.sourceId === command.sourceId &&
    mutation.before.id === command.noteId
  )
}

function matchesRemovedNotes(
  command: RemoveNotesCommand,
  mutations: readonly ProjectMutation[],
): boolean {
  return (
    mutations.length === command.noteIds.length &&
    mutations.every((mutation, index) => {
      const noteId = command.noteIds[index]
      return (
        noteId !== undefined &&
        mutation.type === PROJECT_MUTATION_TYPE.NOTE.REMOVE &&
        mutation.sourceId === command.sourceId &&
        mutation.before.id === noteId
      )
    })
  )
}

function assertCommandPlanCorrespondence(command: ProjectCommand, plan: MutationPlan): void {
  const mutation = plan.forward[0]
  let matches = false

  if (command.type === PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD) {
    matches = matchesAddedInstrumentTrack(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD) {
    matches = matchesAddedMidiClip(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE_MANY) {
    matches = matchesRemovedNotes(command, plan.forward)
  } else if (plan.forward.length === 1 && mutation !== undefined) {
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
  const changes = createProjectChanges(plan.forward)

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
 * Builds an immutable candidate before MutationApplier runs. The Command must
 * be the normalized instance returned beside this plan by prepareProjectCommand;
 * aggregate Record references are part of their correspondence contract.
 */
export function createProjectCommitCandidate(
  normalizedCommand: ProjectCommand,
  plan: MutationPlan,
): ProjectCommit {
  assertCreatedMutationPlan(plan)

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
