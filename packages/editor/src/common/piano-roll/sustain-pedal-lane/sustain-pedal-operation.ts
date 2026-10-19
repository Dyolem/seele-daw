import type { InteractionOperation } from '#internal/common/interaction/interaction-session'
import type { PianoRollPointerInput } from '#internal/common/piano-roll/piano-roll-input'
import { createTimelineGrid } from '#internal/common/timeline-grid'
import { createPianoRollValueLaneViewport } from '#internal/common/piano-roll/value-lane/piano-roll-value-lane-viewport'
import {
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT,
  type PianoRollSustainPedalInteractionConfiguration,
  type PianoRollSustainPedalInteractionIntent,
} from './sustain-pedal-interaction'
import type { PianoRollSustainPedalLaneHit } from './sustain-pedal-lane-input'
import {
  createPianoRollSustainPedalTransformGesture,
  resolvePianoRollSustainPedalTransformAxis,
  resolvePianoRollSustainPedalTransformPreview,
  type PianoRollSustainPedalTransformAxis,
  type PianoRollSustainPedalTransformGesture,
  type PianoRollSustainPedalTransformPreview,
} from './sustain-pedal-event-transform'
import { resolvePianoRollSustainPedalSelection } from './sustain-pedal-event-selection'
import { resolvePianoRollSustainPedalPencilPlacement } from './sustain-pedal-pencil-interaction'

type WithoutCompletion<T> = T extends unknown ? Omit<T, 'interactionId' | 'target'> : never
export type SustainPedalOperationResult = WithoutCompletion<PianoRollSustainPedalInteractionIntent>
type Input = PianoRollPointerInput<PianoRollSustainPedalLaneHit>

/** Owns frozen tool settings and axis locking, without command or input resources. */
export class SustainPedalOperation implements InteractionOperation<
  Input,
  PianoRollSustainPedalTransformPreview,
  SustainPedalOperationResult
> {
  readonly #configuration: PianoRollSustainPedalInteractionConfiguration
  readonly #gesture: PianoRollSustainPedalTransformGesture | null
  readonly #origin: Input
  #axis: PianoRollSustainPedalTransformAxis | null = null

  constructor(configuration: PianoRollSustainPedalInteractionConfiguration, input: Input) {
    this.#origin = Object.freeze({
      ...input,
      originPosition: Object.freeze({ ...input.originPosition }),
      originModifiers: Object.freeze({ ...input.originModifiers }),
      hit: input.hit === null ? null : Object.freeze({ ...input.hit }),
    })
    this.#configuration = Object.freeze({
      ...configuration,
      grid: createTimelineGrid(configuration.grid),
      selectedEventIds: Object.freeze([...configuration.selectedEventIds]),
      viewport: createPianoRollValueLaneViewport(configuration.viewport),
    })
    this.#gesture =
      configuration.tool === 'cursor'
        ? createPianoRollSustainPedalTransformGesture({
            pointerInput: this.#origin,
            scope: configuration.scope,
            selectedEventIds: configuration.selectedEventIds,
          })
        : null
  }

  update(input: Input): PianoRollSustainPedalTransformPreview | null {
    if (this.#gesture === null) return null
    this.#axis ??= resolvePianoRollSustainPedalTransformAxis(this.#gesture, input)
    if (this.#axis === null) return null
    return resolvePianoRollSustainPedalTransformPreview({
      ...this.#configuration,
      axis: this.#axis,
      gesture: this.#gesture,
      pointerInput: input,
    })
  }

  complete(input: Input) {
    input = Object.freeze({
      ...input,
      hit: this.#origin.hit,
      originPosition: this.#origin.originPosition,
      originModifiers: this.#origin.originModifiers,
    })
    const preview = this.update(input)
    let result: SustainPedalOperationResult | null = null
    const configuration = this.#configuration
    if (configuration.tool === 'pencil') {
      const placement = resolvePianoRollSustainPedalPencilPlacement({
        ...configuration,
        pointerInput: input,
      })
      if (placement !== null)
        result = { type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT, placement }
    } else if (!input.hasExceededDragThreshold) {
      const selection = resolvePianoRollSustainPedalSelection({
        ...configuration,
        pointerInput: input,
      })
      if (selection !== null)
        result = {
          type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION,
          selectedEventIds: selection.selectedEventIds,
        }
    } else if (preview !== null && this.#gesture !== null) {
      if (preview.axis === 'tick' && preview.deltaTick !== 0)
        result = {
          type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS,
          gesture: this.#gesture,
          preview,
        }
      if (preview.axis === 'value' && preview.value !== this.#gesture.anchorEvent.event.value)
        result = {
          type: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE,
          gesture: this.#gesture,
          preview,
        }
    }
    return Object.freeze({ preview, result: result === null ? null : Object.freeze(result) })
  }
}
