import type { PianoRollPointerInput } from '@seele-daw/editor'
import {
  EDITOR_POINTER_INPUT_PHASE,
  InteractionCommitHandoff,
  InteractionSession,
  type InteractionId,
} from '@seele-daw/editor'
import { createAllProjectCommitsSubscription, type ModelRevision } from '@seele-daw/project-core'
import type {
  TrackPlacementConfiguration,
  TrackPlacementIntent,
  TrackPlacementPreview,
  TrackPlacementResult,
  TrackPlacementState,
} from '@/features/piano-roll/components/track-surface/types/track-placement'
import { TrackPlacementOperation } from './track-placement-operation'

const IDLE: TrackPlacementState = Object.freeze({
  awaitingAuthority: false,
  interactionId: null,
  pointerId: null,
  preview: null,
})

interface ActiveTrackPlacement {
  readonly interactionId: InteractionId
  readonly captureId: symbol
  readonly pointerId: number
  readonly target: TrackPlacementConfiguration
}

/** Owns frozen Track placement and its commit handoff, independently of Vue. */
export class TrackPlacementSession {
  readonly #host = new InteractionSession<
    PianoRollPointerInput,
    TrackPlacementPreview,
    TrackPlacementResult
  >()
  readonly #handoff = new InteractionCommitHandoff()
  readonly #onStateChange: (state: TrackPlacementState) => void
  #active: ActiveTrackPlacement | null = null
  #executing: InteractionId | null = null
  #unsubscribe: (() => void) | null = null
  #state = IDLE
  #disposed = false

  constructor(onStateChange: (state: TrackPlacementState) => void) {
    this.#onStateChange = onStateChange
  }

  get state(): TrackPlacementState {
    return this.#state
  }

  handlePointerInput(
    input: PianoRollPointerInput,
    configuration?: TrackPlacementConfiguration,
  ): TrackPlacementIntent | null {
    if (this.#disposed) return null
    try {
      if (input.phase === EDITOR_POINTER_INPUT_PHASE.BEGIN) {
        if (this.#handoff.pending) this.cancel()
        if (this.#active !== null || configuration === undefined) return null
        this.#begin(input, configuration)
        return null
      }
      const active = this.#active
      if (
        active === null ||
        active.captureId !== input.captureId ||
        active.pointerId !== input.pointerId
      )
        return null
      // Commit delivery is asynchronous; every input also checks the synchronous authority.
      if (
        input.phase === EDITOR_POINTER_INPUT_PHASE.CANCEL ||
        (this.#executing === null && !this.#isCurrent(active))
      ) {
        this.cancel()
        return null
      }
      if (input.phase === EDITOR_POINTER_INPUT_PHASE.UPDATE) {
        this.#host.update(active.interactionId, input)
        this.#publish()
        return null
      }
      const result = this.#host.complete(active.interactionId, input)
      this.#publish()
      if (result === null || this.#active?.interactionId !== active.interactionId) return null
      return Object.freeze({
        ...result,
        interactionId: active.interactionId,
        target: active.target,
      })
    } catch (cause) {
      this.cancel()
      throw cause
    }
  }

  claimCompletion(interactionId: InteractionId): boolean {
    const active = this.#active
    if (active?.interactionId !== interactionId || this.#executing !== null) return false
    if (!this.#isCurrent(active)) {
      this.cancel()
      return false
    }
    if (!this.#host.claimCompletion(interactionId)) return false
    this.#executing = interactionId
    return true
  }

  resolveCommit(
    interactionId: InteractionId,
    revision: ModelRevision,
    projectedRevision: ModelRevision,
  ): void {
    if (
      this.#disposed ||
      this.#active?.interactionId !== interactionId ||
      this.#executing !== interactionId ||
      this.#handoff.pending ||
      this.#host.state.phase !== 'completing'
    )
      return
    if (this.#handoff.accept(interactionId, revision, projectedRevision))
      this.#host.finish(interactionId)
    this.#publish()
  }

  notifyAuthorityRevision(revision: ModelRevision): void {
    const active = this.#active
    if (this.#disposed || active === null) return
    if (this.#executing === null && revision !== active.target.readModel.modelRevision) {
      this.cancel()
      return
    }
    const completed = this.#handoff.observe(revision)
    if (completed !== null) this.#host.finish(completed)
    this.#publish()
  }

  finish(interactionId: InteractionId): void {
    if (this.#disposed || this.#handoff.pending) return
    if (this.#host.finish(interactionId)) this.#publish()
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
    }
  }

  #isCurrent(active: ActiveTrackPlacement): boolean {
    return active.target.session.modelRevision === active.target.readModel.modelRevision
  }

  #begin(input: PianoRollPointerInput, configuration: TrackPlacementConfiguration): void {
    const target = Object.freeze({
      ...configuration,
      grid: Object.freeze({ ...configuration.grid }),
      viewport: Object.freeze({ ...configuration.viewport }),
    })
    const { session, readModel } = target
    if (session.modelRevision !== readModel.modelRevision) return
    const operation = new TrackPlacementOperation(target, input)
    const interactionId = this.#host.begin(operation)
    if (interactionId === null) return
    this.#active = Object.freeze({
      interactionId,
      captureId: input.captureId,
      pointerId: input.pointerId,
      target,
    })
    this.#handoff.reset(readModel.modelRevision)
    this.#unsubscribe = session.subscribe(createAllProjectCommitsSubscription(), {
      onCommit: () => {
        if (this.#active?.interactionId === interactionId && this.#executing !== interactionId)
          this.cancel()
      },
      onError: () => {
        if (this.#active?.interactionId === interactionId) this.cancel()
      },
    })
    this.#host.update(interactionId, input)
    this.#publish()
  }

  #clear(): void {
    const unsubscribe = this.#unsubscribe
    this.#unsubscribe = null
    this.#active = null
    this.#executing = null
    this.#handoff.reset(0)
    this.#state = IDLE
    unsubscribe?.()
  }

  #publish(): void {
    const active = this.#active
    const host = this.#host.state
    if (
      active === null ||
      host.phase === 'idle' ||
      host.phase === 'finished' ||
      host.phase === 'cancelled'
    )
      this.#clear()
    else
      this.#state = Object.freeze({
        awaitingAuthority: this.#handoff.pending,
        interactionId: active.interactionId,
        pointerId: host.phase === 'active' ? active.pointerId : null,
        preview: host.preview,
      })
    try {
      this.#onStateChange(this.#state)
    } catch (cause) {
      if (this.#active !== null) this.#host.cancel(this.#active.interactionId)
      this.#clear()
      try {
        this.#onStateChange(IDLE)
      } catch {
        /* Best-effort removal of the failed projection. */
      }
      throw cause
    }
  }
}
