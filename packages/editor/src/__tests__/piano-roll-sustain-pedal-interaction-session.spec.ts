import {
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSustainPedalEventId,
  parsePositiveTick,
  parseTick,
  type MidiSustainPedalEventId,
  type ModelRevision,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT,
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS,
  PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS,
  createPianoRollSustainPedalClipLaneReadModel,
  createPianoRollSustainPedalInteractionSession,
  createPianoRollValueLaneViewport,
  createTimelineGrid,
  resolvePianoRollSustainPedalEditingScope,
  type PianoRollPointerInput,
  type PianoRollSustainPedalInteractionConfiguration,
  type PianoRollSustainPedalInteractionState,
  type PianoRollSustainPedalLaneHit,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

const NO_MODIFIERS = Object.freeze({
  alt: false,
  control: false,
  meta: false,
  shift: false,
})

const TEST_CAPTURE_ID = Symbol('test-capture')

function createPointerInput(
  eventId: MidiSustainPedalEventId | null,
  overrides: Partial<PianoRollPointerInput<PianoRollSustainPedalLaneHit>> = {},
): PianoRollPointerInput<PianoRollSustainPedalLaneHit> {
  const originPosition = Object.freeze({ xCssPixel: 360, yCssPixel: 64 })
  return Object.freeze({
    hasExceededDragThreshold: false,
    hit: eventId === null ? null : Object.freeze({ sustainPedalEventId: eventId }),
    modifiers: NO_MODIFIERS,
    originModifiers: NO_MODIFIERS,
    originPosition,
    phase: PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
    pointerId: 11,
    captureId: TEST_CAPTURE_ID,
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

function createFixture(
  tool: PianoRollSustainPedalInteractionConfiguration['tool'] = PIANO_ROLL_INTERACTION_TOOL.CURSOR,
  eventTick = 1200,
) {
  const project = createPianoRollProjectFixture()
  const eventId = parseMidiSustainPedalEventId('cc64-session-anchor')
  project.addSustainPedalEvent({
    eventId,
    tick: parseTick(eventTick),
    value: parseMidiControlValue(80),
  })
  const readModel = createPianoRollSustainPedalClipLaneReadModel({
    channel: parseMidiChannel(0),
    context: project.context,
    snapshot: project.session.getSnapshot(),
  })
  const scope = resolvePianoRollSustainPedalEditingScope({
    context: project.context,
    readModel,
  })
  if (scope === null) throw new Error('Expected an editable CC64 scope')

  const configuration: PianoRollSustainPedalInteractionConfiguration = Object.freeze({
    target: {
      session: project.session,
      baseRevision: readModel.modelRevision,
      channel: readModel.channel,
      activeClipId: readModel.clipId,
      trackId: null,
    },
    grid: createTimelineGrid({
      originTick: parseTick(0),
      subdivisionSpanTick: parsePositiveTick(240),
    }),
    scope,
    selectedEventIds: Object.freeze([eventId]),
    snapEnabled: true,
    tool,
    viewport: createPianoRollValueLaneViewport({
      heightCssPixel: 128,
      visibleSpanTick: parsePositiveTick(1_920),
      visibleStartTick: parseTick(0),
      widthCssPixel: 960,
    }),
  })
  return { configuration, eventId, project, scope }
}

describe('Piano Roll Sustain Pedal Interaction Session', () => {
  it('emits one completed Cursor click as a Selection intent', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()

    expect(
      session.handlePointerInput(createPointerInput(fixture.eventId), fixture.configuration),
    ).toEqual({ failure: null, intent: null })
    expect(session.state).toMatchObject({
      activeAxis: null,
      pointerId: 11,
      status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.PRESSING,
    })

    const end = createPointerInput(fixture.eventId, {
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    })
    const intent = session.handlePointerInput(end).intent
    expect(intent).toMatchObject({
      selectedEventIds: [fixture.eventId],
      type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION,
    })
    if (intent === null) throw new Error('Expected a selection completion')
    expect(session.claimCompletion(intent.interactionId)).toBe(true)
    expect(session.claimCompletion(intent.interactionId)).toBe(false)
    session.finish(intent.interactionId)
    expect(session.state.status).toBe(PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE)
    session.dispose()
  })

  it('previews, emits and hands off one horizontal Move intent to authority', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()
    const onStateChange = vi.fn<(state: PianoRollSustainPedalInteractionState) => void>()
    session.subscribe({ onStateChange })
    session.handlePointerInput(createPointerInput(fixture.eventId), fixture.configuration)

    const drag = createPointerInput(fixture.eventId, {
      hasExceededDragThreshold: true,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      position: Object.freeze({ xCssPixel: 490, yCssPixel: 66 }),
    })
    session.handlePointerInput(drag)
    expect(session.state).toMatchObject({
      activeAxis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
      preview: { deltaTick: 240 },
      status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.MOVING_EVENTS,
    })

    const outcome = session.handlePointerInput(
      createPointerInput(fixture.eventId, {
        ...drag,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      }),
    )
    expect(outcome.intent).toMatchObject({
      gesture: { baseRevision: fixture.scope.modelRevision },
      preview: { deltaTick: 240 },
      type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS,
    })
    expect(session.state.status).toBe(PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_MOVE)
    expect(
      session.handlePointerInput(
        createPointerInput(fixture.eventId, {
          ...drag,
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
      ),
    ).toEqual({ failure: null, intent: null })

    const commitRevision = (fixture.scope.modelRevision + 1) as ModelRevision
    if (outcome.intent === null) throw new Error('Expected a move completion')
    expect(session.claimCompletion(outcome.intent.interactionId)).toBe(true)
    session.resolveCommit({
      interactionId: outcome.intent.interactionId,
      authorityRevision: (commitRevision - 1) as ModelRevision,
      commitRevision,
    })
    expect(session.state).toMatchObject({
      pointerId: null,
      preview: { deltaTick: 240 },
      status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.AWAITING_AUTHORITY,
    })
    session.notifyAuthorityRevision(commitRevision)
    expect(session.state).toEqual({
      interactionId: null,
      activeAxis: null,
      pointerId: null,
      preview: null,
      status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE,
    })
    expect(onStateChange).toHaveBeenCalled()
    session.dispose()
  })

  it('locks the first dominant axis and emits only one Replace Value intent', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()
    session.handlePointerInput(createPointerInput(fixture.eventId), fixture.configuration)

    session.handlePointerInput(
      createPointerInput(fixture.eventId, {
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 362, yCssPixel: 32 }),
      }),
    )
    expect(session.state).toMatchObject({
      activeAxis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
      status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.REPLACING_VALUE,
    })

    const outcome = session.handlePointerInput(
      createPointerInput(fixture.eventId, {
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position: Object.freeze({ xCssPixel: 800, yCssPixel: 30 }),
      }),
    )
    expect(outcome.intent).toMatchObject({
      preview: {
        axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
        eventId: fixture.eventId,
      },
      type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE,
    })
    expect(session.state.status).toBe(PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_VALUE)
    if (outcome.intent === null) throw new Error('Expected a value completion')
    session.finish(outcome.intent.interactionId)
    expect(session.state.status).toBe(PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE)
    session.dispose()
  })

  it('cancels without an intent and ignores the late Pointer Up', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()
    session.handlePointerInput(createPointerInput(fixture.eventId), fixture.configuration)
    session.handlePointerInput(
      createPointerInput(fixture.eventId, {
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
      }),
    )
    expect(session.state.status).toBe(PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE)
    expect(
      session.handlePointerInput(
        createPointerInput(fixture.eventId, {
          hasExceededDragThreshold: true,
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
          position: Object.freeze({ xCssPixel: 490, yCssPixel: 64 }),
        }),
      ),
    ).toEqual({ failure: null, intent: null })
    session.dispose()
  })

  it('keeps Pencil as one blank-click Placement and ignores an existing marker', () => {
    const fixture = createFixture(PIANO_ROLL_INTERACTION_TOOL.PENCIL)
    const session = createPianoRollSustainPedalInteractionSession()
    session.handlePointerInput(createPointerInput(null), fixture.configuration)
    expect(
      session.handlePointerInput(
        createPointerInput(null, {
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
      ).intent,
    ).toMatchObject({
      placement: { timelineTick: 720, value: 64 },
      type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT,
    })

    session.cancel()
    session.handlePointerInput(createPointerInput(fixture.eventId), fixture.configuration)
    expect(
      session.handlePointerInput(
        createPointerInput(fixture.eventId, {
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
      ),
    ).toEqual({ failure: null, intent: null })
    session.dispose()
  })
  it.each([false, true])(
    'rejects an external revision before queued delivery (completed: %s)',
    async (completed) => {
      const fixture = createFixture()
      const session = createPianoRollSustainPedalInteractionSession()
      const begin = createPointerInput(fixture.eventId)
      session.handlePointerInput(begin, fixture.configuration)
      const id = session.state.interactionId
      if (id === null) throw new Error('Expected an interaction')
      const end = { ...begin, phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }
      if (completed) session.handlePointerInput(end)
      fixture.project.session.undo()
      expect(session.handlePointerInput(end).intent).toBeNull()
      expect(session.claimCompletion(id)).toBe(false)
      await Promise.resolve()
      expect(session.state.interactionId).toBeNull()
      session.dispose()
    },
  )

  it('ignores reused Pointer IDs, old completions and old commit replies', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()
    const begin = createPointerInput(fixture.eventId)
    session.handlePointerInput(begin, fixture.configuration)
    const old = session.handlePointerInput({
      ...begin,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    }).intent
    if (old === null) throw new Error('Expected completion')
    session.claimCompletion(old.interactionId)
    session.cancel()
    const current = { ...begin, captureId: Symbol('new-capture') }
    session.handlePointerInput(current, fixture.configuration)
    const id = session.state.interactionId
    expect(
      session.handlePointerInput({ ...begin, phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }).intent,
    ).toBeNull()
    session.resolveCommit({
      interactionId: old.interactionId,
      commitRevision: fixture.scope.modelRevision,
      authorityRevision: fixture.scope.modelRevision,
    })
    session.finish(old.interactionId)
    expect(session.claimCompletion(old.interactionId)).toBe(false)
    expect(session.state.interactionId).toBe(id)
    expect(
      session.handlePointerInput({ ...current, phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }).intent,
    ).not.toBeNull()
    session.dispose()
  })

  it.each(['control', 'meta', 'shift'] as const)(
    'freezes selection and the origin %s key',
    (key) => {
      const fixture = createFixture()
      const selected = [fixture.eventId]
      const session = createPianoRollSustainPedalInteractionSession()
      session.handlePointerInput(
        createPointerInput(fixture.eventId, { originModifiers: { ...NO_MODIFIERS, [key]: true } }),
        { ...fixture.configuration, selectedEventIds: selected },
      )
      selected.length = 0
      expect(
        session.handlePointerInput(
          createPointerInput(fixture.eventId, { phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }),
        ).intent,
      ).toMatchObject({ selectedEventIds: [] })
      session.dispose()
    },
  )

  it('updates Alt bypass dynamically and emits no edit after returning to an off-grid origin', () => {
    const fixture = createFixture('cursor', 1210)
    const session = createPianoRollSustainPedalInteractionSession()
    const begin = createPointerInput(fixture.eventId)
    session.handlePointerInput(begin, fixture.configuration)
    const frame = {
      ...begin,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      hasExceededDragThreshold: true,
      position: { xCssPixel: 490, yCssPixel: 64 },
    }
    session.handlePointerInput(frame)
    expect(session.state.preview).toMatchObject({ deltaTick: 230 })
    session.handlePointerInput({ ...frame, modifiers: { ...NO_MODIFIERS, alt: true } })
    expect(session.state.preview).toMatchObject({ deltaTick: 260 })
    expect(
      session.handlePointerInput({
        ...begin,
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      }).intent,
    ).toBeNull()
    expect(session.state.interactionId).toBeNull()
    session.dispose()
  })

  it('accepts projection before the matching commit reply', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()
    const begin = createPointerInput(fixture.eventId)
    session.handlePointerInput(begin, fixture.configuration)
    const intent = session.handlePointerInput({
      ...begin,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      hasExceededDragThreshold: true,
      position: { xCssPixel: 490, yCssPixel: 64 },
    }).intent
    if (intent === null) throw new Error('Expected completion')
    session.claimCompletion(intent.interactionId)
    const revision = (fixture.scope.modelRevision + 1) as ModelRevision
    session.notifyAuthorityRevision(revision)
    expect(session.state.preview).not.toBeNull()
    session.resolveCommit({
      interactionId: intent.interactionId,
      commitRevision: revision,
      authorityRevision: fixture.scope.modelRevision,
    })
    expect(session.state.preview).toBeNull()
    session.dispose()
  })

  it('cleans up a failed subscriber and cannot later complete', () => {
    const fixture = createFixture()
    const session = createPianoRollSustainPedalInteractionSession()
    const onStateChange = vi.fn<(state: PianoRollSustainPedalInteractionState) => void>()
    const failure = new Error('Preview failed')
    session.subscribe({ onStateChange })
    session.subscribe({
      onStateChange: () => {
        throw failure
      },
    })
    expect(
      session.handlePointerInput(createPointerInput(fixture.eventId), fixture.configuration)
        .failure,
    ).toBe(failure)
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ interactionId: null }))
    expect(
      session.handlePointerInput(
        createPointerInput(fixture.eventId, { phase: PIANO_ROLL_POINTER_INPUT_PHASE.END }),
      ).intent,
    ).toBeNull()
    session.dispose()
    session.dispose()
  })
})
