import {
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
  createPianoRollNoteMoveGesture,
  createPianoRollViewport,
  resolvePianoRollNoteMovePreview,
  type PianoRollPointerInput,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

function createPointerInput(
  overrides: Partial<PianoRollPointerInput> = {},
): PianoRollPointerInput {
  const originPosition = Object.freeze({
    xCssPixel: 240,
    yCssPixel: 64,
  })

  return Object.freeze({
    hasExceededDragThreshold: false,
    hit: Object.freeze({
      noteId: parseNoteId('editor-note-inside'),
      zone: PIANO_ROLL_HIT_ZONE.BODY,
    }),
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

describe('Piano Roll Note Move Interaction', () => {
  it('previews the selected Notes with one snapped Tick and semitone delta', () => {
    const fixture = createFixture()
    const leadingNoteId = parseNoteId('editor-note-leading')
    const insideNoteId = parseNoteId('editor-note-inside')
    const gesture = createPianoRollNoteMoveGesture({
      context: fixture.context,
      pointerInput: createPointerInput(),
      selectedNoteIds: [leadingNoteId, insideNoteId],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note move gesture')

    const preview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 370, yCssPixel: 40 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(preview).toEqual({
      deltaPitch: 2,
      deltaTick: 240,
      movedNoteIds: [leadingNoteId, insideNoteId],
      notes: [
        {
          noteId: leadingNoteId,
          pitch: 62,
          visibleEndTick: 480,
          visibleStartTick: 0,
        },
        {
          noteId: insideNoteId,
          pitch: 66,
          visibleEndTick: 960,
          visibleStartTick: 720,
        },
      ],
      snapGuideTick: 720,
    })
    expect(Object.isFrozen(preview)).toBe(true)
    expect(Object.isFrozen(preview?.notes)).toBe(true)
  })

  it('snaps an off-grid anchor to an absolute Grid coordinate and targets only the hit Note', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-off-grid')
    fixture.addNote({
      durationTick: parseTick(240),
      noteId,
      pitch: parseMidiPitch(65),
      startTick: parseTick(1_000),
    })
    const begin = createPointerInput({
      hit: Object.freeze({ noteId, zone: PIANO_ROLL_HIT_ZONE.BODY }),
      originPosition: Object.freeze({ xCssPixel: 260, yCssPixel: 32 }),
      position: Object.freeze({ xCssPixel: 260, yCssPixel: 32 }),
    })
    const gesture = createPianoRollNoteMoveGesture({
      context: fixture.context,
      pointerInput: begin,
      selectedNoteIds: [parseNoteId('editor-note-inside')],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note move gesture')

    const preview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 390, yCssPixel: 32 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(gesture.selectOnlyOnCommit).toBe(true)
    expect(preview).toMatchObject({
      deltaTick: 200,
      movedNoteIds: [noteId],
      snapGuideTick: 720,
    })
  })

  it('resolves an off-grid anchor against the active Grid subdivision', () => {
    const fixture = createFixture()
    const noteId = parseNoteId('editor-note-high')
    const begin = createPointerInput({
      hit: Object.freeze({ noteId, zone: PIANO_ROLL_HIT_ZONE.BODY }),
      originPosition: Object.freeze({ xCssPixel: 260, yCssPixel: 32 }),
      position: Object.freeze({ xCssPixel: 260, yCssPixel: 32 }),
    })
    const gesture = createPianoRollNoteMoveGesture({
      context: fixture.context,
      pointerInput: begin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note move gesture')

    const preview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: createPianoRollGrid({
        barSpanTick: parsePositiveTick(960),
        beatSpanTick: parsePositiveTick(480),
        originTick: parseTick(0),
        subdivisionSpanTick: parsePositiveTick(160),
      }),
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 390, yCssPixel: 32 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(preview).toMatchObject({
      deltaTick: 280,
      movedNoteIds: [noteId],
      snapGuideTick: 800,
    })
  })

  it('updates the Snap bypass when Alt changes during the active gesture', () => {
    const fixture = createFixture()
    const begin = createPointerInput()
    const gesture = createPianoRollNoteMoveGesture({
      context: fixture.context,
      pointerInput: begin,
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note move gesture')

    const preview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        modifiers: Object.freeze({
          alt: true,
          control: false,
          meta: false,
          shift: false,
        }),
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 370, yCssPixel: 64 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(preview).toMatchObject({
      deltaTick: 260,
      snapGuideTick: null,
    })

    const snappedPreview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 370, yCssPixel: 64 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })
    expect(snappedPreview).toMatchObject({
      deltaTick: 240,
      snapGuideTick: 720,
    })
  })

  it('clamps the whole Selection to the shared Source and Pitch boundaries', () => {
    const fixture = createFixture()
    const gesture = createPianoRollNoteMoveGesture({
      context: fixture.context,
      pointerInput: createPointerInput(),
      selectedNoteIds: [
        parseNoteId('editor-note-leading'),
        parseNoteId('editor-note-inside'),
      ],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note move gesture')

    const preview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: fixture.grid,
      pointerInput: createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: -760, yCssPixel: -1_000 }),
      }),
      snapEnabled: true,
      viewport: fixture.viewport,
    })

    expect(preview).toMatchObject({
      deltaPitch: 63,
      deltaTick: -240,
    })
  })

  it('does not create previews before the drag threshold', () => {
    const fixture = createFixture()
    const gesture = createPianoRollNoteMoveGesture({
      context: fixture.context,
      pointerInput: createPointerInput(),
      selectedNoteIds: [],
      session: fixture.session,
    })
    if (gesture === null) throw new Error('Expected Note move gesture')

    expect(
      resolvePianoRollNoteMovePreview({
        gesture,
        grid: fixture.grid,
        pointerInput: createPointerInput({
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
        snapEnabled: true,
        viewport: fixture.viewport,
      }),
    ).toBeNull()
  })
})
