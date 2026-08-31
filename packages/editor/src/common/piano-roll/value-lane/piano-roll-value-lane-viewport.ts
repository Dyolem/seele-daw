import {
  MIDI_CONTROL_VALUE_MAX,
  MIDI_CONTROL_VALUE_MIN,
  addTicks,
  parseMidiControlValue,
  parsePositiveTick,
  parseTick,
  type MidiControlValue,
  type Tick,
} from '@seele-daw/project-core'

import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'

export interface PianoRollValueLaneViewport {
  readonly heightCssPixel: number
  readonly visibleEndTick: Tick
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
}

export interface CreatePianoRollValueLaneViewportInput {
  readonly heightCssPixel: number
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
}

function requirePositiveCssPixel(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PianoRollError(
      'invalid-viewport-dimension',
      `Piano Roll Value Lane ${field} must be a finite positive CSS Pixel value`,
    )
  }
  return value
}

function requireCssPixelPosition(value: number, maximum: number, axis: string): number {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      `Piano Roll Value Lane ${axis} CSS Pixel position is outside the Viewport`,
    )
  }
  return value
}

function requireVisibleTick(viewport: PianoRollValueLaneViewport, tickInput: Tick): Tick {
  const tick = parseTick(tickInput)
  if (tick < viewport.visibleStartTick || tick > viewport.visibleEndTick) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      `Timeline Tick ${tick} is outside the Piano Roll Value Lane Viewport`,
    )
  }
  return tick
}

/** Creates time-and-value geometry shared by MIDI controller lanes. */
export function createPianoRollValueLaneViewport(
  input: CreatePianoRollValueLaneViewportInput,
): PianoRollValueLaneViewport {
  const visibleStartTick = parseTick(input.visibleStartTick)
  const visibleSpanTick = parsePositiveTick(input.visibleSpanTick)

  return Object.freeze({
    heightCssPixel: requirePositiveCssPixel(input.heightCssPixel, 'height'),
    visibleEndTick: addTicks(visibleStartTick, visibleSpanTick),
    visibleSpanTick,
    visibleStartTick,
    widthCssPixel: requirePositiveCssPixel(input.widthCssPixel, 'width'),
  })
}

export function pianoRollValueLaneTimelineTickToCssPixel(
  viewport: PianoRollValueLaneViewport,
  tickInput: Tick,
): number {
  const tick = requireVisibleTick(viewport, tickInput)
  return ((tick - viewport.visibleStartTick) / viewport.visibleSpanTick) * viewport.widthCssPixel
}

/** Returns an unrounded Timeline Tick position for the interaction layer to snap. */
export function pianoRollValueLaneCssPixelToTimelineTickPosition(
  viewport: PianoRollValueLaneViewport,
  xCssPixelInput: number,
): number {
  const xCssPixel = requireCssPixelPosition(xCssPixelInput, viewport.widthCssPixel, 'horizontal')
  return viewport.visibleStartTick + (xCssPixel / viewport.widthCssPixel) * viewport.visibleSpanTick
}

/** Maps MIDI 127 to the top edge and MIDI 0 to the inclusive bottom edge. */
export function pianoRollMidiControlValueToValueLaneCssPixel(
  viewport: PianoRollValueLaneViewport,
  valueInput: MidiControlValue,
): number {
  const value = parseMidiControlValue(valueInput)
  const valueSpan = MIDI_CONTROL_VALUE_MAX - MIDI_CONTROL_VALUE_MIN
  return ((MIDI_CONTROL_VALUE_MAX - value) / valueSpan) * viewport.heightCssPixel
}

/** Resolves the closest discrete MIDI controller value at one vertical position. */
export function pianoRollValueLaneCssPixelToMidiControlValue(
  viewport: PianoRollValueLaneViewport,
  yCssPixelInput: number,
): MidiControlValue {
  const yCssPixel = requireCssPixelPosition(yCssPixelInput, viewport.heightCssPixel, 'vertical')
  const valueSpan = MIDI_CONTROL_VALUE_MAX - MIDI_CONTROL_VALUE_MIN
  return parseMidiControlValue(
    Math.round(MIDI_CONTROL_VALUE_MAX - (yCssPixel / viewport.heightCssPixel) * valueSpan),
  )
}
