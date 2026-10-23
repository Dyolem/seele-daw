import {
  type ProjectCommand,
  type ProjectCommandType,
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
  type MidiSustainPedalEventAddedChange,
  type MidiSustainPedalEventRemovedChange,
  type MidiSustainPedalEventUpdatedChange,
  type ProjectChange,
  type TempoEventAddedChange,
  type TempoEventRemovedChange,
  type TempoEventUpdatedChange,
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
import { type MidiNoteRecord } from '#internal/model/midi-note'
import { type MidiClipRecord } from '#internal/model/midi-clip'
import { type MidiSourceRecord } from '#internal/model/midi-source'
import { type MidiSustainPedalEventRecord } from '#internal/model/midi-sustain-pedal-event'
import { nextModelRevision } from '#internal/model/model-revision'
import type { InstrumentTrackRecord } from '#internal/model/track'
import { assertCreatedMutationPlan, type MutationPlan } from '#internal/mutation/mutation-plan'
import type {
  DeviceReplaceMutation,
  ProjectMutation,
  TempoEventMutation,
} from '#internal/mutation/project-mutation'
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
  sustainPedalEvents: readonly MidiSustainPedalEventRecord[],
): MidiClipPlacement {
  return Object.freeze({ clip, source, notes, sustainPedalEvents })
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

function mapTempoEventMutationToChange(mutation: TempoEventMutation): ProjectChange {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
      return Object.freeze<TempoEventAddedChange>({
        type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED,
        tempoEventId: mutation.after.id,
        after: mutation.after,
      })
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
      return Object.freeze<TempoEventRemovedChange>({
        type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.REMOVED,
        tempoEventId: mutation.before.id,
        before: mutation.before,
      })
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
      return Object.freeze<TempoEventUpdatedChange>({
        type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.UPDATED,
        tempoEventId: mutation.after.id,
        before: mutation.before,
        after: mutation.after,
      })
  }
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

function mapSustainPedalEventMutationToChange(
  mutation: ProjectMutation,
  mutationIndex: number,
): ProjectChange {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.INSERT:
      return Object.freeze<MidiSustainPedalEventAddedChange>({
        type: PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADDED,
        sourceId: mutation.sourceId,
        sustainPedalEventId: mutation.after.id,
        affectedFromTick: mutation.after.tick,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE:
      return Object.freeze<MidiSustainPedalEventRemovedChange>({
        type: PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVED,
        sourceId: mutation.sourceId,
        sustainPedalEventId: mutation.before.id,
        affectedFromTick: mutation.before.tick,
        before: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE:
      return Object.freeze<MidiSustainPedalEventUpdatedChange>({
        type: PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.UPDATED,
        sourceId: mutation.sourceId,
        sustainPedalEventId: mutation.after.id,
        affectedFromTick:
          mutation.before.tick < mutation.after.tick ? mutation.before.tick : mutation.after.tick,
        before: mutation.before,
        after: mutation.after,
      })

    default:
      return rejectCandidate(
        'unsupported-mutation-type',
        `Mutation ${mutation.type} at index ${mutationIndex} does not have Sustain Pedal ProjectDelta semantics`,
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
  const notePartitionMutation = mutations[mutationIndex + 1]
  const sustainPedalEventPartitionMutation = mutations[mutationIndex + 2]
  const clipMutation = mutations[mutationIndex + 3]

  if (
    sourceMutation?.type !== PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT ||
    notePartitionMutation?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT ||
    sustainPedalEventPartitionMutation?.type !==
      PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION.INSERT ||
    clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.INSERT ||
    notePartitionMutation.sourceId !== sourceMutation.after.id ||
    sustainPedalEventPartitionMutation.sourceId !== sourceMutation.after.id ||
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
    after: createMidiClipPlacement(
      clip,
      sourceMutation.after,
      notePartitionMutation.after,
      sustainPedalEventPartitionMutation.after,
    ),
  })
}

function mapRemovedMidiClip(
  mutations: readonly ProjectMutation[],
  mutationIndex: number,
): MidiClipRemovedChange {
  const clipMutation = mutations[mutationIndex]
  const sustainPedalEventPartitionMutation = mutations[mutationIndex + 1]
  const notePartitionMutation = mutations[mutationIndex + 2]
  const sourceMutation = mutations[mutationIndex + 3]

  if (
    clipMutation?.type !== PROJECT_MUTATION_TYPE.CLIP.REMOVE ||
    sustainPedalEventPartitionMutation?.type !==
      PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION.REMOVE ||
    notePartitionMutation?.type !== PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE ||
    sourceMutation?.type !== PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE ||
    sustainPedalEventPartitionMutation.sourceId !== sourceMutation.before.id ||
    notePartitionMutation.sourceId !== sourceMutation.before.id ||
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
    before: createMidiClipPlacement(
      clip,
      sourceMutation.before,
      notePartitionMutation.before,
      sustainPedalEventPartitionMutation.before,
    ),
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
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
      case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
        changes.push(mapTempoEventMutationToChange(mutation))
        break

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
        mutationIndex += 3
        break

      case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
        changes.push(mapRemovedMidiClip(mutations, mutationIndex))
        mutationIndex += 3
        break

      case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.INSERT:
      case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE:
      case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE:
        changes.push(mapSustainPedalEventMutationToChange(mutation, mutationIndex))
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
 * Builds an immutable candidate before MutationApplier runs. The Command must be the normalized
 * instance returned beside this plan by prepareProjectCommand; its type labels the commit, while
 * consumers read what changed from the Delta. command-properties.spec pins every command's plan.
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
