import {
  TEMPO_BPM_MAX,
  TEMPO_BPM_MIN,
  parseTempoBpm,
  parseTick,
  type TempoBpm,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'

const DEFAULT_VISIBLE_MINIMUM_BPM = 40
const DEFAULT_VISIBLE_MAXIMUM_BPM = 240
const SCALE_PADDING_BPM = 20
export const PROJECT_TEMPO_TRACK_DRAG_THRESHOLD_PX = 4

export interface ProjectTempoTrackScale {
  readonly maximumBpm: number
  readonly minimumBpm: number
}

export type ProjectTempoTrackDragAxis = 'blocked-tick' | 'bpm' | 'tick'

export interface ResolveProjectTempoTrackTickInput {
  readonly clientX: number
  readonly laneLeft: number
  readonly laneWidth: number
  readonly timelineEndTick: Tick
}

export interface ResolveProjectTempoTrackBpmInput {
  readonly clientY: number
  readonly laneHeight: number
  readonly laneTop: number
  readonly scale: ProjectTempoTrackScale
}

export interface ResolveDraggedProjectTempoBpmInput {
  readonly currentClientY: number
  readonly laneHeight: number
  readonly scale: ProjectTempoTrackScale
  readonly startBpm: TempoBpm
  readonly startClientY: number
}

/** Orders the immutable Project facts for deterministic step-line and keyboard presentation. */
export function orderProjectTempoEvents(
  tempoEvents: readonly TempoEventRecord[],
): readonly TempoEventRecord[] {
  return Object.freeze(
    [...tempoEvents].sort((left, right) => {
      if (left.tick !== right.tick) return left.tick - right.tick
      if (left.id < right.id) return -1
      if (left.id > right.id) return 1
      return 0
    }),
  )
}

/** Keeps ordinary musical tempos legible while expanding to include valid extreme Project facts. */
export function deriveProjectTempoTrackScale(
  tempoEvents: readonly TempoEventRecord[],
): ProjectTempoTrackScale {
  let observedMinimum = DEFAULT_VISIBLE_MINIMUM_BPM
  let observedMaximum = DEFAULT_VISIBLE_MAXIMUM_BPM

  for (const tempoEvent of tempoEvents) {
    observedMinimum = Math.min(observedMinimum, tempoEvent.bpm - SCALE_PADDING_BPM)
    observedMaximum = Math.max(observedMaximum, tempoEvent.bpm + SCALE_PADDING_BPM)
  }

  return Object.freeze({
    maximumBpm: Math.min(TEMPO_BPM_MAX, Math.ceil(observedMaximum)),
    minimumBpm: Math.max(TEMPO_BPM_MIN, Math.floor(observedMinimum)),
  })
}

export function projectTempoTrackBpmPositionRatio(
  bpm: number,
  scale: ProjectTempoTrackScale,
): number {
  const span = scale.maximumBpm - scale.minimumBpm
  if (!Number.isFinite(bpm) || !Number.isFinite(span) || span <= 0) return 0
  return Math.min(1, Math.max(0, (scale.maximumBpm - bpm) / span))
}

/** Maps a Tempo lane x-coordinate to the nearest integer Project Tick without musical snapping. */
export function resolveProjectTempoTrackTick(input: ResolveProjectTempoTrackTickInput): Tick {
  if (
    !Number.isFinite(input.clientX) ||
    !Number.isFinite(input.laneLeft) ||
    !Number.isFinite(input.laneWidth) ||
    input.laneWidth <= 0
  ) {
    return parseTick(0)
  }

  const ratio = Math.min(1, Math.max(0, (input.clientX - input.laneLeft) / input.laneWidth))
  return parseTick(Math.round(ratio * input.timelineEndTick))
}

/** Maps a Tempo lane y-coordinate through the current visible scale at two-decimal UI precision. */
export function resolveProjectTempoTrackBpm(input: ResolveProjectTempoTrackBpmInput): TempoBpm {
  const span = input.scale.maximumBpm - input.scale.minimumBpm
  if (
    !Number.isFinite(input.clientY) ||
    !Number.isFinite(input.laneHeight) ||
    !Number.isFinite(input.laneTop) ||
    input.laneHeight <= 0 ||
    span <= 0
  ) {
    return parseTempoBpm(input.scale.minimumBpm)
  }

  const ratio = Math.min(1, Math.max(0, (input.clientY - input.laneTop) / input.laneHeight))
  return parseTempoBpm(roundTempoTrackBpm(input.scale.maximumBpm - ratio * span))
}

/** Applies vertical pointer delta without making an off-center grab jump to a new BPM. */
export function resolveDraggedProjectTempoBpm(input: ResolveDraggedProjectTempoBpmInput): TempoBpm {
  const span = input.scale.maximumBpm - input.scale.minimumBpm
  if (
    !Number.isFinite(input.currentClientY) ||
    !Number.isFinite(input.laneHeight) ||
    !Number.isFinite(input.startClientY) ||
    input.laneHeight <= 0 ||
    span <= 0
  ) {
    return parseTempoBpm(input.startBpm)
  }

  const bpm =
    input.startBpm + ((input.startClientY - input.currentClientY) / input.laneHeight) * span
  return parseTempoBpm(roundTempoTrackBpm(Math.min(TEMPO_BPM_MAX, Math.max(TEMPO_BPM_MIN, bpm))))
}

/** Locks a point gesture to its dominant axis after a small click-tolerance threshold. */
export function resolveProjectTempoTrackDragAxis(
  deltaX: number,
  deltaY: number,
  canMoveTick: boolean,
): ProjectTempoTrackDragAxis | null {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < PROJECT_TEMPO_TRACK_DRAG_THRESHOLD_PX) {
    return null
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) return canMoveTick ? 'tick' : 'blocked-tick'
  return 'bpm'
}

function roundTempoTrackBpm(bpm: number): number {
  return Math.round(bpm * 100) / 100
}
