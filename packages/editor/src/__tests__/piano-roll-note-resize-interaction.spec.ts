import {
  parseClipId,
  parseMidiPitch,
  parseNoteId,
  parsePositiveTick,
  parseTick,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollGrid,
  createPianoRollNoteResizeGesture,
  createPianoRollViewport,
  resolvePianoRollNoteResizePreview,
  type PianoRollPointerInput,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

const NO_MODIFIERS = Object.freeze({
  alt: false,
  control: false,
  meta: false,
  shift: false,
})

function createPointerInput(overrides: Partial<PianoRollPointerInput> = {}): PianoRollPointerInput {
  const originPosition = Object.freeze({
    xCssPixel: 240,
    yCssPixel: 64,
  })

  return Object.freeze({
    hasExceededDragThreshold: false,
    hit: Object.freeze({
      noteId: parseNoteId('editor-note-inside'),
      zone: PIANO_ROLL_HIT_ZONE.RESIZE_START,
    }),
    modifiers: NO_MODIFIERS,
    originModifiers: NO_MODIFIERS,
    originPosition,
    phase: PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
    pointerId: 1,
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

function createFixture() {
  const project = createPianoRollProjectFixture()
  const viewport = createPianoRollViewport(project.context, {
    heightCssPixel: 128,
    maximumPitch: parseMidiPitch(67),
    minimumPitch: parseMidiPitch(60),
    visibleSpanTick: project.context.clipSpanTick,
    visibleStartTick: parseTick(0),
    widthCssPixel: 960,
  })
  const grid = createPianoRollGrid({
    barSpanTick: parsePositiveTick(960),
    beatSpanTick: parsePositiveTick(480),
    originTick: parseTick(0),
    subdivisionSpanTick: parsePositiveTick(240),
  })

  return { ...project, grid, viewport }
}

describe('Piano Roll Note Resize Interaction', () => {
  it('resizes the start edge against the nearest absolute Grid coordinate', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-inside')
    const gesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: createPointerInput(),
      selectedNoteIds: [noteId],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note resize gesture')

    const preview = resolvePianoRollNoteResizePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 170, yCssPixel: 64 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(preview).toEqual({
      durationTick: 480,
      edge: PIANO_ROLL_HIT_ZONE.RESIZE_START,
      note: {
        noteId,
        pitch: 64,
        visibleEndTick: 720,
        visibleStartTick: 240,
      },
      resizedNoteId: noteId,
      snapGuideTick: 240,
      sourceStartTick: 720,
    })
    expect(gesture.selectOnlyOnCommit).toBe(false)
    expect(Object.isFrozen(preview)).toBe(true)
    expect(Object.isFrozen(preview?.note)).toBe(true)
  })

  it('resizes the end edge while preserving the original start', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-inside')
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId,
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      }),
      originPosition: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
      position: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
    })
    const gesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: begin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note resize gesture')

    const preview = resolvePianoRollNoteResizePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 430, yCssPixel: 64 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(preview).toMatchObject({
      durationTick: 480,
      edge: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      resizedNoteId: noteId,
      snapGuideTick: 960,
      sourceStartTick: 960,
    })
    expect(gesture.selectOnlyOnCommit).toBe(true)
  })

  it('snaps an off-grid edge to the active Grid and dynamically bypasses Snap with Alt', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-high')
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId,
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      }),
      originPosition: Object.freeze({ xCssPixel: 380, yCssPixel: 32 }),
      position: Object.freeze({ xCssPixel: 380, yCssPixel: 32 }),
    })
    const gesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: begin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note resize gesture')

    const snapped = resolvePianoRollNoteResizePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 460, yCssPixel: 32 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })
    const unsnapped = resolvePianoRollNoteResizePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        modifiers: Object.freeze({ ...NO_MODIFIERS, alt: true }),
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 460, yCssPixel: 32 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(snapped).toMatchObject({
      durationTick: 440,
      snapGuideTick: 960,
      sourceStartTick: 1_000,
    })
    expect(unsnapped).toMatchObject({
      durationTick: 400,
      snapGuideTick: null,
      sourceStartTick: 1_000,
    })
  })

  it('clamps either edge to a positive one-Tick duration', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-inside')
    const startGesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: createPointerInput(),
      selectedNoteIds: [],
      session: fixture.session,
    })
    const endBegin = createPointerInput({
      hit: Object.freeze({ noteId, zone: PIANO_ROLL_HIT_ZONE.RESIZE_END }),
      originPosition: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
      position: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
    })
    const endGesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: endBegin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (startGesture === null || endGesture === null) {
      throw new Error('Expected both Note resize gestures')
    }

    const collapsedStart = resolvePianoRollNoteResizePreview({
      gesture: startGesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 1_000, yCssPixel: 64 }),
      }),
      snapEnabled: false,
      viewport: fixture.viewport,
    })
    const collapsedEnd = resolvePianoRollNoteResizePreview({
      gesture: endGesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...endBegin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: -1_000, yCssPixel: 64 }),
      }),
      snapEnabled: false,
      viewport: fixture.viewport,
    })

    expect(collapsedStart).toMatchObject({
      durationTick: 1,
      sourceStartTick: 1_199,
    })
    expect(collapsedEnd).toMatchObject({
      durationTick: 1,
      sourceStartTick: 960,
    })
  })

  it('clamps the dragged edge to the full MidiSource boundaries', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-inside')
    const startBegin = createPointerInput()
    const endBegin = createPointerInput({
      hit: Object.freeze({ noteId, zone: PIANO_ROLL_HIT_ZONE.RESIZE_END }),
      originPosition: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
      position: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
    })
    const startGesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: startBegin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    const endGesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: endBegin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (startGesture === null || endGesture === null) {
      throw new Error('Expected both Note resize gestures')
    }

    const sourceStart = resolvePianoRollNoteResizePreview({
      gesture: startGesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...startBegin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: -1_000, yCssPixel: 64 }),
      }),
      snapEnabled: false,
      viewport: fixture.viewport,
    })
    const sourceEnd = resolvePianoRollNoteResizePreview({
      gesture: endGesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...endBegin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 2_000, yCssPixel: 64 }),
      }),
      snapEnabled: false,
      viewport: fixture.viewport,
    })

    expect(sourceStart).toMatchObject({
      durationTick: 1_200,
      sourceStartTick: 0,
    })
    expect(sourceEnd).toMatchObject({
      durationTick: 2_880,
      sourceStartTick: 960,
    })
  })

  it('retains identity when the resized Note leaves the Clip preview', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-leading')
    const begin = createPointerInput({
      hit: Object.freeze({ noteId, zone: PIANO_ROLL_HIT_ZONE.RESIZE_END }),
      originPosition: Object.freeze({ xCssPixel: 120, yCssPixel: 64 }),
      position: Object.freeze({ xCssPixel: 120, yCssPixel: 64 }),
    })
    const gesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: begin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note resize gesture')

    const preview = resolvePianoRollNoteResizePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: -1_000, yCssPixel: 64 }),
      }),
      snapEnabled: false,
      viewport: fixture.viewport,
    })

    expect(preview).toMatchObject({
      durationTick: 1,
      note: null,
      resizedNoteId: noteId,
      sourceStartTick: 240,
    })
  })

  it('ignores non-edge gestures and rejects a mismatched Viewport', () => {
    const fixture = createFixture()
    expect(
      createPianoRollNoteResizeGesture({
        context: fixture.context,
        pointerInput: createPointerInput({
          hit: Object.freeze({
            noteId: parseNoteId('editor-note-inside'),
            zone: PIANO_ROLL_HIT_ZONE.BODY,
          }),
        }),
        selectedNoteIds: [],
        session: fixture.session,
      }),
    ).toBeNull()

    const gesture = createPianoRollNoteResizeGesture({
      context: fixture.context,
      pointerInput: createPointerInput(),
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note resize gesture')

    expect(() =>
      resolvePianoRollNoteResizePreview({
        gesture,
        grid: fixture.grid,
        pointerInput: createPointerInput({
          hasExceededDragThreshold: true,
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
          position: Object.freeze({ xCssPixel: 170, yCssPixel: 64 }),
        }),
        snapEnabled: true,
        viewport: Object.freeze({
          ...fixture.viewport,
          clipId: parseClipId('other-resize-clip'),
        }),
      }),
    ).toThrowError(expect.objectContaining({ code: 'viewport-clip-mismatch' }))
  })
})
