import { type MidiControlValue, type Tick } from '@seele-daw/project-core'

import {
  TIMELINE_GRID_SNAP_MODE,
  resolveTimelineGridTick,
  type TimelineGrid,
} from '#internal/common/timeline-grid'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollSustainPedalLaneHit } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-lane-input'
import {
  pianoRollValueLaneCssPixelToMidiControlValue,
  pianoRollValueLaneCssPixelToTimelineTickPosition,
  type PianoRollValueLaneViewport,
} from '#internal/common/piano-roll/value-lane/piano-roll-value-lane-viewport'

export interface PianoRollSustainPedalPlacement {
  readonly timelineTick: Tick
  readonly value: MidiControlValue
}

export interface ResolvePianoRollSustainPedalPencilPlacementInput {
  readonly grid: TimelineGrid
  readonly pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>
  readonly snapEnabled: boolean
  readonly viewport: PianoRollValueLaneViewport
}

/** Resolves one completed blank Pencil click into timeline-local CC64 facts. */
export function resolvePianoRollSustainPedalPencilPlacement(
  input: ResolvePianoRollSustainPedalPencilPlacementInput,
): PianoRollSustainPedalPlacement | null {
  const pointerInput = input.pointerInput
  if (
    pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END ||
    pointerInput.hasExceededDragThreshold ||
    pointerInput.hit !== null
  ) {
    return null
  }

  const tickPosition = pianoRollValueLaneCssPixelToTimelineTickPosition(
    input.viewport,
    pointerInput.originPosition.xCssPixel,
  )

  return Object.freeze({
    timelineTick: resolveTimelineGridTick({
      grid: input.grid,
      snapEnabled: input.snapEnabled,
      snapMode: TIMELINE_GRID_SNAP_MODE.FLOOR,
      tickPosition,
    }),
    value: pianoRollValueLaneCssPixelToMidiControlValue(
      input.viewport,
      pointerInput.originPosition.yCssPixel,
    ),
  })
}
