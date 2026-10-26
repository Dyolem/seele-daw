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

export const PIANO_ROLL_TRACK_CLIP_STATUS = Object.freeze({
  READY: 'ready',
  UNSUPPORTED: 'unsupported',
} as const)

interface PianoRollTrackClipProjectionBase {
  readonly clipId: ClipId
  readonly color: ProjectColor | null
  readonly endTick: Tick
  readonly muted: boolean
  readonly name: string
  readonly sourceId: MidiSourceId
  readonly spanTick: Tick
  readonly startTick: Tick
  readonly trackId: TrackId
}

export interface ReadyPianoRollTrackClipProjection extends PianoRollTrackClipProjectionBase {
  readonly context: PianoRollClipContext
  readonly status: typeof PIANO_ROLL_TRACK_CLIP_STATUS.READY
}

export interface UnsupportedPianoRollTrackClipProjection extends PianoRollTrackClipProjectionBase {
  readonly reason: 'looped-clip'
  readonly status: typeof PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED
}

export type PianoRollTrackClipProjection =
  | ReadyPianoRollTrackClipProjection
  | UnsupportedPianoRollTrackClipProjection

/** Projects one Project Clip into its immutable global Track-time window. */
export function createPianoRollTrackClipProjection(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
): PianoRollTrackClipProjection {
  const base = Object.freeze({
    clipId: clip.id,
    color: clip.color,
    endTick: addTicks(clip.startTick, clip.spanTick),
    muted: clip.muted,
    name: clip.name,
    sourceId: clip.sourceId,
    spanTick: clip.spanTick,
    startTick: clip.startTick,
    trackId: clip.trackId,
  })

  const context = createPianoRollClipContext(clip, source)
  if (context === null) {
    return Object.freeze({
      ...base,
      reason: 'looped-clip',
      status: PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED,
    })
  }
  return Object.freeze({ ...base, context, status: PIANO_ROLL_TRACK_CLIP_STATUS.READY })
}

/** Maps a MidiSource endpoint into one ready Clip's global Project window. */
export function pianoRollTrackSourceTickToProjectTick(
  clip: ReadyPianoRollTrackClipProjection,
  sourceTick: Tick,
): Tick {
  return addTicks(clip.startTick, pianoRollSourceTickToClipTick(clip.context, sourceTick))
}
