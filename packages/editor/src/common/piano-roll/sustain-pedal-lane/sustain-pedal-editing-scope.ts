import {
  ZERO_TICK,
  type ClipId,
  type MidiChannel,
  type MidiSourceId,
  type ModelRevision,
  type ProjectId,
  type Tick,
} from '@seele-daw/project-core'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'
import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'
import type {
  PianoRollSustainPedalClipLaneReadModel,
  PianoRollSustainPedalLaneEventProjection,
  PianoRollTrackSustainPedalLaneReadModel,
} from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-lane-read-model'
import { PIANO_ROLL_TRACK_CLIP_STATUS } from '#internal/common/piano-roll/track/clip-projection'

export interface PianoRollSustainPedalEditingScope {
  readonly channel: MidiChannel
  readonly clipId: ClipId
  readonly context: PianoRollClipContext
  readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly modelRevision: ModelRevision
  readonly projectId: ProjectId
  readonly sourceId: MidiSourceId
  readonly timelineEndTick: Tick
  readonly timelineStartTick: Tick
}

export type ResolvePianoRollSustainPedalEditingScopeInput =
  | {
      readonly context: PianoRollClipContext
      readonly readModel: PianoRollSustainPedalClipLaneReadModel
    }
  | {
      readonly readModel: PianoRollTrackSustainPedalLaneReadModel
    }

function createEditingScope(input: {
  readonly channel: MidiChannel
  readonly context: PianoRollClipContext
  readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly modelRevision: ModelRevision
  readonly projectId: ProjectId
  readonly timelineEndTick: Tick
  readonly timelineStartTick: Tick
}): PianoRollSustainPedalEditingScope {
  return Object.freeze({
    ...input,
    events: Object.freeze([...input.events]),
    clipId: input.context.clipId,
    sourceId: input.context.sourceId,
  })
}

function resolveClipEditingScope(
  input: Extract<ResolvePianoRollSustainPedalEditingScopeInput, { readonly context: unknown }>,
): PianoRollSustainPedalEditingScope {
  const { context, readModel } = input
  if (readModel.clipId !== context.clipId || readModel.sourceId !== context.sourceId) {
    throw new PianoRollError(
      'invalid-sustain-pedal-editing-scope',
      'The Sustain Pedal Clip Lane does not match its editable Clip context',
    )
  }

  return createEditingScope({
    channel: readModel.channel,
    context,
    events: readModel.events,
    modelRevision: readModel.modelRevision,
    projectId: readModel.projectId,
    timelineEndTick: context.clipSpanTick,
    timelineStartTick: ZERO_TICK,
  })
}

function resolveTrackEditingScope(
  readModel: PianoRollTrackSustainPedalLaneReadModel,
): PianoRollSustainPedalEditingScope | null {
  if (readModel.activeClipId === null) return null

  const activeClip = readModel.clips.find(({ clip }) => clip.clipId === readModel.activeClipId)
  if (activeClip === undefined || activeClip.clip.status !== PIANO_ROLL_TRACK_CLIP_STATUS.READY) {
    return null
  }

  return createEditingScope({
    channel: readModel.channel,
    context: activeClip.clip.context,
    events: activeClip.events,
    modelRevision: readModel.modelRevision,
    projectId: readModel.projectId,
    timelineEndTick: activeClip.clip.endTick,
    timelineStartTick: activeClip.clip.startTick,
  })
}

/** Resolves the one non-looped Clip whose CC64 facts an Editor gesture may mutate. */
export function resolvePianoRollSustainPedalEditingScope(
  input: ResolvePianoRollSustainPedalEditingScopeInput,
): PianoRollSustainPedalEditingScope | null {
  if ('context' in input) return resolveClipEditingScope(input)
  return resolveTrackEditingScope(input.readModel)
}
