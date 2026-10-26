import { parsePositiveTick, parseTick, type Tick } from '@seele-daw/project-core'

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

/** Creates the immutable time grid shared by visible divisions and interactions. */
export function createTimelineGrid(input: CreateTimelineGridInput): TimelineGrid {
  return Object.freeze({
    originTick: input.originTick,
    subdivisionSpanTick: parsePositiveTick(input.subdivisionSpanTick),
  })
}

/**
 * Resolves a continuous Timeline position at or after the grid's origin to an integer Tick.
 *
 * Enabled Snap applies the requested subdivision policy. The default chooses
 * the nearest subdivision, with exact midpoints moving forward. Floor chooses
 * the current subdivision's start. Disabled Snap preserves the position to the
 * nearest integer Tick.
 */
export function resolveTimelineGridTick(input: ResolveTimelineGridTickInput): Tick {
  const { grid, tickPosition } = input
  if (!input.snapEnabled) return parseTick(Math.round(tickPosition))

  const snapPosition = (tickPosition - grid.originTick) / grid.subdivisionSpanTick
  const subdivisionIndex =
    input.snapMode === TIMELINE_GRID_SNAP_MODE.FLOOR
      ? Math.floor(snapPosition)
      : Math.round(snapPosition)
  return parseTick(grid.originTick + subdivisionIndex * grid.subdivisionSpanTick)
}
