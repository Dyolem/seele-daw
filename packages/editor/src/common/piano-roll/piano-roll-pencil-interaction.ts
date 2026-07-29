import {
  parseTick,
  type MidiPitch,
  type Tick,
} from '@seele-daw/project-core'

import {
  TIMELINE_GRID_SNAP_MODE,
  resolveTimelineGridTick,
  type TimelineGrid,
} from '../timeline-grid'
import type { PianoRollClipContext } from './piano-roll-clip-context'
import { PianoRollError } from './piano-roll-error'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from './piano-roll-input'
import {
  pianoRollCssPixelToClipTickPosition,
  pianoRollCssPixelToMidiPitch,
  type PianoRollViewport,
} from './piano-roll-viewport'

export interface PianoRollNotePlacement {
  readonly clipStartTick: Tick
  readonly pitch: MidiPitch
  readonly requestedDurationTick: Tick
}

export interface ResolvePianoRollPencilNotePlacementInput {
  readonly context: PianoRollClipContext
  readonly grid: TimelineGrid
  readonly pointerInput: PianoRollPointerInput
  readonly snapEnabled: boolean
  readonly viewport: PianoRollViewport
}

function clampToClipInterior(
  context: PianoRollClipContext,
  grid: TimelineGrid,
  candidateTick: Tick,
  snapEnabled: boolean,
): Tick {
  const lastInteriorTick = parseTick(context.clipSpanTick - 1)
  if (candidateTick <= lastInteriorTick) return candidateTick
  if (!snapEnabled) return lastInteriorTick

  if (grid.originTick > lastInteriorTick) {
    throw new PianoRollError(
      'invalid-grid',
      `Piano Roll Grid origin ${grid.originTick} leaves no start inside Clip ${context.clipId}`,
    )
  }

  const lastSubdivisionIndex = Math.floor(
    (lastInteriorTick - grid.originTick) / grid.subdivisionSpanTick,
  )
  return parseTick(
    grid.originTick + lastSubdivisionIndex * grid.subdivisionSpanTick,
  )
}

/**
 * Resolves one completed blank Pencil click into Clip-local Note facts.
 *
 * Existing Note hits, drags, and incomplete Pointer lifecycles intentionally
 * produce no placement.
 */
export function resolvePianoRollPencilNotePlacement(
  input: ResolvePianoRollPencilNotePlacementInput,
): PianoRollNotePlacement | null {
  const pointerInput = input.pointerInput
  if (
    pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END ||
    pointerInput.hasExceededDragThreshold ||
    pointerInput.hit !== null
  ) {
    return null
  }

  if (input.viewport.clipId !== input.context.clipId) {
    throw new PianoRollError(
      'viewport-clip-mismatch',
      `Piano Roll Viewport belongs to another Clip, not ${input.context.clipId}`,
    )
  }

  const tickPosition = pianoRollCssPixelToClipTickPosition(
    input.viewport,
    pointerInput.originPosition.xCssPixel,
  )
  const candidateTick = resolveTimelineGridTick({
    grid: input.grid,
    snapEnabled: input.snapEnabled,
    snapMode: TIMELINE_GRID_SNAP_MODE.FLOOR,
    tickPosition,
  })

  return Object.freeze({
    clipStartTick: clampToClipInterior(
      input.context,
      input.grid,
      candidateTick,
      input.snapEnabled,
    ),
    pitch: pianoRollCssPixelToMidiPitch(
      input.viewport,
      pointerInput.originPosition.yCssPixel,
    ),
    requestedDurationTick: input.grid.subdivisionSpanTick,
  })
}
