import {
  MIDI_CONTROL_VALUE_MAX,
  MIDI_CONTROL_VALUE_MIN,
  parseMidiControlValue,
  parseTick,
  parseTickDelta,
  type MidiControlValue,
  type MidiSustainPedalEventId,
  type Tick,
  type TickDelta,
} from '@seele-daw/project-core'

import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollCssPoint,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollSustainPedalEditingScope } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-editing-scope'
import { reconcilePianoRollSustainPedalSelection } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-event-selection'
import type { PianoRollSustainPedalLaneHit } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-lane-input'
import type { PianoRollSustainPedalLaneEventProjection } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-lane-read-model'
import type { PianoRollValueLaneViewport } from '#internal/common/piano-roll/value-lane/piano-roll-value-lane-viewport'
import type { TimelineGrid } from '#internal/common/timeline-grid'

export const PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS = {
  TICK: 'tick',
  VALUE: 'value',
} as const

export type PianoRollSustainPedalTransformAxis =
  (typeof PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS)[keyof typeof PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS]

export interface PianoRollSustainPedalTransformGesture {
  readonly anchorEvent: PianoRollSustainPedalLaneEventProjection
  readonly baseRevision: PianoRollSustainPedalEditingScope['modelRevision']
  readonly moveEventIds: readonly MidiSustainPedalEventId[]
  readonly moveEvents: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly originPosition: PianoRollCssPoint
  readonly pointerId: number
  readonly scope: PianoRollSustainPedalEditingScope
  readonly selectOnlyOnMoveCommit: boolean
  readonly selectOnlyOnValueCommit: boolean
}

export interface PianoRollSustainPedalPreviewEvent {
  readonly eventId: MidiSustainPedalEventId
  readonly timelineTick: Tick
  readonly value: MidiControlValue
}

export interface PianoRollSustainPedalMovePreview {
  readonly axis: typeof PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK
  readonly deltaTick: TickDelta
  readonly eventIds: readonly MidiSustainPedalEventId[]
  readonly events: readonly PianoRollSustainPedalPreviewEvent[]
}

export interface PianoRollSustainPedalValuePreview {
  readonly axis: typeof PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE
  readonly eventId: MidiSustainPedalEventId
  readonly events: readonly PianoRollSustainPedalPreviewEvent[]
  readonly value: MidiControlValue
}

export type PianoRollSustainPedalTransformPreview =
  | PianoRollSustainPedalMovePreview
  | PianoRollSustainPedalValuePreview

export interface CreatePianoRollSustainPedalTransformGestureInput {
  readonly pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>
  readonly scope: PianoRollSustainPedalEditingScope | null
  readonly selectedEventIds: readonly MidiSustainPedalEventId[]
}

export interface ResolvePianoRollSustainPedalTransformPreviewInput {
  readonly axis: PianoRollSustainPedalTransformAxis
  readonly gesture: PianoRollSustainPedalTransformGesture
  readonly grid: TimelineGrid
  readonly pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>
  readonly snapEnabled: boolean
  readonly viewport: PianoRollValueLaneViewport
}

function requireFiniteDelta(value: number, axis: 'horizontal' | 'vertical'): number {
  if (!Number.isFinite(value)) {
    throw new PianoRollError(
      'invalid-sustain-pedal-gesture',
      `Sustain Pedal ${axis} pointer delta must be finite`,
    )
  }
  return value
}

function isTransformFrame(
  gesture: PianoRollSustainPedalTransformGesture,
  pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
): boolean {
  return (
    (pointerInput.phase === PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE ||
      pointerInput.phase === PIANO_ROLL_POINTER_INPUT_PHASE.END) &&
    pointerInput.hasExceededDragThreshold &&
    pointerInput.pointerId === gesture.pointerId
  )
}

/** Captures authoritative event facts and the current selection at Pointer Down. */
export function createPianoRollSustainPedalTransformGesture(
  input: CreatePianoRollSustainPedalTransformGestureInput,
): PianoRollSustainPedalTransformGesture | null {
  const pointerInput = input.pointerInput
  const scope = input.scope
  if (
    scope === null ||
    pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN ||
    pointerInput.hit === null
  ) {
    return null
  }

  const anchorEvent = scope.events.find(
    ({ event }) => event.id === pointerInput.hit?.sustainPedalEventId,
  )
  if (anchorEvent === undefined) return null

  const selectedEventIds = reconcilePianoRollSustainPedalSelection(scope, input.selectedEventIds)
  const anchorWasSelected = selectedEventIds.includes(anchorEvent.event.id)
  const moveEventIds = anchorWasSelected ? selectedEventIds : [anchorEvent.event.id]
  const moveEvents = moveEventIds.map((eventId) => {
    const projection = scope.events.find(({ event }) => event.id === eventId)
    if (projection === undefined) {
      throw new PianoRollError(
        'invalid-sustain-pedal-gesture',
        `Sustain Pedal selection references non-editable Event ${eventId}`,
      )
    }
    return projection
  })

  return Object.freeze({
    anchorEvent,
    baseRevision: scope.modelRevision,
    moveEventIds: Object.freeze([...moveEventIds]),
    moveEvents: Object.freeze(moveEvents),
    originPosition: pointerInput.originPosition,
    pointerId: pointerInput.pointerId,
    scope,
    selectOnlyOnMoveCommit: !anchorWasSelected,
    selectOnlyOnValueCommit:
      selectedEventIds.length !== 1 || selectedEventIds[0] !== anchorEvent.event.id,
  })
}

/** Chooses one dominant axis once the shared Pointer threshold has been crossed. */
export function resolvePianoRollSustainPedalTransformAxis(
  gesture: PianoRollSustainPedalTransformGesture,
  pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
): PianoRollSustainPedalTransformAxis | null {
  if (!isTransformFrame(gesture, pointerInput)) return null
  const deltaX = requireFiniteDelta(
    pointerInput.position.xCssPixel - gesture.originPosition.xCssPixel,
    'horizontal',
  )
  const deltaY = requireFiniteDelta(
    pointerInput.position.yCssPixel - gesture.originPosition.yCssPixel,
    'vertical',
  )
  return Math.abs(deltaX) > Math.abs(deltaY)
    ? PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK
    : PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function resolveMoveDelta(input: ResolvePianoRollSustainPedalTransformPreviewInput): TickDelta {
  const gesture = input.gesture
  const pointerDeltaCssPixel = requireFiniteDelta(
    input.pointerInput.position.xCssPixel - gesture.originPosition.xCssPixel,
    'horizontal',
  )
  const rawDelta =
    (pointerDeltaCssPixel / input.viewport.widthCssPixel) * input.viewport.visibleSpanTick
  const minimumDelta = Math.max(...gesture.moveEvents.map(({ event }) => -event.tick))
  const maximumDelta = Math.min(
    ...gesture.moveEvents.map(({ event }) => gesture.scope.context.sourceLengthTick - event.tick),
  )
  const boundedRawDelta = clamp(rawDelta, minimumDelta, maximumDelta)

  let candidateDelta: number
  if (!input.snapEnabled || input.pointerInput.modifiers.alt) {
    candidateDelta = Math.round(boundedRawDelta)
  } else {
    const rawTargetTick = gesture.anchorEvent.timelineTick + boundedRawDelta
    const subdivisionIndex = Math.round(
      (rawTargetTick - input.grid.originTick) / input.grid.subdivisionSpanTick,
    )
    const snappedTargetTick =
      input.grid.originTick + subdivisionIndex * input.grid.subdivisionSpanTick
    candidateDelta = snappedTargetTick - gesture.anchorEvent.timelineTick
  }

  return parseTickDelta(clamp(candidateDelta, minimumDelta, maximumDelta))
}

function createVisibleMovePreviewEvents(
  gesture: PianoRollSustainPedalTransformGesture,
  deltaTick: TickDelta,
): readonly PianoRollSustainPedalPreviewEvent[] {
  const scope = gesture.scope
  return Object.freeze(
    gesture.moveEvents.flatMap(({ event }) => {
      const sourceTick = event.tick + deltaTick
      if (sourceTick < scope.context.sourceStartTick || sourceTick > scope.context.sourceEndTick) {
        return []
      }
      return [
        Object.freeze({
          eventId: event.id,
          timelineTick: parseTick(
            scope.timelineStartTick + sourceTick - scope.context.sourceStartTick,
          ),
          value: event.value,
        }),
      ]
    }),
  )
}

function resolveMovePreview(
  input: ResolvePianoRollSustainPedalTransformPreviewInput,
): PianoRollSustainPedalMovePreview {
  const deltaTick = resolveMoveDelta(input)
  return Object.freeze({
    axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK,
    deltaTick,
    eventIds: input.gesture.moveEventIds,
    events: createVisibleMovePreviewEvents(input.gesture, deltaTick),
  })
}

function resolveValuePreview(
  input: ResolvePianoRollSustainPedalTransformPreviewInput,
): PianoRollSustainPedalValuePreview {
  const gesture = input.gesture
  const pointerDeltaCssPixel = requireFiniteDelta(
    gesture.originPosition.yCssPixel - input.pointerInput.position.yCssPixel,
    'vertical',
  )
  const rawDelta =
    (pointerDeltaCssPixel / input.viewport.heightCssPixel) *
    (MIDI_CONTROL_VALUE_MAX - MIDI_CONTROL_VALUE_MIN)
  const value = parseMidiControlValue(
    clamp(
      gesture.anchorEvent.event.value + Math.round(rawDelta),
      MIDI_CONTROL_VALUE_MIN,
      MIDI_CONTROL_VALUE_MAX,
    ),
  )
  const previewEvent = Object.freeze({
    eventId: gesture.anchorEvent.event.id,
    timelineTick: gesture.anchorEvent.timelineTick,
    value,
  })

  return Object.freeze({
    axis: PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.VALUE,
    eventId: gesture.anchorEvent.event.id,
    events: Object.freeze([previewEvent]),
    value,
  })
}

/** Resolves one drag frame into a discardable horizontal or vertical CC64 preview. */
export function resolvePianoRollSustainPedalTransformPreview(
  input: ResolvePianoRollSustainPedalTransformPreviewInput,
): PianoRollSustainPedalTransformPreview | null {
  if (!isTransformFrame(input.gesture, input.pointerInput)) return null
  return input.axis === PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK
    ? resolveMovePreview(input)
    : resolveValuePreview(input)
}
