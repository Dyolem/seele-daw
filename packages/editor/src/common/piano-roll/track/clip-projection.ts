import {
  addTicks,
  type ClipId,
  type MidiClipRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type ProjectColor,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import {
  createPianoRollClipContext,
  pianoRollSourceTickToClipTick,
  type PianoRollClipContext,
} from '#internal/common/piano-roll/piano-roll-clip-context'

/** One Clip in Track time: where it sits, and the window it shows of its Source. */
export interface PianoRollTrackClipProjection {
  readonly clipId: ClipId
  readonly color: ProjectColor | null
  readonly context: PianoRollClipContext
  readonly endTick: Tick
  readonly muted: boolean
  readonly name: string
  readonly sourceId: MidiSourceId
  readonly spanTick: Tick
  readonly startTick: Tick
  readonly trackId: TrackId
}

/** Projects one Project Clip into its immutable global Track-time window. */
export function createPianoRollTrackClipProjection(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
): PianoRollTrackClipProjection {
  return Object.freeze({
    clipId: clip.id,
    color: clip.color,
    context: createPianoRollClipContext(clip, source),
    endTick: addTicks(clip.startTick, clip.spanTick),
    muted: clip.muted,
    name: clip.name,
    sourceId: clip.sourceId,
    spanTick: clip.spanTick,
    startTick: clip.startTick,
    trackId: clip.trackId,
  })
}

/** Maps a MidiSource endpoint into one Clip's global Project window. */
export function pianoRollTrackSourceTickToProjectTick(
  clip: PianoRollTrackClipProjection,
  sourceTick: Tick,
): Tick {
  return addTicks(clip.startTick, pianoRollSourceTickToClipTick(clip.context, sourceTick))
}
