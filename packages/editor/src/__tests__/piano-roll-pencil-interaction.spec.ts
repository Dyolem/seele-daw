import {
  createMidiClipRecord,
  createMidiSourceRecord,
  parseClipId,
  parseMidiPitch,
  parseMidiSourceId,
  parseNoteId,
  parsePositiveTick,
  parseTick,
  parseTrackId,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollClipContext,
  createPianoRollGrid,
  createPianoRollViewport,
  resolvePianoRollPencilNotePlacement,
  type PianoRollPointerInput,
} from '#internal/index'

function createFixture() {
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('pencil-interaction-source'),
    lengthTick: parsePositiveTick(960),
  })
  const clip = createMidiClipRecord({
    id: parseClipId('pencil-interaction-clip'),
    trackId: parseTrackId('pencil-interaction-track'),
    name: 'Pencil Interaction',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parsePositiveTick(960),
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
    loop: null,
  })
  const context = createPianoRollClipContext(clip, source)
  const viewport = createPianoRollViewport(context, {
    heightCssPixel: 128,
    maximumPitch: parseMidiPitch(67),
    minimumPitch: parseMidiPitch(60),
    visibleSpanTick: clip.spanTick,
    visibleStartTick: parseTick(0),
    widthCssPixel: 960,
  })
  const grid = createPianoRollGrid({
    barSpanTick: parsePositiveTick(960),
    beatSpanTick: parsePositiveTick(480),
    originTick: parseTick(0),
    subdivisionSpanTick: parsePositiveTick(240),
  })

  return { context, grid, viewport }
}

function createPointerInput(
  overrides: Partial<PianoRollPointerInput> = {},
): PianoRollPointerInput {
  const originPosition = Object.freeze({ xCssPixel: 130, yCssPixel: 8 })

  return Object.freeze({
    hasExceededDragThreshold: false,
    hit: null,
    modifiers: Object.freeze({
      alt: false,
      control: false,
      meta: false,
      shift: false,
    }),
    originModifiers: Object.freeze({
      alt: false,
      control: false,
      meta: false,
      shift: false,
    }),
    originPosition,
    phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    pointerId: 1,
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

describe('Piano Roll Pencil Interaction', () => {
  it('floors X to the current Grid start while Y maps directly to its Pitch row', () => {
    const fixture = createFixture()

    expect(
      resolvePianoRollPencilNotePlacement({
        ...fixture,
        pointerInput: createPointerInput(),
        snapEnabled: true,
      }),
    ).toEqual({
      clipStartTick: 0,
      pitch: 67,
      requestedDurationTick: 240,
    })
  })

  it('preserves unsnapped X to the nearest integer Tick', () => {
    const fixture = createFixture()

    expect(
      resolvePianoRollPencilNotePlacement({
        ...fixture,
        pointerInput: createPointerInput({
          originPosition: Object.freeze({
            xCssPixel: 130.6,
            yCssPixel: 24,
          }),
        }),
        snapEnabled: false,
      }),
    ).toEqual({
      clipStartTick: 131,
      pitch: 66,
      requestedDurationTick: 240,
    })
  })

  it('moves a snapped Clip endpoint to the final complete Grid cell', () => {
    const fixture = createFixture()

    expect(
      resolvePianoRollPencilNotePlacement({
        ...fixture,
        pointerInput: createPointerInput({
          originPosition: Object.freeze({
            xCssPixel: 960,
            yCssPixel: 8,
          }),
        }),
        snapEnabled: true,
      }),
    ).toEqual({
      clipStartTick: 720,
      pitch: 67,
      requestedDurationTick: 240,
    })
  })

  it('moves an unsnapped Clip endpoint to the final interior Tick', () => {
    const fixture = createFixture()

    expect(
      resolvePianoRollPencilNotePlacement({
        ...fixture,
        pointerInput: createPointerInput({
          originPosition: Object.freeze({
            xCssPixel: 960,
            yCssPixel: 8,
          }),
        }),
        snapEnabled: false,
      }),
    ).toEqual({
      clipStartTick: 959,
      pitch: 67,
      requestedDurationTick: 240,
    })
  })

  it.each([
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN }),
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE }),
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL }),
    createPointerInput({ hasExceededDragThreshold: true }),
    createPointerInput({
      hit: Object.freeze({
        noteId: parseNoteId('pencil-existing-note'),
        zone: PIANO_ROLL_HIT_ZONE.BODY,
      }),
    }),
  ])('ignores incomplete, dragged or existing-Note gestures', (pointerInput) => {
    const fixture = createFixture()

    expect(
      resolvePianoRollPencilNotePlacement({
        ...fixture,
        pointerInput,
        snapEnabled: true,
      }),
    ).toBeNull()
  })
})
