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
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

function createFixture(
  tool: PianoRollSustainPedalInteractionConfiguration['tool'] = PIANO_ROLL_INTERACTION_TOOL.CURSOR,
) {
  const project = createPianoRollProjectFixture()
  const eventId = parseMidiSustainPedalEventId('cc64-session-anchor')
  project.addSustainPedalEvent({
    eventId,
    tick: parseTick(1_200),
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
    expect(session.handlePointerInput(end)).toEqual({
      failure: null,
      intent: {
        pointerInput: end,
        type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION,
      },
    })
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

    const commitRevision = fixture.scope.modelRevision
    session.resolveTransformCommit({
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
    session.skipTransformCommit()
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
})
