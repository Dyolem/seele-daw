import { createPianoRollPitchViewport } from '@seele-daw/editor'
import { MIDI_PITCH_MAX, MIDI_PITCH_MIN, parseMidiPitch } from '@seele-daw/project-core'
import {
  PIANO_ROLL_PITCH_VIEW_MODE,
  type PianoRollPitchViewMode,
} from '@/features/piano-roll/types/piano-roll-preferences'
import type { PianoRollPitchViewLayout } from '@/features/piano-roll/types/piano-roll-pitch-viewport'

export const PIANO_ROLL_STANDARD_KEY_HEIGHT = 20
export const PIANO_ROLL_MINIMUM_KEY_HEIGHT = 16
export const PIANO_ROLL_MAXIMUM_KEY_HEIGHT = 48
export const PIANO_ROLL_DEFAULT_PITCH_RANGE_SIZE = 25
export const PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE = 3
export const PIANO_ROLL_PITCH_COUNT = MIDI_PITCH_MAX - MIDI_PITCH_MIN + 1
export const PIANO_ROLL_FIT_PITCH_PADDING = 2
export const PIANO_ROLL_PITCH_ZOOM_FACTOR = 1.25

export function resolvePitchViewLayout(input: {
  readonly height: number
  readonly centerPitch: number
  readonly mode: PianoRollPitchViewMode
  readonly rangeSize: number
}): PianoRollPitchViewLayout {
  const rowHeight =
    input.mode === PIANO_ROLL_PITCH_VIEW_MODE.STANDARD
      ? PIANO_ROLL_STANDARD_KEY_HEIGHT
      : Math.min(
          PIANO_ROLL_MAXIMUM_KEY_HEIGHT,
          Math.max(PIANO_ROLL_MINIMUM_KEY_HEIGHT, input.height / input.rangeSize),
        )
  const contentHeight = PIANO_ROLL_PITCH_COUNT * rowHeight
  const scrollTop = Math.max(
    0,
    Math.min(
      contentHeight - input.height,
      (MIDI_PITCH_MAX + 0.5 - input.centerPitch) * rowHeight - input.height / 2,
    ),
  )
  const firstRow = Math.floor(scrollTop / rowHeight)
  const lastRow = Math.min(
    PIANO_ROLL_PITCH_COUNT - 1,
    Math.ceil((scrollTop + input.height) / rowHeight) - 1,
  )
  return {
    viewport: createPianoRollPitchViewport({
      heightCssPixel: input.height,
      maximumPitch: parseMidiPitch(MIDI_PITCH_MAX - firstRow),
      minimumPitch: parseMidiPitch(MIDI_PITCH_MAX - lastRow),
      pitchRowHeightCssPixel: rowHeight,
      pitchOffsetCssPixel: scrollTop - firstRow * rowHeight,
    }),
    scrollTop,
    contentHeight,
  }
}

export function pitchCenterAtScrollTop(
  layout: PianoRollPitchViewLayout,
  scrollTop: number,
): number {
  const top = Math.max(
    0,
    Math.min(layout.contentHeight - layout.viewport.heightCssPixel, scrollTop),
  )
  return (
    MIDI_PITCH_MAX +
    0.5 -
    (top + layout.viewport.heightCssPixel / 2) / layout.viewport.pitchRowHeightCssPixel
  )
}
