import type { MidiSustainPedalEventId, ModelRevision } from '@seele-daw/project-core'

import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'
import {
  PIANO_ROLL_INTERACTION_TOOL,
  type PianoRollInteractionTool,
} from '#internal/common/piano-roll/state-machine/piano-roll-interaction-session'
import type { PianoRollSustainPedalEditingScope } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-editing-scope'
import {
  PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS,
  createPianoRollSustainPedalTransformGesture,
  resolvePianoRollSustainPedalTransformAxis,
  resolvePianoRollSustainPedalTransformPreview,
  type PianoRollSustainPedalMovePreview,
  type PianoRollSustainPedalTransformAxis,
  type PianoRollSustainPedalTransformGesture,
  type PianoRollSustainPedalTransformPreview,
  type PianoRollSustainPedalValuePreview,
} from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-event-transform'
import type { PianoRollSustainPedalLaneHit } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-lane-input'
import {
  resolvePianoRollSustainPedalPencilPlacement,
  type PianoRollSustainPedalPlacement,
} from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-pencil-interaction'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import {
  createPianoRollValueLaneViewport,
  type PianoRollValueLaneViewport,
} from '#internal/common/piano-roll/value-lane/piano-roll-value-lane-viewport'
import { createTimelineGrid, type TimelineGrid } from '#internal/common/timeline-grid'

export const PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS = {
  AWAITING_AUTHORITY: 'awaiting-authority',
  COMMITTING_MOVE: 'committing-move',
  COMMITTING_VALUE: 'committing-value',
  IDLE: 'idle',
  MOVING_EVENTS: 'moving-events',
  PRESSING: 'pressing',
  REPLACING_VALUE: 'replacing-value',
} as const

export type PianoRollSustainPedalInteractionStatus =
  (typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS)[keyof typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS]

export const PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT = {
  MOVE_EVENTS: 'sustain-pedal-events.move',
  PLACE_EVENT: 'sustain-pedal-event.place',
  REPLACE_VALUE: 'sustain-pedal-event.replace-value',
  RESOLVE_SELECTION: 'sustain-pedal-selection.resolve',
} as const

export interface PianoRollSustainPedalResolveSelectionIntent {
  readonly pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION
}

export interface PianoRollSustainPedalPlaceEventIntent {
  readonly placement: PianoRollSustainPedalPlacement
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT
}

export interface PianoRollSustainPedalMoveEventsIntent {
  readonly gesture: PianoRollSustainPedalTransformGesture
  readonly preview: PianoRollSustainPedalMovePreview
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS
}

export interface PianoRollSustainPedalReplaceValueIntent {
  readonly gesture: PianoRollSustainPedalTransformGesture
  readonly preview: PianoRollSustainPedalValuePreview
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE
}

export type PianoRollSustainPedalInteractionIntent =
  | PianoRollSustainPedalMoveEventsIntent
  | PianoRollSustainPedalPlaceEventIntent
  | PianoRollSustainPedalReplaceValueIntent
  | PianoRollSustainPedalResolveSelectionIntent

export interface PianoRollSustainPedalInteractionConfiguration {
  readonly grid: TimelineGrid
  readonly scope: PianoRollSustainPedalEditingScope | null
  readonly selectedEventIds: readonly MidiSustainPedalEventId[]
  readonly snapEnabled: boolean
  readonly tool: PianoRollInteractionTool
  readonly viewport: PianoRollValueLaneViewport
}

export interface PianoRollSustainPedalInteractionOutcome {
  readonly failure: unknown | null
  readonly intent: PianoRollSustainPedalInteractionIntent | null
}

export interface PianoRollSustainPedalInteractionState {
  readonly activeAxis: PianoRollSustainPedalTransformAxis | null
  readonly pointerId: number | null
  readonly preview: PianoRollSustainPedalTransformPreview | null
  readonly status: PianoRollSustainPedalInteractionStatus
}

export interface PianoRollSustainPedalInteractionSessionObserver {
  onStateChange(state: PianoRollSustainPedalInteractionState): void
}

export interface ResolvePianoRollSustainPedalTransformCommitInput {
  readonly authorityRevision: ModelRevision
  readonly commitRevision: ModelRevision
}

export interface PianoRollSustainPedalInteractionSession {
  readonly state: PianoRollSustainPedalInteractionState
  cancel(): boolean
  dispose(): void
  handlePointerInput(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configuration?: PianoRollSustainPedalInteractionConfiguration,
  ): PianoRollSustainPedalInteractionOutcome
  notifyAuthorityRevision(revision: ModelRevision): void
  resolveTransformCommit(input: ResolvePianoRollSustainPedalTransformCommitInput): void
  skipTransformCommit(): void
  subscribe(observer: PianoRollSustainPedalInteractionSessionObserver): () => void
}

interface ActiveInteraction {
  readonly axis: PianoRollSustainPedalTransformAxis | null
  readonly configuration: PianoRollSustainPedalInteractionConfiguration
  readonly gesture: PianoRollSustainPedalTransformGesture | null
  readonly pointerId: number
}

const EMPTY_OUTCOME: PianoRollSustainPedalInteractionOutcome = Object.freeze({
  failure: null,
  intent: null,
})

const IDLE_STATE: PianoRollSustainPedalInteractionState = Object.freeze({
  activeAxis: null,
  pointerId: null,
  preview: null,
  status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE,
})

function freezeConfiguration(
  configuration: PianoRollSustainPedalInteractionConfiguration,
): PianoRollSustainPedalInteractionConfiguration {
  if (
    configuration.tool !== PIANO_ROLL_INTERACTION_TOOL.CURSOR &&
    configuration.tool !== PIANO_ROLL_INTERACTION_TOOL.PENCIL
  ) {
    throw new PianoRollError(
      'invalid-sustain-pedal-gesture',
      `Unknown Sustain Pedal interaction tool: ${String(configuration.tool)}`,
    )
  }

  return Object.freeze({
    ...configuration,
    grid: createTimelineGrid(configuration.grid),
    selectedEventIds: Object.freeze([...configuration.selectedEventIds]),
    viewport: createPianoRollValueLaneViewport({
      heightCssPixel: configuration.viewport.heightCssPixel,
      visibleSpanTick: configuration.viewport.visibleSpanTick,
      visibleStartTick: configuration.viewport.visibleStartTick,
      widthCssPixel: configuration.viewport.widthCssPixel,
    }),
  })
}

function createOutcome(
  intent: PianoRollSustainPedalInteractionIntent | null,
  failure: unknown | null = null,
): PianoRollSustainPedalInteractionOutcome {
  return Object.freeze({ failure, intent })
}

class PianoRollSustainPedalInteractionSessionImpl implements PianoRollSustainPedalInteractionSession {
  readonly #observers = new Set<PianoRollSustainPedalInteractionSessionObserver>()
  #active: ActiveInteraction | null = null
  #disposed = false
  #pendingCommitRevision: ModelRevision | null = null
  #state = IDLE_STATE

  get state(): PianoRollSustainPedalInteractionState {
    return this.#state
  }

  cancel(): boolean {
    if (this.#disposed || this.#state.status === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE) {
      return false
    }
    this.#reset()
    return true
  }

  dispose(): void {
    if (this.#disposed) return
    this.cancel()
    this.#disposed = true
    this.#observers.clear()
  }

  handlePointerInput(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configuration?: PianoRollSustainPedalInteractionConfiguration,
  ): PianoRollSustainPedalInteractionOutcome {
    if (this.#disposed) return EMPTY_OUTCOME

    switch (input.phase) {
      case PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN:
        if (configuration === undefined) {
          return createOutcome(
            null,
            new Error('Sustain Pedal interaction configuration is required at Pointer Begin.'),
          )
        }
        return this.#begin(input, configuration)
      case PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE:
        return this.#update(input)
      case PIANO_ROLL_POINTER_INPUT_PHASE.END:
        return this.#end(input)
      case PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL:
        if (this.#active?.pointerId !== input.pointerId || !this.#acceptsPointerFrames()) {
          return EMPTY_OUTCOME
        }
        this.#reset()
        return EMPTY_OUTCOME
    }
  }

  notifyAuthorityRevision(revision: ModelRevision): void {
    if (
      this.#disposed ||
      this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.AWAITING_AUTHORITY ||
      this.#pendingCommitRevision === null ||
      revision < this.#pendingCommitRevision
    ) {
      return
    }
    this.#reset()
  }

  resolveTransformCommit(input: ResolvePianoRollSustainPedalTransformCommitInput): void {
    if (
      this.#disposed ||
      (this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_MOVE &&
        this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_VALUE)
    ) {
      return
    }

    if (input.authorityRevision >= input.commitRevision) {
      this.#reset()
      return
    }

    this.#active = null
    this.#pendingCommitRevision = input.commitRevision
    this.#publish({
      activeAxis: this.#state.preview?.axis ?? null,
      pointerId: null,
      preview: this.#state.preview,
      status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.AWAITING_AUTHORITY,
    })
  }

  skipTransformCommit(): void {
    if (
      this.#disposed ||
      (this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_MOVE &&
        this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_VALUE)
    ) {
      return
    }
    this.#reset()
  }

  subscribe(observer: PianoRollSustainPedalInteractionSessionObserver): () => void {
    if (this.#disposed) return () => undefined
    this.#observers.add(observer)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#observers.delete(observer)
    }
  }

  #begin(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configurationInput: PianoRollSustainPedalInteractionConfiguration,
  ): PianoRollSustainPedalInteractionOutcome {
    if (
      this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE &&
      this.#state.status !== PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.AWAITING_AUTHORITY
    ) {
      return EMPTY_OUTCOME
    }

    try {
      const configuration = freezeConfiguration(configurationInput)
      const gesture =
        configuration.tool === PIANO_ROLL_INTERACTION_TOOL.CURSOR
          ? createPianoRollSustainPedalTransformGesture({
              pointerInput: input,
              scope: configuration.scope,
              selectedEventIds: configuration.selectedEventIds,
            })
          : null
      this.#pendingCommitRevision = null
      this.#active = Object.freeze({
        axis: null,
        configuration,
        gesture,
        pointerId: input.pointerId,
      })
      this.#publish({
        activeAxis: null,
        pointerId: input.pointerId,
        preview: null,
        status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.PRESSING,
      })
      return EMPTY_OUTCOME
    } catch (failure) {
      this.#reset()
      return createOutcome(null, failure)
    }
  }

  #update(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
  ): PianoRollSustainPedalInteractionOutcome {
    const active = this.#active
    if (
      !this.#acceptsPointerFrames() ||
      active === null ||
      active.pointerId !== input.pointerId ||
      active.gesture === null
    ) {
      return EMPTY_OUTCOME
    }

    try {
      const axis = active.axis ?? resolvePianoRollSustainPedalTransformAxis(active.gesture, input)
      if (axis === null) return EMPTY_OUTCOME
      const preview = resolvePianoRollSustainPedalTransformPreview({
        axis,
        gesture: active.gesture,
        grid: active.configuration.grid,
        pointerInput: input,
        snapEnabled: active.configuration.snapEnabled,
        viewport: active.configuration.viewport,
      })
      if (preview === null) return EMPTY_OUTCOME

      this.#active = Object.freeze({ ...active, axis })
      this.#publish({
        activeAxis: axis,
        pointerId: active.pointerId,
        preview,
        status:
          axis === PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK
            ? PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.MOVING_EVENTS
            : PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.REPLACING_VALUE,
      })
      return EMPTY_OUTCOME
    } catch (failure) {
      this.#reset()
      return createOutcome(null, failure)
    }
  }

  #end(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
  ): PianoRollSustainPedalInteractionOutcome {
    const active = this.#active
    if (!this.#acceptsPointerFrames() || active === null || active.pointerId !== input.pointerId) {
      return EMPTY_OUTCOME
    }

    if (active.configuration.tool === PIANO_ROLL_INTERACTION_TOOL.PENCIL) {
      return this.#completePencil(input, active.configuration)
    }
    if (!input.hasExceededDragThreshold || active.gesture === null) {
      this.#reset()
      return input.hasExceededDragThreshold
        ? EMPTY_OUTCOME
        : createOutcome(
            Object.freeze({
              pointerInput: input,
              type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION,
            }),
          )
    }

    try {
      const axis = active.axis ?? resolvePianoRollSustainPedalTransformAxis(active.gesture, input)
      if (axis === null) {
        this.#reset()
        return EMPTY_OUTCOME
      }
      const preview = resolvePianoRollSustainPedalTransformPreview({
        axis,
        gesture: active.gesture,
        grid: active.configuration.grid,
        pointerInput: input,
        snapEnabled: active.configuration.snapEnabled,
        viewport: active.configuration.viewport,
      })
      if (preview === null) {
        this.#reset()
        return EMPTY_OUTCOME
      }

      this.#active = Object.freeze({ ...active, axis })
      if (preview.axis === PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK) {
        this.#publish({
          activeAxis: axis,
          pointerId: active.pointerId,
          preview,
          status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_MOVE,
        })
        return createOutcome(
          Object.freeze({
            gesture: active.gesture,
            preview,
            type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS,
          }),
        )
      }

      this.#publish({
        activeAxis: axis,
        pointerId: active.pointerId,
        preview,
        status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_VALUE,
      })
      return createOutcome(
        Object.freeze({
          gesture: active.gesture,
          preview,
          type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE,
        }),
      )
    } catch (failure) {
      this.#reset()
      return createOutcome(null, failure)
    }
  }

  #completePencil(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configuration: PianoRollSustainPedalInteractionConfiguration,
  ): PianoRollSustainPedalInteractionOutcome {
    try {
      const placement = resolvePianoRollSustainPedalPencilPlacement({
        grid: configuration.grid,
        pointerInput: input,
        snapEnabled: configuration.snapEnabled,
        viewport: configuration.viewport,
      })
      this.#reset()
      return placement === null
        ? EMPTY_OUTCOME
        : createOutcome(
            Object.freeze({
              placement,
              type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT,
            }),
          )
    } catch (failure) {
      this.#reset()
      return createOutcome(null, failure)
    }
  }

  #acceptsPointerFrames(): boolean {
    return (
      this.#state.status === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.PRESSING ||
      this.#state.status === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.MOVING_EVENTS ||
      this.#state.status === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.REPLACING_VALUE
    )
  }

  #reset(): void {
    this.#active = null
    this.#pendingCommitRevision = null
    this.#publish(IDLE_STATE)
  }

  #publish(state: PianoRollSustainPedalInteractionState): void {
    this.#state = Object.isFrozen(state) ? state : Object.freeze({ ...state })
    for (const observer of this.#observers) {
      try {
        observer.onStateChange(this.#state)
      } catch {
        // One observer must not interrupt the active Pointer gesture.
      }
    }
  }
}

/** Creates one framework-neutral CC64 Lane interaction lifecycle. */
export function createPianoRollSustainPedalInteractionSession(): PianoRollSustainPedalInteractionSession {
  return new PianoRollSustainPedalInteractionSessionImpl()
}
