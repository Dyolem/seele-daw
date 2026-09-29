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
import type { PianoRollViewport } from '#internal/common/piano-roll/piano-roll-viewport'
import {
  createPianoRollNoteOperation,
  type PianoRollOperationPreview,
  type PianoRollOperationResult,
} from './piano-roll-note-operation'
import {
  PIANO_ROLL_INTERACTION_STATUS,
  type PianoRollInteractionConfiguration,
  type PianoRollInteractionOutcome,
  type PianoRollInteractionSession,
  type PianoRollInteractionSessionObserver,
  type PianoRollInteractionState,
  type PianoRollInteractionTarget,
  type ResolvePianoRollCommitInput,
} from './piano-roll-interaction'

const EMPTY_OUTCOME: PianoRollInteractionOutcome = Object.freeze({ failure: null, intent: null })
const IDLE: PianoRollInteractionState = Object.freeze({
  interactionId: null,
  pointerId: null,
  activeGesture: null,
  movePreview: null,
  resizePreview: null,
  status: PIANO_ROLL_INTERACTION_STATUS.IDLE,
})

interface ActiveNoteInteraction {
  readonly interactionId: InteractionId
  readonly captureId: symbol
  readonly pointerId: number
  readonly target: PianoRollInteractionTarget
  readonly viewport: PianoRollViewport | null
  readonly kind: 'note-move' | 'note-resize' | null
}

/** Note tool specialization; the shared host owns identity and one-shot completion. */
class PianoRollInteractionSessionImpl implements PianoRollInteractionSession {
  readonly #host = new InteractionSession<
    PianoRollPointerInput,
    PianoRollOperationPreview,
    PianoRollOperationResult
  >()
  readonly #handoff = new InteractionCommitHandoff()
  readonly #observers = new Set<PianoRollInteractionSessionObserver>()
  #active: ActiveNoteInteraction | null = null
  #state = IDLE
  #unsubscribe: (() => void) | null = null
  #executing: InteractionId | null = null
  #disposed = false

  get state(): PianoRollInteractionState {
    return this.#state
  }

  handlePointerInput(
    input: PianoRollPointerInput,
    configuration?: PianoRollInteractionConfiguration,
  ): PianoRollInteractionOutcome {
    if (this.#disposed) return EMPTY_OUTCOME
    try {
      if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
        if (this.#handoff.pending) this.cancel()
        if (this.#active !== null) return EMPTY_OUTCOME
        if (configuration === undefined)
          throw new Error('Piano Roll interaction configuration is required at Pointer Begin.')
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
        this.#host.state.phase === 'active' &&
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

  resolveCommit(input: ResolvePianoRollCommitInput): void {
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
    if (this.#host.state.phase === 'active' && revision !== this.#active.target.baseRevision) {
      this.cancel()
      return
    }
    const completed = this.#handoff.observe(revision)
    if (completed !== null) this.#host.finish(completed)
    this.#publish()
  }

  notifyViewport(viewport: PianoRollViewport | null): void {
    const original = this.#active?.viewport
    if (original === undefined || original === viewport) return
    if (
      original === null ||
      viewport === null ||
      original.clipId !== viewport.clipId ||
      original.widthCssPixel !== viewport.widthCssPixel ||
      original.heightCssPixel !== viewport.heightCssPixel ||
      original.visibleSpanTick !== viewport.visibleSpanTick ||
      original.visibleStartTick !== viewport.visibleStartTick ||
      original.minimumPitch !== viewport.minimumPitch ||
      original.maximumPitch !== viewport.maximumPitch
    )
      this.cancel()
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

  subscribe(observer: PianoRollInteractionSessionObserver): () => void {
    if (!this.#disposed) this.#observers.add(observer)
    return () => {
      this.#observers.delete(observer)
    }
  }

  #begin(input: PianoRollPointerInput, configuration: PianoRollInteractionConfiguration): void {
    const frozen = Object.freeze({
      ...configuration,
      context: Object.freeze({ ...configuration.context }),
      grid: Object.freeze({ ...configuration.grid }),
      selectedNoteIds: Object.freeze([...configuration.selectedNoteIds]),
      viewport:
        configuration.viewport === null ? null : Object.freeze({ ...configuration.viewport }),
    })
    const target = Object.freeze({
      context: frozen.context,
      session: frozen.session,
      baseRevision: frozen.session.modelRevision,
    })
    const { kind, operation } = createPianoRollNoteOperation(frozen, input)
    if (frozen.session.modelRevision !== target.baseRevision) {
      throw new Error('The Project changed while the Note interaction was starting.')
    }
    const interactionId = this.#host.begin(operation)
    if (interactionId === null) return
    this.#active = Object.freeze({
      interactionId,
      captureId: input.captureId,
      pointerId: input.pointerId,
      target,
      viewport: frozen.viewport,
      kind,
    })
    this.#handoff.reset(target.baseRevision)
    this.#unsubscribe = frozen.session.subscribe(createAllProjectCommitsSubscription(), {
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
      let status: PianoRollInteractionState['status'] = PIANO_ROLL_INTERACTION_STATUS.PRESSING
      if (this.#handoff.pending) status = PIANO_ROLL_INTERACTION_STATUS.AWAITING_AUTHORITY
      else if (host.phase === 'completing') {
        status = PIANO_ROLL_INTERACTION_STATUS.COMPLETING
        if (host.preview?.move !== null && host.preview?.move !== undefined)
          status = PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_MOVE
        if (host.preview?.resize !== null && host.preview?.resize !== undefined)
          status = PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE
      } else if (host.preview?.resize != null) status = PIANO_ROLL_INTERACTION_STATUS.RESIZING_NOTE
      else if (host.preview?.move != null) status = PIANO_ROLL_INTERACTION_STATUS.MOVING_NOTE
      this.#state = Object.freeze({
        interactionId: active.interactionId,
        pointerId: host.phase === 'active' ? active.pointerId : null,
        activeGesture: active.kind,
        movePreview: host.preview?.move ?? null,
        resizePreview: host.preview?.resize ?? null,
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

export function createPianoRollInteractionSession(): PianoRollInteractionSession {
  return new PianoRollInteractionSessionImpl()
}
