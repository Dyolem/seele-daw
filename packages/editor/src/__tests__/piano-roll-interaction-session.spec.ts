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

const TEST_CAPTURE_ID = Symbol('test-capture')

function createPointerInput(overrides: Partial<PianoRollPointerInput> = {}): PianoRollPointerInput {
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
    captureId: TEST_CAPTURE_ID,
    pointerId: 1,
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

function createFixture(tool: PianoRollInteractionTool = PIANO_ROLL_INTERACTION_TOOL.CURSOR) {
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
  it.each([{ pitchOffsetCssPixel: 1 }, { pitchRowHeightCssPixel: 20 }])(
    'cancels capture when pitch geometry changes without resizing the surface: %o',
    (change) => {
      const fixture = createFixture()
      const session = createPianoRollInteractionSession()
      session.handlePointerInput(createPointerInput(), fixture.configuration)
      session.notifyViewport(
        createPianoRollViewport(fixture.context, { ...fixture.configuration.viewport!, ...change }),
      )
      expect(session.state.pointerId).toBeNull()
      expect(
        session.handlePointerInput(
          createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }),
        ).intent,
      ).toBeNull()
      session.dispose()
    },
  )
  it('resolves a completed Cursor press as one Selection intent', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()

    expect(session.handlePointerInput(createPointerInput(), fixture.configuration)).toEqual({
      failure: null,
      intent: null,
    })
    expect(session.state).toMatchObject({
      activeGesture: 'note-move',
      status: PIANO_ROLL_INTERACTION_STATUS.PRESSING,
    })

    const end = createPointerInput({
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    })
    const outcome = session.handlePointerInput(end)

    expect(outcome).toMatchObject({
      failure: null,
      intent: {
        selection: { noteId: end.hit?.noteId, toggleSelection: false },
        type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
      },
    })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMPLETING)
    session.finish(outcome.intent!.interactionId)
    expect(session.state).toMatchObject({
      interactionId: null,
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
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_MOVE)

    const commitRevision = (fixture.session.modelRevision + 1) as ModelRevision
    expect(session.claimCompletion(outcome.intent!.interactionId)).toBe(true)
    session.resolveCommit({
      interactionId: outcome.intent!.interactionId,
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
    expect(session.state).toMatchObject({
      interactionId: null,
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

  it.each([PIANO_ROLL_INTERACTION_TOOL.CURSOR, PIANO_ROLL_INTERACTION_TOOL.PENCIL])(
    'previews and emits one Note Resize intent with the %s tool',
    (tool) => {
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
      expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE)

      session.resolveCommit({
        interactionId: Symbol('stale-interaction'),
        authorityRevision: fixture.session.modelRevision,
        commitRevision: fixture.session.modelRevision,
      })
      expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE)

      const commitRevision = (fixture.session.modelRevision + 1) as ModelRevision
      expect(session.claimCompletion(outcome.intent!.interactionId)).toBe(true)
      session.resolveCommit({
        interactionId: outcome.intent!.interactionId,
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
      expect(session.state).toMatchObject({
        activeGesture: null,
        movePreview: null,
        pointerId: null,
        resizePreview: null,
        status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
      })

      session.dispose()
    },
  )

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
    const outcome = session.handlePointerInput(end)
    expect(outcome).toMatchObject({
      failure: null,
      intent: {
        selection: { noteId: end.hit?.noteId, toggleSelection: false },
        type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
      },
    })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMPLETING)
    session.finish(outcome.intent!.interactionId)
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
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.RESIZING_NOTE)

    expect(session.cancel()).toBe(true)
    expect(session.state).toMatchObject({
      interactionId: null,
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
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE)

    session.finish(session.state.interactionId!)
    expect(session.state).toMatchObject({
      interactionId: null,
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

    expect(outcome).toMatchObject({
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
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.COMPLETING)
    session.finish(outcome.intent!.interactionId)
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

    expect(outcome).toMatchObject({ failure: null, intent: null })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)

    session.dispose()
  })
  it('freezes the Begin tool, grid, selection, hit and anchor throughout Note Move', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const selectedNoteIds = [...fixture.configuration.selectedNoteIds]
    const configuration = {
      ...fixture.configuration,
      grid: { ...fixture.configuration.grid },
      selectedNoteIds,
    }
    const originPosition = { xCssPixel: 240, yCssPixel: 64 }
    const begin = { ...createPointerInput(), originPosition }
    session.handlePointerInput(begin, configuration)
    const interactionId = session.state.interactionId
    selectedNoteIds.length = 0
    configuration.tool = PIANO_ROLL_INTERACTION_TOOL.PENCIL
    configuration.snapEnabled = false
    configuration.grid.subdivisionSpanTick = parsePositiveTick(120)
    originPosition.xCssPixel = 800
    const outcome = session.handlePointerInput(
      createPointerInput({
        hit: null,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: { xCssPixel: 370, yCssPixel: 40 },
      }),
    )
    expect(outcome.intent).toMatchObject({
      interactionId,
      target: {
        session: fixture.session,
        context: fixture.context,
        baseRevision: fixture.session.modelRevision,
      },
      type: PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES,
      preview: {
        deltaTick: 240,
        deltaPitch: 2,
        movedNoteIds: fixture.configuration.selectedNoteIds,
      },
    })
    session.dispose()
  })

  it('recomputes bypassSnap from current modifiers without moving the Pointer', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    session.handlePointerInput(createPointerInput(), fixture.configuration)
    const input = createPointerInput({
      hasExceededDragThreshold: true,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      position: { xCssPixel: 370, yCssPixel: 64 },
    })
    session.handlePointerInput(input)
    expect(session.state.movePreview?.deltaTick).toBe(240)
    session.handlePointerInput({ ...input, modifiers: { ...NO_MODIFIERS, alt: true } })
    expect(session.state.movePreview?.deltaTick).toBe(260)
    session.handlePointerInput(input)
    expect(session.state.movePreview?.deltaTick).toBe(240)
    session.dispose()
  })

  it('ignores a late End and Cancel when the browser reuses the physical Pointer ID', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const previous = createPointerInput()
    session.handlePointerInput(previous, fixture.configuration)
    session.cancel()
    const current = { ...previous, captureId: Symbol('next-capture') }
    session.handlePointerInput(current, fixture.configuration)
    const interactionId = session.state.interactionId
    for (const phase of [
      PIANO_ROLL_POINTER_INPUT_PHASE.END,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
    ]) {
      expect(session.handlePointerInput({ ...previous, phase }).intent).toBeNull()
      expect(session.state.interactionId).toBe(interactionId)
    }
    expect(
      session.handlePointerInput({ ...current, phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }).intent,
    ).not.toBeNull()
    session.dispose()
  })

  it('does not let an old commit reply clear a newer completion', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const end = createPointerInput({
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      hasExceededDragThreshold: true,
      position: { xCssPixel: 370, yCssPixel: 40 },
    })
    session.handlePointerInput(createPointerInput(), fixture.configuration)
    const first = session.handlePointerInput(end).intent!
    expect(session.claimCompletion(first.interactionId)).toBe(true)
    const commitRevision = (fixture.session.modelRevision + 1) as ModelRevision
    session.resolveCommit({
      interactionId: first.interactionId,
      authorityRevision: fixture.session.modelRevision,
      commitRevision,
    })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.AWAITING_AUTHORITY)
    session.handlePointerInput(
      createPointerInput({ captureId: Symbol('new-capture') }),
      fixture.configuration,
    )
    const currentId = session.state.interactionId
    session.resolveCommit({
      interactionId: first.interactionId,
      authorityRevision: commitRevision,
      commitRevision,
    })
    session.finish(first.interactionId)
    expect(session.claimCompletion(first.interactionId)).toBe(false)
    expect(session.state).toMatchObject({
      interactionId: currentId,
      status: PIANO_ROLL_INTERACTION_STATUS.PRESSING,
    })
    session.dispose()
  })

  it('accepts the authoritative projection arriving before its matching commit reply', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    session.handlePointerInput(createPointerInput(), fixture.configuration)
    const intent = session.handlePointerInput(
      createPointerInput({
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        hasExceededDragThreshold: true,
        position: { xCssPixel: 370, yCssPixel: 40 },
      }),
    ).intent!
    session.claimCompletion(intent.interactionId)
    const commitRevision = (fixture.session.modelRevision + 1) as ModelRevision
    session.notifyAuthorityRevision(commitRevision)
    expect(session.state.movePreview).not.toBeNull()
    session.resolveCommit({
      interactionId: intent.interactionId,
      authorityRevision: fixture.session.modelRevision,
      commitRevision,
    })
    expect(session.state).toMatchObject({
      interactionId: null,
      movePreview: null,
      status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
    })
    session.dispose()
  })

  it.each([false, true])(
    'invalidates unclaimed input on an external Project commit (completed: %s)',
    async (completed) => {
      const fixture = createFixture()
      const session = createPianoRollInteractionSession()
      session.handlePointerInput(createPointerInput(), fixture.configuration)
      const interactionId = session.state.interactionId!
      const end = createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.END })
      if (completed) session.handlePointerInput(end)
      fixture.session.undo()
      // Project publication is queued: the synchronous revision guard must already reject End.
      expect(session.handlePointerInput(end).intent).toBeNull()
      expect(session.claimCompletion(interactionId)).toBe(false)
      await Promise.resolve()
      expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)
      expect(session.claimCompletion(interactionId)).toBe(false)
      expect(session.handlePointerInput(end).intent).toBeNull()
      session.dispose()
    },
  )

  it('cancels Note mapping changes while allowing an equivalent viewport projection', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    session.handlePointerInput(createPointerInput(), fixture.configuration)
    const viewport = fixture.configuration.viewport!
    session.notifyViewport({ ...viewport })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.PRESSING)
    session.notifyViewport({ ...viewport, widthCssPixel: viewport.widthCssPixel + 1 })
    expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)
    expect(
      session.handlePointerInput(createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }))
        .intent,
    ).toBeNull()
    session.dispose()
  })

  it.each([PIANO_ROLL_HIT_ZONE.BODY, PIANO_ROLL_HIT_ZONE.RESIZE_END])(
    'emits no command intent when a %s drag returns to its origin',
    (zone) => {
      const fixture = createFixture()
      const session = createPianoRollInteractionSession()
      const begin = createPointerInput({ hit: { zone, noteId: parseNoteId('editor-note-inside') } })
      session.handlePointerInput(begin, fixture.configuration)
      session.handlePointerInput({
        ...begin,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        hasExceededDragThreshold: true,
        position: { xCssPixel: 370, yCssPixel: 40 },
      })
      const outcome = session.handlePointerInput({
        ...begin,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        hasExceededDragThreshold: true,
      })
      expect(outcome).toEqual({ failure: null, intent: null })
      expect(session.state.status).toBe(PIANO_ROLL_INTERACTION_STATUS.IDLE)
      session.dispose()
    },
  )

  it('closes input and clears healthy projections when an observer fails', () => {
    const fixture = createFixture()
    const session = createPianoRollInteractionSession()
    const failure = new Error('Broken preview consumer')
    const onStateChange = vi.fn<(state: PianoRollInteractionState) => void>()
    session.subscribe({ onStateChange })
    session.subscribe({
      onStateChange: () => {
        throw failure
      },
    })
    expect(session.handlePointerInput(createPointerInput(), fixture.configuration)).toEqual({
      failure,
      intent: null,
    })
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ interactionId: null, status: PIANO_ROLL_INTERACTION_STATUS.IDLE }),
    )
    expect(
      session.handlePointerInput(createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }))
        .intent,
    ).toBeNull()
    session.dispose()
  })
  it.each(['control', 'meta', 'shift'] as const)(
    'resolves toggleSelection from Begin %s after its key is released',
    (modifier) => {
      const fixture = createFixture()
      const session = createPianoRollInteractionSession()
      const begin = createPointerInput({ originModifiers: { ...NO_MODIFIERS, [modifier]: true } })
      session.handlePointerInput(begin, fixture.configuration)
      const outcome = session.handlePointerInput(
        createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }),
      )
      expect(outcome.intent).toMatchObject({
        type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
        selection: { noteId: begin.hit!.noteId, toggleSelection: true },
      })
      session.dispose()
    },
  )

  it.each([PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE, PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL])(
    'does not produce a Selection result from %s',
    (phase) => {
      const fixture = createFixture()
      const session = createPianoRollInteractionSession()
      session.handlePointerInput(createPointerInput(), fixture.configuration)
      expect(session.handlePointerInput(createPointerInput({ phase })).intent).toBeNull()
      session.dispose()
    },
  )
})
