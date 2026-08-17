import { parsePositiveTick, parseTick, type Tick } from '@seele-daw/project-core'

import { TimelineGridError } from './timeline-grid-error'

export interface TimelineGrid {
  readonly originTick: Tick
  readonly subdivisionSpanTick: Tick
}

export interface CreateTimelineGridInput {
  readonly originTick: Tick
  readonly subdivisionSpanTick: Tick
}

export const TIMELINE_GRID_SNAP_MODE = {
  FLOOR: 'floor',
  NEAREST: 'nearest',
} as const

export type TimelineGridSnapMode =
  (typeof TIMELINE_GRID_SNAP_MODE)[keyof typeof TIMELINE_GRID_SNAP_MODE]

export interface ResolveTimelineGridTickInput {
  readonly grid: TimelineGrid
  readonly snapEnabled: boolean
  readonly snapMode?: TimelineGridSnapMode
  readonly tickPosition: number
}

function requireTickPosition(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new TimelineGridError(
      'invalid-tick-position',
      'Timeline Grid Tick position must be a finite non-negative safe number',
    )
  }
  return value
}

function parseResolvedTick(value: number): Tick {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TimelineGridError(
      'resolved-tick-out-of-range',
      'Timeline Grid resolved a Tick outside the non-negative safe integer range',
    )
  }
  return parseTick(value)
}

/** Creates the immutable time grid shared by visible divisions and interactions. */
export function createTimelineGrid(input: CreateTimelineGridInput): TimelineGrid {
  return Object.freeze({
    originTick: parseTick(input.originTick),
    subdivisionSpanTick: parsePositiveTick(input.subdivisionSpanTick),
  })
}

/**
 * Resolves a continuous Timeline position to an integer Tick.
 *
 * Enabled Snap applies the requested subdivision policy. The default chooses
 * the nearest subdivision, with exact midpoints moving forward. Floor chooses
 * the current subdivision's start. Disabled Snap preserves the position to the
 * nearest integer Tick.
 */
export function resolveTimelineGridTick(input: ResolveTimelineGridTickInput): Tick {
  const grid = createTimelineGrid(input.grid)
  const tickPosition = requireTickPosition(input.tickPosition)

  if (tickPosition < grid.originTick) {
    throw new TimelineGridError(
      'tick-position-before-grid-origin',
      'Timeline Grid Tick position must not precede its origin',
    )
  }

  if (!input.snapEnabled) {
    return parseResolvedTick(Math.round(tickPosition))
  }

  const snapPosition = (tickPosition - grid.originTick) / grid.subdivisionSpanTick
  const subdivisionIndex =
    input.snapMode === TIMELINE_GRID_SNAP_MODE.FLOOR
      ? Math.floor(snapPosition)
      : Math.round(snapPosition)
  return parseResolvedTick(grid.originTick + subdivisionIndex * grid.subdivisionSpanTick)
}
