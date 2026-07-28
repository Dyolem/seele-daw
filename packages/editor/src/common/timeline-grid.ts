import {
  parsePositiveTick,
  parseTick,
  type Tick,
} from '@seele-daw/project-core'

import { TimelineGridError } from './timeline-grid-error'

export interface TimelineGrid {
  readonly originTick: Tick
  readonly subdivisionSpanTick: Tick
}

export interface CreateTimelineGridInput {
  readonly originTick: Tick
  readonly subdivisionSpanTick: Tick
}

export interface ResolveTimelineGridTickInput {
  readonly grid: TimelineGrid
  readonly snapEnabled: boolean
  readonly tickPosition: number
}

function requireTickPosition(value: number): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
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
export function createTimelineGrid(
  input: CreateTimelineGridInput,
): TimelineGrid {
  return Object.freeze({
    originTick: parseTick(input.originTick),
    subdivisionSpanTick: parsePositiveTick(input.subdivisionSpanTick),
  })
}

/**
 * Resolves a continuous Timeline position to an integer Tick.
 *
 * Enabled Snap chooses the nearest subdivision, with exact midpoints moving
 * forward. Disabled Snap preserves the position to the nearest integer Tick.
 */
export function resolveTimelineGridTick(
  input: ResolveTimelineGridTickInput,
): Tick {
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

  const subdivisionIndex = Math.round(
    (tickPosition - grid.originTick) / grid.subdivisionSpanTick,
  )
  return parseResolvedTick(
    grid.originTick + subdivisionIndex * grid.subdivisionSpanTick,
  )
}
