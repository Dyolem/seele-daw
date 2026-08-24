import {
  TEMPO_BPM_MAX,
  TEMPO_BPM_MIN,
  parseTempoBpm,
  parseTick,
  type TempoBpm,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import { resolveProjectSecondAtTick } from '@seele-daw/playback'

import { roundProjectTempoBpmForEditing } from '@/features/project-workspace/tempo/tempo-control'
import {
  describeProjectTimelineMusicalPosition,
  formatProjectTimelineMusicalPosition,
  formatProjectTimelineTime,
} from '@/features/project-workspace/timeline/presentation'

export const PROJECT_TEMPO_TRACK_DEFAULT_VISIBLE_MINIMUM_BPM = 40
export const PROJECT_TEMPO_TRACK_DEFAULT_VISIBLE_MAXIMUM_BPM = 240
export const PROJECT_TEMPO_TRACK_VISIBLE_SCALE_PADDING_BPM = 20
export const PROJECT_TEMPO_TRACK_DRAG_THRESHOLD_PX = 4

export interface ProjectTempoTrackScale {
  readonly maximumBpm: number
  readonly minimumBpm: number
}

export interface ProjectTempoEventLocationPresentation {
  readonly musicalPosition: string
  readonly projectTime: string
  readonly title: string
}

export type ProjectTempoEventNavigationDirection = 'next' | 'previous'

interface CreateProjectTempoEventLocationPresentationInput {
  readonly barSpanTick: Tick
  readonly tempoEvent: TempoEventRecord
  readonly tempoEvents: readonly TempoEventRecord[]
  readonly timeSignatureNumerator: number
}

export const PROJECT_TEMPO_TRACK_DEFAULT_VISIBLE_SCALE = Object.freeze<ProjectTempoTrackScale>({
  maximumBpm: PROJECT_TEMPO_TRACK_DEFAULT_VISIBLE_MAXIMUM_BPM,
  minimumBpm: PROJECT_TEMPO_TRACK_DEFAULT_VISIBLE_MINIMUM_BPM,
})

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

/** Projects a selected Tempo Event through the Arrangement grid and Playback's precise TempoMap. */
export function createProjectTempoEventLocationPresentation(
  input: CreateProjectTempoEventLocationPresentationInput,
): ProjectTempoEventLocationPresentation {
  const positionInput = {
    barSpanTick: input.barSpanTick,
    tick: input.tempoEvent.tick,
    timeSignatureNumerator: input.timeSignatureNumerator,
  }
  const projectTime = formatProjectTimelineTime(
    resolveProjectSecondAtTick(input.tempoEvents, input.tempoEvent.tick),
  )

  return Object.freeze({
    musicalPosition: formatProjectTimelineMusicalPosition(positionInput),
    projectTime,
    title: `${describeProjectTimelineMusicalPosition(positionInput)}; Project time ${projectTime}`,
  })
}

/** Creates the transient view scale for a Project without treating presentation as a Project fact. */
export function createInitialProjectTempoTrackScale(
  tempoEvents: readonly TempoEventRecord[],
): ProjectTempoTrackScale {
  return expandProjectTempoTrackScale(PROJECT_TEMPO_TRACK_DEFAULT_VISIBLE_SCALE, tempoEvents)
}

/** Expands an existing view to reveal new facts without contracting or moving the current scale. */
export function expandProjectTempoTrackScale(
  scale: ProjectTempoTrackScale,
  tempoEvents: readonly TempoEventRecord[],
): ProjectTempoTrackScale {
  let nextMinimum = scale.minimumBpm
  let nextMaximum = scale.maximumBpm

  for (const tempoEvent of tempoEvents) {
    if (tempoEvent.bpm < nextMinimum) {
      nextMinimum = Math.max(
        TEMPO_BPM_MIN,
        Math.floor(tempoEvent.bpm - PROJECT_TEMPO_TRACK_VISIBLE_SCALE_PADDING_BPM),
      )
    }
    if (tempoEvent.bpm > nextMaximum) {
      nextMaximum = Math.min(
        TEMPO_BPM_MAX,
        Math.ceil(tempoEvent.bpm + PROJECT_TEMPO_TRACK_VISIBLE_SCALE_PADDING_BPM),
      )
    }
  }

  if (nextMinimum === scale.minimumBpm && nextMaximum === scale.maximumBpm) return scale

  return Object.freeze({
    maximumBpm: nextMaximum,
    minimumBpm: nextMinimum,
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
  return parseTempoBpm(roundProjectTempoBpmForEditing(input.scale.maximumBpm - ratio * span))
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
  return parseTempoBpm(
    roundProjectTempoBpmForEditing(Math.min(TEMPO_BPM_MAX, Math.max(TEMPO_BPM_MIN, bpm))),
  )
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
