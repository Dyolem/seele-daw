import {
  PROJECT_COMMAND_TYPE,
  type AddInstrumentTrackCommand,
  type AddMidiClipCommand,
  type AddMidiClipWithNoteCommand,
  type AddNoteCommand,
  type ExtendMidiClipWithNoteCommand,
  type MoveNotesCommand,
  type ProjectCommand,
  type ProjectCommandType,
  type RemoveNotesCommand,
  type ReplaceInstrumentDeviceCommand,
  type ResizeNoteCommand,
} from '#internal/commands/protocol/project-command'
import {
  PROJECT_CHANGE_TYPE,
  type AffectedTickRange,
  type InstrumentDeviceUpdatedChange,
  type InstrumentTrackAddedChange,
  type InstrumentTrackPlacement,
  type InstrumentTrackRemovedChange,
  type MidiClipAddedChange,
  type MidiClipPlacement,
  type MidiClipRemovedChange,
  type MidiClipUpdatedChange,
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
import { createMidiClipRecord, type MidiClipRecord } from '#internal/model/midi-clip'
import { MIDI_PITCH_MAX, MIDI_PITCH_MIN, parseMidiPitch } from '#internal/model/scalars'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import { nextModelRevision } from '#internal/model/model-revision'
import type { InstrumentTrackRecord } from '#internal/model/track'
import { ownPropertiesHaveSameValues } from '#internal/model/value-equality'
import { assertCreatedMutationPlan, type MutationPlan } from '#internal/mutation/mutation-plan'
import type { DeviceReplaceMutation, ProjectMutation } from '#internal/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { addTicks, parseTick } from '#internal/time/tick'

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

function createUpdatedClipRange(before: MidiClipRecord, after: MidiClipRecord): AffectedTickRange {
  const beforeEndTick = addTicks(before.startTick, before.spanTick)
  const afterEndTick = addTicks(after.startTick, after.spanTick)

  return Object.freeze({
    startTick: before.startTick < after.startTick ? before.startTick : after.startTick,
    endTick: beforeEndTick > afterEndTick ? beforeEndTick : afterEndTick,
  })
}

function mapUpdatedInstrumentDevice(
  mutation: DeviceReplaceMutation,
  mutationIndex: number,
): InstrumentDeviceUpdatedChange {
  if (mutation.trackId === undefined) {
    return rejectCandidate(
      'unsupported-mutation-type',
      `Device replacement at index ${mutationIndex} has no Instrument Track ownership`,
      { mutationIndex, mutationType: mutation.type },
    )
  }

  return Object.freeze({
    type: PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED,
    trackId: mutation.trackId,
    deviceId: mutation.after.id,
    before: mutation.before,
    after: mutation.after,
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

type ClipReplaceMutation = Extract<
  ProjectMutation,
  { readonly type: typeof PROJECT_MUTATION_TYPE.CLIP.REPLACE }
>
type MidiSourceReplaceMutation = Extract<
  ProjectMutation,
  { readonly type: typeof PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE }
>

function mapUpdatedMidiClip(
  clipMutation: ClipReplaceMutation,
  sourceMutation: MidiSourceReplaceMutation | null,
  mutationIndex: number,
): MidiClipUpdatedChange {
  if (
    clipMutation.before.trackId !== clipMutation.after.trackId ||
    clipMutation.before.sourceId !== clipMutation.after.sourceId ||
    (sourceMutation !== null &&
      (sourceMutation.before.id !== clipMutation.before.sourceId ||
        sourceMutation.after.id !== clipMutation.after.sourceId))
  ) {
    return rejectCandidate(
      'unsupported-mutation-type',
      `MIDI Clip replacement at index ${mutationIndex} does not preserve its Track and Source ownership`,
      { mutationIndex, mutationType: clipMutation.type },
    )
  }

  return Object.freeze({
    type: PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED,
    clipId: clipMutation.after.id,
    sourceId: clipMutation.after.sourceId,
    trackId: clipMutation.after.trackId,
    affected: createUpdatedClipRange(clipMutation.before, clipMutation.after),
    before: clipMutation.before,
    after: clipMutation.after,
    sourceUpdate:
      sourceMutation === null
        ? null
        : Object.freeze({
            before: sourceMutation.before,
            after: sourceMutation.after,
          }),
  })
}

function createProjectChanges(mutations: readonly ProjectMutation[]): readonly ProjectChange[] {
  const changes: ProjectChange[] = []

  for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
    const mutation = mutations[mutationIndex]!

    switch (mutation.type) {
      case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
        changes.push(mapUpdatedInstrumentDevice(mutation, mutationIndex))
        break

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

      case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE: {
        const clipMutation = mutations[mutationIndex + 1]
        if (clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.REPLACE) {
          return rejectCandidate(
            'unsupported-mutation-type',
            `MIDI Source replacement at index ${mutationIndex} is not followed by its owning MIDI Clip replacement`,
            { mutationIndex, mutationType: mutation.type },
          )
        }
        changes.push(mapUpdatedMidiClip(clipMutation, mutation, mutationIndex))
        mutationIndex += 1
        break
      }

      case PROJECT_MUTATION_TYPE.CLIP.REPLACE: {
        const sourceMutation = mutations[mutationIndex + 1]
        if (sourceMutation?.type === PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE) {
          changes.push(mapUpdatedMidiClip(mutation, sourceMutation, mutationIndex))
          mutationIndex += 1
        } else {
          changes.push(mapUpdatedMidiClip(mutation, null, mutationIndex))
        }
        break
      }

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

function matchesReplacedInstrumentDevice(
  command: ReplaceInstrumentDeviceCommand,
  mutation: ProjectMutation,
): boolean {
  return (
    mutation.type === PROJECT_MUTATION_TYPE.DEVICE.REPLACE &&
    mutation.trackId === command.trackId &&
    mutation.before.id === command.instrumentDevice.id &&
    mutation.after === command.instrumentDevice
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

function matchesAddedMidiClipWithNote(
  command: AddMidiClipWithNoteCommand,
  mutations: readonly ProjectMutation[],
): boolean {
  const sourceMutation = mutations[0]
  const partitionMutation = mutations[1]
  const clipMutation = mutations[2]

  return (
    mutations.length === 3 &&
    sourceMutation?.type === PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT &&
    partitionMutation?.type === PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT &&
    clipMutation?.type === PROJECT_MUTATION_TYPE.CLIP.INSERT &&
    sourceMutation.after === command.source &&
    clipMutation.after === command.clip &&
    partitionMutation.sourceId === command.source.id &&
    partitionMutation.after.length === 1 &&
    partitionMutation.after[0] === command.note &&
    command.clip.sourceId === command.source.id
  )
}

function matchesExtendedMidiClipWithNote(
  command: ExtendMidiClipWithNoteCommand,
  mutations: readonly ProjectMutation[],
): boolean {
  let mutationIndex = 0
  const sourceMutation =
    mutations[mutationIndex]?.type === PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE
      ? (mutations[mutationIndex++] as MidiSourceReplaceMutation)
      : null
  const clipMutation = mutations[mutationIndex++]
  const noteMutation = mutations[mutationIndex++]

  if (
    mutationIndex !== mutations.length ||
    clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.REPLACE ||
    noteMutation?.type !== PROJECT_MUTATION_TYPE.NOTE.INSERT ||
    clipMutation.before.id !== command.clipId ||
    clipMutation.after.id !== command.clipId ||
    clipMutation.before.loop !== null ||
    clipMutation.after.loop !== null ||
    command.spanTick <= clipMutation.before.spanTick ||
    noteMutation.sourceId !== clipMutation.before.sourceId ||
    noteMutation.after !== command.note
  ) {
    return false
  }

  const expectedClip = createMidiClipRecord({
    ...clipMutation.before,
    spanTick: command.spanTick,
  })
  if (!ownPropertiesHaveSameValues(clipMutation.after, expectedClip)) return false

  const currentSourceReadEndTick = addTicks(
    clipMutation.before.sourceOffsetTick,
    clipMutation.before.spanTick,
  )
  const targetSourceReadEndTick = addTicks(
    clipMutation.after.sourceOffsetTick,
    clipMutation.after.spanTick,
  )
  const noteEndTick = addTicks(command.note.startTick, command.note.durationTick)
  if (
    noteEndTick <= currentSourceReadEndTick ||
    command.note.startTick < clipMutation.after.sourceOffsetTick ||
    noteEndTick > targetSourceReadEndTick
  ) {
    return false
  }

  if (sourceMutation === null) return true
  if (
    sourceMutation.before.id !== clipMutation.before.sourceId ||
    sourceMutation.after.id !== clipMutation.after.sourceId ||
    targetSourceReadEndTick <= sourceMutation.before.lengthTick
  ) {
    return false
  }

  const expectedSource = createMidiSourceRecord({
    id: sourceMutation.before.id,
    lengthTick: targetSourceReadEndTick,
  })

  return ownPropertiesHaveSameValues(sourceMutation.after, expectedSource)
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

  return ownPropertiesHaveSameValues(mutation.after, expectedNote)
}

function matchesMovedNotes(
  command: MoveNotesCommand,
  mutations: readonly ProjectMutation[],
): boolean {
  if (
    mutations.length !== command.noteIds.length ||
    (command.deltaTick === 0 && command.deltaPitch === 0)
  ) {
    return false
  }

  return mutations.every((mutation, index) => {
    const noteId = command.noteIds[index]
    if (
      noteId === undefined ||
      mutation.type !== PROJECT_MUTATION_TYPE.NOTE.REPLACE ||
      mutation.sourceId !== command.sourceId ||
      mutation.before.id !== noteId ||
      mutation.after.id !== noteId
    ) {
      return false
    }

    const nextStartTick = mutation.before.startTick + command.deltaTick
    const nextPitch = mutation.before.pitch + command.deltaPitch
    if (
      !Number.isSafeInteger(nextStartTick) ||
      nextStartTick < 0 ||
      nextPitch < MIDI_PITCH_MIN ||
      nextPitch > MIDI_PITCH_MAX
    ) {
      return false
    }

    const expectedAfter = createMidiNoteRecord({
      ...mutation.before,
      startTick: parseTick(nextStartTick),
      pitch: parseMidiPitch(nextPitch),
    })

    return ownPropertiesHaveSameValues(mutation.after, expectedAfter)
  })
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

function matchesResizedNote(command: ResizeNoteCommand, mutation: ProjectMutation): boolean {
  if (
    mutation.type !== PROJECT_MUTATION_TYPE.NOTE.REPLACE ||
    mutation.sourceId !== command.sourceId ||
    mutation.before.id !== command.noteId ||
    mutation.after.id !== command.noteId ||
    (mutation.before.startTick === command.startTick &&
      mutation.before.durationTick === command.durationTick)
  ) {
    return false
  }

  const expectedAfter = createMidiNoteRecord({
    ...mutation.before,
    startTick: command.startTick,
    durationTick: command.durationTick,
  })

  return ownPropertiesHaveSameValues(mutation.after, expectedAfter)
}

function assertCommandPlanCorrespondence(command: ProjectCommand, plan: MutationPlan): void {
  const mutation = plan.forward[0]
  let matches = false

  if (command.type === PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE) {
    matches =
      plan.forward.length === 1 &&
      mutation !== undefined &&
      matchesReplacedInstrumentDevice(command, mutation)
  } else if (command.type === PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD) {
    matches = matchesAddedInstrumentTrack(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD) {
    matches = matchesAddedMidiClip(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE) {
    matches = matchesAddedMidiClipWithNote(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE) {
    matches = matchesExtendedMidiClipWithNote(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE) {
    matches = matchesRemovedNotes(command, plan.forward)
  } else if (command.type === PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE) {
    matches = matchesMovedNotes(command, plan.forward)
  } else if (plan.forward.length === 1 && mutation !== undefined) {
    switch (command.type) {
      case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
        matches = matchesAddedNote(command, mutation)
        break
      case PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE:
        matches = matchesResizedNote(command, mutation)
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
