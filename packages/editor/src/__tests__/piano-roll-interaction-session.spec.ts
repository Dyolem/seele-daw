import {
  parseMidiPitch,
  parseNoteId,
  parsePositiveTick,
  parseTick,
  type ModelRevision,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_INTERACTION_INTENT,
  PIANO_ROLL_INTERACTION_STATUS,
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollGrid,
  createPianoRollInteractionSession,
  createPianoRollViewport,
  type PianoRollInteractionConfiguration,
  type PianoRollInteractionState,
  type PianoRollInteractionTool,
  type PianoRollPointerInput,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

const NO_MODIFIERS = Object.freeze({
  alt: false,
  control: false,
  meta: false,
  shift: false,
})

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

function createFixture(
  tool: PianoRollInteractionTool = PIANO_ROLL_INTERACTION_TOOL.CURSOR,
) {
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
  const configuration: PianoRollInteractionConfiguration = Object.freeze({
    context: project.context,
    grid,
    selectedNoteIds: Object.freeze([
      parseNoteId('editor-note-leading'),
      parseNoteId('editor-note-inside'),
    ]),
    session: project.session,
    snapEnabled: true,
    tool,
    viewport,
  })

  return { configuration, ...project }
}

describe('Piano Roll Interaction Session', () => {
  it('resolves a completed Cursor press as one Selection intent', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()

    expect(
      session.handlePointerInput(
        createPointerInput(),
        fixture.configuration,
      ),
    ).toEqual({ failure: null, intent: null })
    expect(session.state).toMatchObject({
      activeGesture: 'note-move',
      status: PIANO_ROLL_INTERACTION_STATUS.PRESSING,
    })

    const end = createPointerInput({
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    })
    const outcome = session.handlePointerInput(end)

    expect(outcome).toEqual({
      failure: null,
      intent: {
        pointerInput: end,
        type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
      },
    })
    expect(session.state).toEqual({
      activeGesture: null,
      movePreview: null,
      pointerId: null,
      resizePreview: null,
      status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
    })
    expect(
      session.handlePointerInput(
        createPointerInput({
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
        }),
      ),
    ).toEqual({ failure: null, intent: null })

    session.dispose()
  })

  it('previews, emits and acknowledges one Note Move intent', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const onStateChange = vi.fn<(state: PianoRollInteractionState) => void>()
    const unsubscribe = session.subscribe({ onStateChange })
    session.handlePointerInput(createPointerInput(), fixture.configuration)

    session.handlePointerInput(
      createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 370, yCssPixel: 40 }),
      }),
    )
    expect(session.state).toMatchObject({
      activeGesture: 'note-move',
      movePreview: {
        deltaPitch: 2,
        deltaTick: 240,
      },
      status: PIANO_ROLL_INTERACTION_STATUS.MOVING_NOTE,
    })

    const outcome = session.handlePointerInput(
      createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 370, yCssPixel: 40 }),
      }),
    )
    expect(outcome.intent).toMatchObject({
      preview: {
        deltaPitch: 2,
        deltaTick: 240,
      },
      type: PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES,
    })
    expect(session.state.status).toBe(
      PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_MOVE,
    )

    const commitRevision = fixture.session.modelRevision
    session.resolveMoveCommit({
      authorityRevision: (commitRevision - 1) as ModelRevision,
      commitRevision,
    })
    expect(session.state).toMatchObject({
      movePreview: {
        deltaPitch: 2,
        deltaTick: 240,
      },
      status: PIANO_ROLL_INTERACTION_STATUS.AWAITING_AUTHORITY,
    })

    session.notifyAuthorityRevision(commitRevision)
    expect(session.state).toEqual({
      activeGesture: null,
      movePreview: null,
      pointerId: null,
      resizePreview: null,
      status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
    })
    expect(onStateChange).toHaveBeenCalled()

    unsubscribe()
    session.dispose()
  })

  it.each([
    PIANO_ROLL_INTERACTION_TOOL.CURSOR,
    PIANO_ROLL_INTERACTION_TOOL.PENCIL,
  ])('previews and emits one Note Resize intent with the %s tool', (tool) => {
    const fixture = createFixture(tool)
    const session = createPianoRollInteractionSession()
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId: parseNoteId('editor-note-inside'),
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_START,
      }),
    })
    session.handlePointerInput(begin, fixture.configuration)

    session.handlePointerInput(
      createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 170, yCssPixel: 64 }),
      }),
    )
    expect(session.state).toMatchObject({
      activeGesture: 'note-resize',
      movePreview: null,
      resizePreview: {
        durationTick: 480,
        sourceStartTick: 720,
      },
      status: PIANO_ROLL_INTERACTION_STATUS.RESIZING_NOTE,
    })

    const outcome = session.handlePointerInput(
      createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 170, yCssPixel: 64 }),
      }),
    )

    expect(outcome.intent).toMatchObject({
      gesture: {
        edge: PIANO_ROLL_HIT_ZONE.RESIZE_START,
        note: { id: parseNoteId('editor-note-inside') },
      },
      preview: {
        durationTick: 480,
        sourceStartTick: 720,
      },
      type: PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE,
    })
    expect(session.state.status).toBe(
      PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE,
    )

    session.resolveMoveCommit({
      authorityRevision: fixture.session.modelRevision,
      commitRevision: fixture.session.modelRevision,
    })
    expect(session.state.status).toBe(
      PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE,
    )

    const commitRevision = fixture.session.modelRevision
    session.resolveResizeCommit({
      authorityRevision: (commitRevision - 1) as ModelRevision,
      commitRevision,
    })
    expect(session.state).toMatchObject({
      resizePreview: {
        durationTick: 480,
        sourceStartTick: 720,
      },
      status: PIANO_ROLL_INTERACTION_STATUS.AWAITING_AUTHORITY,
    })

    session.notifyAuthorityRevision(commitRevision)
    expect(session.state).toEqual({
      activeGesture: null,
      movePreview: null,
      pointerId: null,
      resizePreview: null,
      status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
    })

    session.dispose()
  })

  it('treats an edge press below the threshold as a Click rather than Resize', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId: parseNoteId('editor-note-inside'),
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      }),
      originPosition: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
      position: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
    })
    session.handlePointerInput(begin, fixture.configuration)

    const end = createPointerInput({
      ...begin,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    })
    expect(session.handlePointerInput(end)).toEqual({
      failure: null,
      intent: {
        pointerInput: end,
        type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
      },
    })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)

    session.dispose()
  })

  it('does not turn a Pencil edge Click into Note placement', () => {
    const fixture = createFixture(PIANO_ROLL_INTERACTION_TOOL.PENCIL)
    const session = createPianoRollInteractionSession()
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId: parseNoteId('editor-note-inside'),
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      }),
    })
    session.handlePointerInput(begin, fixture.configuration)

    expect(
      session.handlePointerInput(
        createPointerInput({
          ...begin,
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
      ),
    ).toEqual({ failure: null, intent: null })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)

    session.dispose()
  })

  it('cancels an active Note Resize and ignores its later Pointer End', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId: parseNoteId('editor-note-inside'),
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_START,
      }),
    })
    session.handlePointerInput(begin, fixture.configuration)
    const update = createPointerInput({
      ...begin,
      hasExceededDragThreshold: true,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      position: Object.freeze({ xCssPixel: 170, yCssPixel: 64 }),
    })
    session.handlePointerInput(update)
    expect(session.state.status).toBe(
      PIANO_ROLL_INTERACTION_STATUS.RESIZING_NOTE,
    )

    expect(session.cancel()).toBe(true)
    expect(session.state).toEqual({
      activeGesture: null,
      movePreview: null,
      pointerId: null,
      resizePreview: null,
      status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
    })
    expect(
      session.handlePointerInput(
        createPointerInput({
          ...update,
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
      ),
    ).toEqual({ failure: null, intent: null })

    session.dispose()
  })

  it('clears the final Resize Preview when a commit is skipped', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const begin = createPointerInput({
      hit: Object.freeze({
        noteId: parseNoteId('editor-note-inside'),
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_START,
      }),
    })
    session.handlePointerInput(begin, fixture.configuration)
    session.handlePointerInput(
      createPointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 170, yCssPixel: 64 }),
      }),
    )
    expect(session.state.status).toBe(
      PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE,
    )

    session.skipResizeCommit()
    expect(session.state).toEqual({
      activeGesture: null,
      movePreview: null,
      pointerId: null,
      resizePreview: null,
      status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
    })

    session.dispose()
  })

  it('resolves a completed blank Pencil press as one Add Note intent', () => {
    const fixture = createFixture(PIANO_ROLL_INTERACTION_TOOL.PENCIL)
    const session = createPianoRollInteractionSession()
    const begin = createPointerInput({ hit: null })
    session.handlePointerInput(begin, fixture.configuration)

    const outcome = session.handlePointerInput(
      createPointerInput({
        hit: null,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      }),
    )

    expect(outcome).toEqual({
      failure: null,
      intent: {
        placement: {
          clipStartTick: 480,
          pitch: 63,
          requestedDurationTick: 240,
        },
        type: PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE,
      },
    })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)

    session.dispose()
  })

  it('cancels an active press exactly once and ignores its later Pointer End', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    session.handlePointerInput(createPointerInput(), fixture.configuration)

    expect(session.cancel()).toBe(true)
    expect(session.cancel()).toBe(false)
    expect(
      session.handlePointerInput(
        createPointerInput({
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
      ),
    ).toEqual({ failure: null, intent: null })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)

    session.dispose()
  })

  it('does not enter a Move commit state before the viewport is ready', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const configuration = Object.freeze({
      ...fixture.configuration,
      viewport: null,
    })
    session.handlePointerInput(createPointerInput(), configuration)

    const outcome = session.handlePointerInput(
      createPointerInput({
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 370, yCssPixel: 40 }),
      }),
    )

    expect(outcome).toEqual({ failure: null, intent: null })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)

    session.dispose()
  })
})
