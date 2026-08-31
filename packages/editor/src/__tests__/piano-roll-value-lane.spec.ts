import {
  parseMidiControlValue,
  parseMidiSustainPedalEventId,
  parseTick,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PianoRollError,
  createPianoRollValueLaneViewport,
  createTimelineGrid,
  pianoRollMidiControlValueToValueLaneCssPixel,
  pianoRollValueLaneCssPixelToMidiControlValue,
  pianoRollValueLaneCssPixelToTimelineTickPosition,
  pianoRollValueLaneTimelineTickToCssPixel,
  resolvePianoRollSustainPedalPencilPlacement,
  type PianoRollPointerInput,
  type PianoRollSustainPedalLaneHit,
} from '#internal/index'

function createViewport() {
  return createPianoRollValueLaneViewport({
    heightCssPixel: 127,
    visibleSpanTick: parseTick(960),
    visibleStartTick: parseTick(480),
    widthCssPixel: 960,
  })
}

function createPointerInput(
  overrides: Partial<PianoRollPointerInput<PianoRollSustainPedalLaneHit>> = {},
): PianoRollPointerInput<PianoRollSustainPedalLaneHit> {
  const originPosition = Object.freeze({ xCssPixel: 130, yCssPixel: 63 })
  return Object.freeze({
    hasExceededDragThreshold: false,
    hit: null,
    modifiers: Object.freeze({ alt: false, control: false, meta: false, shift: false }),
    originModifiers: Object.freeze({ alt: false, control: false, meta: false, shift: false }),
    originPosition,
    phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    pointerId: 1,
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

function requirePianoRollError(operation: () => unknown): PianoRollError {
  let caught: unknown
  try {
    operation()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(PianoRollError)
  if (!(caught instanceof PianoRollError)) throw new Error('Expected PianoRollError')
  return caught
}

describe('Piano Roll Value Lane Viewport', () => {
  it('maps visible Timeline endpoints and continuous horizontal positions', () => {
    const viewport = createViewport()

    expect(pianoRollValueLaneTimelineTickToCssPixel(viewport, parseTick(480))).toBe(0)
    expect(pianoRollValueLaneTimelineTickToCssPixel(viewport, parseTick(960))).toBe(480)
    expect(pianoRollValueLaneTimelineTickToCssPixel(viewport, parseTick(1_440))).toBe(960)
    expect(pianoRollValueLaneCssPixelToTimelineTickPosition(viewport, 240)).toBe(720)
  })

  it('maps MIDI 127 to the top and MIDI 0 to the inclusive bottom edge', () => {
    const viewport = createViewport()

    expect(pianoRollMidiControlValueToValueLaneCssPixel(viewport, parseMidiControlValue(127))).toBe(
      0,
    )
    expect(pianoRollMidiControlValueToValueLaneCssPixel(viewport, parseMidiControlValue(64))).toBe(
      63,
    )
    expect(pianoRollMidiControlValueToValueLaneCssPixel(viewport, parseMidiControlValue(0))).toBe(
      127,
    )
    expect(pianoRollValueLaneCssPixelToMidiControlValue(viewport, 0)).toBe(127)
    expect(pianoRollValueLaneCssPixelToMidiControlValue(viewport, 63)).toBe(64)
    expect(pianoRollValueLaneCssPixelToMidiControlValue(viewport, 127)).toBe(0)
  })

  it('fails closed for invalid dimensions and coordinates', () => {
    expect(
      requirePianoRollError(() =>
        createPianoRollValueLaneViewport({
          heightCssPixel: 0,
          visibleSpanTick: parseTick(960),
          visibleStartTick: parseTick(0),
          widthCssPixel: 960,
        }),
      ).code,
    ).toBe('invalid-viewport-dimension')

    const viewport = createViewport()
    expect(
      requirePianoRollError(() =>
        pianoRollValueLaneTimelineTickToCssPixel(viewport, parseTick(479)),
      ).code,
    ).toBe('coordinate-outside-viewport')
    expect(
      requirePianoRollError(() => pianoRollValueLaneCssPixelToMidiControlValue(viewport, 127.01))
        .code,
    ).toBe('coordinate-outside-viewport')
  })
})

describe('Piano Roll Sustain Pedal Pencil Interaction', () => {
  const grid = createTimelineGrid({
    originTick: parseTick(0),
    subdivisionSpanTick: parseTick(240),
  })

  it('floors time to the shared Grid and resolves the closest raw CC64 value', () => {
    expect(
      resolvePianoRollSustainPedalPencilPlacement({
        grid,
        pointerInput: createPointerInput(),
        snapEnabled: true,
        viewport: createViewport(),
      }),
    ).toEqual({ timelineTick: 480, value: 64 })
  })

  it('preserves unsnapped time and permits the visible terminal endpoint', () => {
    expect(
      resolvePianoRollSustainPedalPencilPlacement({
        grid,
        pointerInput: createPointerInput({
          originPosition: Object.freeze({ xCssPixel: 130.6, yCssPixel: 127 }),
        }),
        snapEnabled: false,
        viewport: createViewport(),
      }),
    ).toEqual({ timelineTick: 611, value: 0 })

    expect(
      resolvePianoRollSustainPedalPencilPlacement({
        grid,
        pointerInput: createPointerInput({
          originPosition: Object.freeze({ xCssPixel: 960, yCssPixel: 0 }),
        }),
        snapEnabled: true,
        viewport: createViewport(),
      }),
    ).toEqual({ timelineTick: 1_440, value: 127 })
  })

  it.each([
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN }),
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL }),
    createPointerInput({ hasExceededDragThreshold: true }),
    createPointerInput({
      hit: Object.freeze({
        sustainPedalEventId: parseMidiSustainPedalEventId('existing-cc64-event'),
      }),
    }),
  ])('ignores incomplete, dragged or existing-event gestures', (pointerInput) => {
    expect(
      resolvePianoRollSustainPedalPencilPlacement({
        grid,
        pointerInput,
        snapEnabled: true,
        viewport: createViewport(),
      }),
    ).toBeNull()
  })
})
