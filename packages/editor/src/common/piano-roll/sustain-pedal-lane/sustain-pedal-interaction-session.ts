import { createAllProjectCommitsSubscription, type ModelRevision } from '@seele-daw/project-core'
import {
  InteractionSession,
  type InteractionId,
} from '#internal/common/interaction/interaction-session'
import { InteractionCommitHandoff } from '#internal/common/interaction/interaction-commit-handoff'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollSustainPedalLaneHit } from './sustain-pedal-lane-input'
import { SustainPedalOperation, type SustainPedalOperationResult } from './sustain-pedal-operation'
import type { PianoRollSustainPedalTransformPreview } from './sustain-pedal-event-transform'
import {
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS,
  type PianoRollSustainPedalInteractionConfiguration,
  type PianoRollSustainPedalInteractionOutcome,
  type PianoRollSustainPedalInteractionSession,
  type PianoRollSustainPedalInteractionSessionObserver,
  type PianoRollSustainPedalInteractionState,
  type PianoRollSustainPedalInteractionTarget,
  type ResolvePianoRollSustainPedalCommitInput,
} from './sustain-pedal-interaction'

const EMPTY_OUTCOME: PianoRollSustainPedalInteractionOutcome = Object.freeze({
  failure: null,
  intent: null,
})
const IDLE: PianoRollSustainPedalInteractionState = Object.freeze({
  interactionId: null,
  pointerId: null,
  activeAxis: null,
  preview: null,
  status: PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.IDLE,
})

interface ActiveSustainPedalInteraction {
  readonly interactionId: InteractionId
  readonly captureId: symbol
  readonly pointerId: number
  readonly target: PianoRollSustainPedalInteractionTarget
}

/** CC64 specialization; the shared host owns identity and one-shot completion. */
class PianoRollSustainPedalInteractionSessionImpl implements PianoRollSustainPedalInteractionSession {
  readonly #host = new InteractionSession<
    PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    PianoRollSustainPedalTransformPreview,
    SustainPedalOperationResult
  >()
  readonly #handoff = new InteractionCommitHandoff()
  readonly #observers = new Set<PianoRollSustainPedalInteractionSessionObserver>()
  #active: ActiveSustainPedalInteraction | null = null
  #state = IDLE
  #unsubscribe: (() => void) | null = null
  #executing: InteractionId | null = null
  #disposed = false

  get state(): PianoRollSustainPedalInteractionState {
    return this.#state
  }

  handlePointerInput(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configuration?: PianoRollSustainPedalInteractionConfiguration,
  ): PianoRollSustainPedalInteractionOutcome {
    if (this.#disposed) return EMPTY_OUTCOME
    try {
      if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
        if (this.#handoff.pending) this.cancel()
        if (this.#active !== null) return EMPTY_OUTCOME
        if (configuration === undefined)
          throw new Error('Sustain Pedal interaction configuration is required at Pointer Begin.')
        this.#begin(input, configuration)
        this.#publish()
        return EMPTY_OUTCOME
      }
      const active = this.#active
      if (
        active === null ||
        active.captureId !== input.captureId ||
        active.pointerId !== input.pointerId
      )
        return EMPTY_OUTCOME
      if (
        this.#executing === null &&
        active.target.session.modelRevision !== active.target.baseRevision
      ) {
        this.cancel()
        return EMPTY_OUTCOME
      }
      if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL) {
        this.cancel()
        return EMPTY_OUTCOME
      }
      if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE) {
        this.#host.update(active.interactionId, input)
        this.#publish()
        return EMPTY_OUTCOME
      }
      const result = this.#host.complete(active.interactionId, input)
      this.#publish()
      if (result === null || this.#active?.interactionId !== active.interactionId)
        return EMPTY_OUTCOME
      return Object.freeze({
        failure: null,
        intent: Object.freeze({
          ...result,
          interactionId: active.interactionId,
          target: active.target,
        }),
      })
    } catch (failure) {
      this.cancel()
      return Object.freeze({ failure, intent: null })
    }
  }

  claimCompletion(interactionId: InteractionId): boolean {
    if (this.#active?.interactionId !== interactionId || this.#executing === interactionId)
      return false
    if (this.#active.target.session.modelRevision !== this.#active.target.baseRevision) {
      this.cancel()
      return false
    }
    if (!this.#host.claimCompletion(interactionId)) return false
    this.#executing = interactionId
    return true
  }

  resolveCommit(input: ResolvePianoRollSustainPedalCommitInput): void {
    if (
      this.#disposed ||
      this.#active?.interactionId !== input.interactionId ||
      this.#executing !== input.interactionId ||
      this.#host.state.phase !== 'completing' ||
      this.#handoff.pending
    )
      return
    if (this.#handoff.accept(input.interactionId, input.commitRevision, input.authorityRevision))
      this.#host.finish(input.interactionId)
    this.#publish()
  }

  finish(interactionId: InteractionId): void {
    if (this.#disposed || this.#handoff.pending) return
    if (this.#host.finish(interactionId)) this.#publish()
  }

  notifyAuthorityRevision(revision: ModelRevision): void {
    if (this.#disposed || this.#active === null) return
    if (this.#executing === null && revision !== this.#active.target.baseRevision) {
      this.cancel()
      return
    }
    const completed = this.#handoff.observe(revision)
    if (completed !== null) this.#host.finish(completed)
    this.#publish()
  }

  cancel(): boolean {
    if (this.#disposed || this.#active === null) return false
    const cancelled = this.#host.cancel(this.#active.interactionId)
    this.#publish()
    return cancelled
  }

  dispose(): void {
    if (this.#disposed) return
    try {
      this.cancel()
    } finally {
      this.#disposed = true
      this.#host.dispose()
      this.#observers.clear()
    }
  }

  subscribe(observer: PianoRollSustainPedalInteractionSessionObserver): () => void {
    if (!this.#disposed) this.#observers.add(observer)
    return () => {
      this.#observers.delete(observer)
    }
  }

  #begin(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configuration: PianoRollSustainPedalInteractionConfiguration,
  ): void {
    const target = Object.freeze({ ...configuration.target })
    if (
      target.session.modelRevision !== target.baseRevision ||
      (configuration.scope !== null && configuration.scope.modelRevision !== target.baseRevision)
    )
      return
    const operation = new SustainPedalOperation(configuration, input)
    const interactionId = this.#host.begin(operation)
    if (interactionId === null) return
    this.#active = Object.freeze({
      interactionId,
      captureId: input.captureId,
      pointerId: input.pointerId,
      target,
    })
    this.#handoff.reset(target.baseRevision)
    this.#unsubscribe = target.session.subscribe(createAllProjectCommitsSubscription(), {
      onCommit: () => {
        // Only the claimed execution may synchronously publish its own commit.
        if (this.#active?.interactionId === interactionId && this.#executing !== interactionId)
          this.cancel()
      },
      onError: () => {
        if (this.#active?.interactionId === interactionId) this.cancel()
      },
    })
  }

  #clearProjection(): void {
    this.#active = null
    this.#executing = null
    const unsubscribe = this.#unsubscribe
    this.#unsubscribe = null
    this.#handoff.reset(0)
    this.#state = IDLE
    unsubscribe?.()
  }

  #publish(): void {
    const host = this.#host.state
    const active = this.#active
    if (
      active === null ||
      host.phase === 'finished' ||
      host.phase === 'cancelled' ||
      host.phase === 'idle'
    ) {
      this.#clearProjection()
    } else {
      let status: PianoRollSustainPedalInteractionState['status'] =
        PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.PRESSING
      if (this.#handoff.pending)
        status = PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.AWAITING_AUTHORITY
      else if (host.phase === 'completing') {
        status = PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMPLETING
        if (host.preview?.axis === 'tick')
          status = PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_MOVE
        if (host.preview?.axis === 'value')
          status = PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.COMMITTING_VALUE
      } else if (host.preview?.axis === 'value')
        status = PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.REPLACING_VALUE
      else if (host.preview?.axis === 'tick')
        status = PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS.MOVING_EVENTS
      this.#state = Object.freeze({
        interactionId: active.interactionId,
        pointerId: host.phase === 'active' ? active.pointerId : null,
        activeAxis: host.preview?.axis ?? null,
        preview: host.preview,
        status,
      })
    }
    for (const observer of this.#observers) {
      try {
        observer.onStateChange(this.#state)
      } catch (cause) {
        // A failed projection must not leave an unsubmitted completion available.
        if (this.#active !== null) this.#host.cancel(this.#active.interactionId)
        this.#clearProjection()
        for (const recipient of this.#observers) {
          try {
            recipient.onStateChange(IDLE)
          } catch {
            // Cleanup must reach healthy observers even when one projection keeps failing.
          }
        }
        throw cause
      }
    }
  }
}

export function createPianoRollSustainPedalInteractionSession(): PianoRollSustainPedalInteractionSession {
  return new PianoRollSustainPedalInteractionSessionImpl()
}
