import {
  parsePositiveTick,
  type Tick,
} from '@seele-daw/project-core'

import {
  createTimelineGrid,
  type CreateTimelineGridInput,
  type TimelineGrid,
} from '../timeline-grid'
import { PianoRollError } from './piano-roll-error'

export interface PianoRollGrid extends TimelineGrid {
  readonly barSpanTick: Tick
  readonly beatSpanTick: Tick
}

export interface CreatePianoRollGridInput extends CreateTimelineGridInput {
  readonly barSpanTick: Tick
  readonly beatSpanTick: Tick
}

function requireGridNesting(
  larger: Tick,
  smaller: Tick,
  relationship: string,
): void {
  if (larger < smaller || larger % smaller !== 0) {
    throw new PianoRollError(
      'invalid-grid',
      `Piano Roll ${relationship} must use evenly nested positive Tick spans`,
    )
  }
}

/** Creates the shared visual and interaction Grid for one Piano Roll. */
export function createPianoRollGrid(
  input: CreatePianoRollGridInput,
): PianoRollGrid {
  const timelineGrid = createTimelineGrid(input)
  const barSpanTick = parsePositiveTick(input.barSpanTick)
  const beatSpanTick = parsePositiveTick(input.beatSpanTick)

  requireGridNesting(barSpanTick, beatSpanTick, 'bar and beat grid')
  requireGridNesting(
    beatSpanTick,
    timelineGrid.subdivisionSpanTick,
    'beat and subdivision grid',
  )

  return Object.freeze({
    ...timelineGrid,
    barSpanTick,
    beatSpanTick,
  })
}
