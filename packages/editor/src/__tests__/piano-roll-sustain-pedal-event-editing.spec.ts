import {
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSustainPedalEventId,
  parsePositiveTick,
  parseTick,
  type MidiSustainPedalEventId,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS,
  PianoRollError,
  createPianoRollSustainPedalClipLaneReadModel,
  createPianoRollSustainPedalTransformGesture,
  createPianoRollTrackSustainPedalLaneReadModel,
  createPianoRollValueLaneViewport,
  createTimelineGrid,
  reconcilePianoRollSustainPedalSelection,
  resolvePianoRollSustainPedalEditingScope,
  resolvePianoRollSustainPedalRemoval,
  resolvePianoRollSustainPedalSelection,
  resolvePianoRollSustainPedalTransformAxis,
  resolvePianoRollSustainPedalTransformPreview,
  type PianoRollPointerInput,
  type PianoRollSustainPedalEditingScope,
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
    pointerId: 7,
    pointerType: 'mouse',
    position: originPosition,
    ...overrides,
  })
}

function createFixture() {
  const project = createPianoRollProjectFixture()
  const earlyEventId = parseMidiSustainPedalEventId('cc64-edit-early')
  const anchorEventId = parseMidiSustainPedalEventId('cc64-edit-anchor')
  const terminalEventId = parseMidiSustainPedalEventId('cc64-edit-terminal')
  project.addSustainPedalEvent({
    eventId: earlyEventId,
    tick: parseTick(720),
    value: parseMidiControlValue(32),
  })
  project.addSustainPedalEvent({
    eventId: anchorEventId,
    tick: parseTick(1_200),
    value: parseMidiControlValue(96),
  })
  project.addSustainPedalEvent({
    eventId: terminalEventId,
    tick: parseTick(2_400),
    value: parseMidiControlValue(0),
  })

  const clipReadModel = createPianoRollSustainPedalClipLaneReadModel({
    channel: parseMidiChannel(0),
    context: project.context,
    snapshot: project.session.getSnapshot(),
  })
  const scope = resolvePianoRollSustainPedalEditingScope({
    context: project.context,
    readModel: clipReadModel,
  })
  if (scope === null) throw new Error('Expected an editable CC64 Clip scope')

  return {
    anchorEventId,
    clipReadModel,
    earlyEventId,
    project,
    scope,
    terminalEventId,
  }
}

function createTransformConfiguration() {
  return {
    grid: createTimelineGrid({
      originTick: parseTick(0),
      subdivisionSpanTick: parsePositiveTick(240),
    }),
    snapEnabled: true,
    viewport: createPianoRollValueLaneViewport({
      heightCssPixel: 128,
      visibleSpanTick: parsePositiveTick(1_920),
      visibleStartTick: parseTick(0),
      widthCssPixel: 960,
    }),
  }
}

function requireGesture(
  scope: PianoRollSustainPedalEditingScope,
  anchorEventId: MidiSustainPedalEventId,
  selectedEventIds: readonly MidiSustainPedalEventId[],
) {
  const gesture = createPianoRollSustainPedalTransformGesture({
    pointerInput: createPointerInput(anchorEventId),
    scope,
    selectedEventIds,
  })
  if (gesture === null) throw new Error('Expected a CC64 transform gesture')
  return gesture
}

describe('Piano Roll Sustain Pedal editing scope', () => {
  it('resolves Clip-local and active Track scopes without guessing a Clip', () => {
    const fixture = createFixture()
    expect(fixture.scope).toMatchObject({
      channel: 0,
      clipId: fixture.project.clip.id,
      sourceId: fixture.project.source.id,
      timelineEndTick: 1_920,
      timelineStartTick: 0,
    })
    expect(Object.isFrozen(fixture.scope)).toBe(true)
    expect(Object.isFrozen(fixture.scope.events)).toBe(true)

    const trackReadModel = createPianoRollTrackSustainPedalLaneReadModel({
      activeClipId: fixture.project.clip.id,
      channel: parseMidiChannel(0),
      snapshot: fixture.project.session.getSnapshot(),
      trackId: fixture.project.clip.trackId,
    })
    expect(resolvePianoRollSustainPedalEditingScope({ readModel: trackReadModel })).toMatchObject({
      clipId: fixture.project.clip.id,
      sourceId: fixture.project.source.id,
    })
    expect(
      resolvePianoRollSustainPedalEditingScope({
        readModel: createPianoRollTrackSustainPedalLaneReadModel({
          activeClipId: null,
          channel: parseMidiChannel(0),
          snapshot: fixture.project.session.getSnapshot(),
          trackId: fixture.project.clip.trackId,
        }),
      }),
    ).toBeNull()
  })

  it('fails closed when a Clip read model is paired with another context', () => {
    const fixture = createFixture()
    const forgedContext = Object.freeze({
      ...fixture.project.context,
      sourceId: fixture.project.source.id.replace(
        'source',
        'other-source',
      ) as typeof fixture.project.source.id,
    })

    expect(() =>
      resolvePianoRollSustainPedalEditingScope({
        context: forgedContext,
        readModel: fixture.clipReadModel,
      }),
    ).toThrowError(PianoRollError)
  })
})

describe('Piano Roll Sustain Pedal selection and removal', () => {
  it('selects, modifier-toggles, clears and reconciles stable Event IDs', () => {
    const fixture = createFixture()
    const selected = resolvePianoRollSustainPedalSelection({
      pointerInput: createPointerInput(fixture.anchorEventId, {
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      }),
      scope: fixture.scope,
      selectedEventIds: [],
    })
    expect(selected).toEqual({
      changed: true,
      selectedEventIds: [fixture.anchorEventId],
    })

    const toggled = resolvePianoRollSustainPedalSelection({
      pointerInput: createPointerInput(fixture.earlyEventId, {
        originModifiers: Object.freeze({ ...NO_MODIFIERS, shift: true }),
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
      }),
      scope: fixture.scope,
      selectedEventIds: selected?.selectedEventIds ?? [],
    })
    expect(toggled?.selectedEventIds).toEqual([fixture.anchorEventId, fixture.earlyEventId])
    expect(
      reconcilePianoRollSustainPedalSelection(fixture.scope, [
        fixture.anchorEventId,
        parseMidiSustainPedalEventId('stale-event'),
        fixture.anchorEventId,
      ]),
    ).toEqual([fixture.anchorEventId])

    expect(
      resolvePianoRollSustainPedalSelection({
        pointerInput: createPointerInput(null, {
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
        scope: fixture.scope,
        selectedEventIds: toggled?.selectedEventIds ?? [],
      }),
    ).toEqual({ changed: true, selectedEventIds: [] })
  })

  it('ignores drag and inactive hits, then freezes one removal target', () => {
    const fixture = createFixture()
    expect(
      resolvePianoRollSustainPedalSelection({
        pointerInput: createPointerInput(fixture.anchorEventId, {
          hasExceededDragThreshold: true,
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
        scope: fixture.scope,
        selectedEventIds: [],
      }),
    ).toBeNull()
    expect(
      resolvePianoRollSustainPedalSelection({
        pointerInput: createPointerInput(parseMidiSustainPedalEventId('inactive-event'), {
          phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
        }),
        scope: fixture.scope,
        selectedEventIds: [],
      }),
    ).toBeNull()

    const removal = resolvePianoRollSustainPedalRemoval(fixture.scope, [
      fixture.earlyEventId,
      fixture.anchorEventId,
    ])
    expect(removal).toMatchObject({
      baseRevision: fixture.scope.modelRevision,
      clipId: fixture.scope.clipId,
      eventIds: [fixture.earlyEventId, fixture.anchorEventId],
      sourceId: fixture.scope.sourceId,
    })
    expect(Object.isFrozen(removal)).toBe(true)
    expect(resolvePianoRollSustainPedalRemoval(fixture.scope, [])).toBeNull()
  })
})

describe('Piano Roll Sustain Pedal event transform', () => {
  it('captures a selected group and resolves absolute Grid-snapped horizontal movement', () => {
    const fixture = createFixture()
    const gesture = requireGesture(fixture.scope, fixture.anchorEventId, [
      fixture.earlyEventId,
      fixture.anchorEventId,
    ])
    const pointerInput = createPointerInput(fixture.anchorEventId, {
      hasExceededDragThreshold: true,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      position: Object.freeze({ xCssPixel: 490, yCssPixel: 66 }),
    })

    expect(resolvePianoRollSustainPedalTransformAxis(gesture, pointerInput)).toBe(
      PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
    )
    expect(
      resolvePianoRollSustainPedalTransformPreview({
        axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
        gesture,
        pointerInput,
        ...createTransformConfiguration(),
      }),
    ).toEqual({
      axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
      deltaTick: 240,
      eventIds: [fixture.earlyEventId, fixture.anchorEventId],
      events: [
        { eventId: fixture.earlyEventId, timelineTick: 480, value: 32 },
        { eventId: fixture.anchorEventId, timelineTick: 960, value: 96 },
      ],
    })
    expect(gesture.baseRevision).toBe(fixture.scope.modelRevision)
    expect(gesture.selectOnlyOnMoveCommit).toBe(false)
  })

  it('uses dynamic Alt for free time movement and clamps the selected group to Source bounds', () => {
    const fixture = createFixture()
    const gesture = requireGesture(fixture.scope, fixture.anchorEventId, [
      fixture.earlyEventId,
      fixture.anchorEventId,
    ])
    const freePreview = resolvePianoRollSustainPedalTransformPreview({
      axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
      gesture,
      pointerInput: createPointerInput(fixture.anchorEventId, {
        hasExceededDragThreshold: true,
        modifiers: Object.freeze({ ...NO_MODIFIERS, alt: true }),
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: 460, yCssPixel: 64 }),
      }),
      ...createTransformConfiguration(),
    })
    expect(freePreview).toMatchObject({ deltaTick: 200 })

    const boundedPreview = resolvePianoRollSustainPedalTransformPreview({
      axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
      gesture,
      pointerInput: createPointerInput(fixture.anchorEventId, {
        hasExceededDragThreshold: true,
        phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position: Object.freeze({ xCssPixel: -10_000, yCssPixel: 64 }),
      }),
      ...createTransformConfiguration(),
    })
    expect(boundedPreview).toMatchObject({ deltaTick: -720 })
    expect(boundedPreview?.events).toEqual([
      { eventId: fixture.anchorEventId, timelineTick: 0, value: 96 },
    ])
  })

  it('locks equal movement to Value and applies vertical delta without a grab jump', () => {
    const fixture = createFixture()
    const gesture = requireGesture(fixture.scope, fixture.anchorEventId, [
      fixture.earlyEventId,
      fixture.anchorEventId,
    ])
    const unchangedInput = createPointerInput(fixture.anchorEventId, {
      hasExceededDragThreshold: true,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      position: Object.freeze({ xCssPixel: 360, yCssPixel: 64 }),
    })
    expect(
      resolvePianoRollSustainPedalTransformPreview({
        axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
        gesture,
        pointerInput: unchangedInput,
        ...createTransformConfiguration(),
      }),
    ).toMatchObject({ value: 96 })

    const raisedInput = createPointerInput(fixture.anchorEventId, {
      hasExceededDragThreshold: true,
      phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      position: Object.freeze({ xCssPixel: 392, yCssPixel: 32 }),
    })
    expect(resolvePianoRollSustainPedalTransformAxis(gesture, raisedInput)).toBe(
      PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
    )
    expect(
      resolvePianoRollSustainPedalTransformPreview({
        axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
        gesture,
        pointerInput: raisedInput,
        ...createTransformConfiguration(),
      }),
    ).toEqual({
      axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
      eventId: fixture.anchorEventId,
      events: [{ eventId: fixture.anchorEventId, timelineTick: 720, value: 127 }],
      value: 127,
    })
    expect(gesture.selectOnlyOnValueCommit).toBe(true)
  })
})
