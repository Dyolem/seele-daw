import {
  MIDI_CONTROL_VALUE_MAX,
  MIDI_CONTROL_VALUE_MIN,
  addTicks,
  parseMidiControlValue,
  parsePositiveTick,
  type MidiControlValue,
  type Tick,
} from '@seele-daw/project-core'

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

/** Lane sizes come from layout, which reports zero while a panel is hidden. */
function requirePositiveCssPixel(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Piano Roll Value Lane ${field} must be a finite positive CSS Pixel value`)
  }
  return value
}

/** Creates time-and-value geometry shared by MIDI controller lanes. */
export function createPianoRollValueLaneViewport(
  input: CreatePianoRollValueLaneViewportInput,
): PianoRollValueLaneViewport {
  const { visibleStartTick } = input
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
  tick: Tick,
): number {
  return ((tick - viewport.visibleStartTick) / viewport.visibleSpanTick) * viewport.widthCssPixel
}

/** Returns an unrounded Timeline Tick position for the interaction layer to snap. */
export function pianoRollValueLaneCssPixelToTimelineTickPosition(
  viewport: PianoRollValueLaneViewport,
  xCssPixel: number,
): number {
  return viewport.visibleStartTick + (xCssPixel / viewport.widthCssPixel) * viewport.visibleSpanTick
}

/** Maps MIDI 127 to the top edge and MIDI 0 to the inclusive bottom edge. */
export function pianoRollMidiControlValueToValueLaneCssPixel(
  viewport: PianoRollValueLaneViewport,
  value: MidiControlValue,
): number {
  const valueSpan = MIDI_CONTROL_VALUE_MAX - MIDI_CONTROL_VALUE_MIN
  return ((MIDI_CONTROL_VALUE_MAX - value) / valueSpan) * viewport.heightCssPixel
}

/** Resolves the closest MIDI controller value at a vertical position, clamped to the lane. */
export function pianoRollValueLaneCssPixelToMidiControlValue(
  viewport: PianoRollValueLaneViewport,
  yCssPixel: number,
): MidiControlValue {
  const valueSpan = MIDI_CONTROL_VALUE_MAX - MIDI_CONTROL_VALUE_MIN
  const value = Math.round(
    MIDI_CONTROL_VALUE_MAX - (yCssPixel / viewport.heightCssPixel) * valueSpan,
  )
  return parseMidiControlValue(
    Math.min(MIDI_CONTROL_VALUE_MAX, Math.max(MIDI_CONTROL_VALUE_MIN, value)),
  )
}
