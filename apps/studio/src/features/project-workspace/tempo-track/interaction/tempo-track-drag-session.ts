import {
  EDITOR_POINTER_INPUT_PHASE,
  InteractionCommitHandoff,
  InteractionSession,
  type InteractionId,
} from '@seele-daw/editor'
import { createAllProjectCommitsSubscription, type ModelRevision } from '@seele-daw/project-core'
import type { ProjectTempoEventEditTarget } from '@/workbench/project/tempo-event/types/tempo-event-edit'
import type {
  TempoTrackDragConfiguration,
  TempoTrackDragIntent,
  TempoTrackDragPreview,
  TempoTrackDragResult,
  TempoTrackDragState,
  TempoTrackPointerInput,
} from '@/features/project-workspace/tempo-track/types/tempo-track-drag'
import { TempoTrackDragOperation } from './tempo-track-drag-operation'

const IDLE: TempoTrackDragState = Object.freeze({
  awaitingAuthority: false,
  interactionId: null,
  pointerId: null,
  preview: null,
})

interface ActiveTempoDrag {
  readonly interactionId: InteractionId
  readonly captureId: symbol
  readonly pointerId: number
  readonly target: ProjectTempoEventEditTarget
}

/** Tempo specialization of the shared lifecycle; owns no Vue or browser resources. */
export class TempoTrackDragSession {
  readonly #host = new InteractionSession<
    TempoTrackPointerInput,
    TempoTrackDragPreview,
    TempoTrackDragResult
  >()
  readonly #handoff = new InteractionCommitHandoff()
  readonly #onStateChange: (state: TempoTrackDragState) => void
  #active: ActiveTempoDrag | null = null
  #executing: InteractionId | null = null
  #unsubscribe: (() => void) | null = null
  #state = IDLE
  #disposed = false

  constructor(onStateChange: (state: TempoTrackDragState) => void) {
    this.#onStateChange = onStateChange
  }

  get state(): TempoTrackDragState {
    return this.#state
  }

  handlePointerInput(
    input: TempoTrackPointerInput,
    configuration?: TempoTrackDragConfiguration,
  ): TempoTrackDragIntent | null {
    if (this.#disposed) return null
    try {
      if (input.phase === EDITOR_POINTER_INPUT_PHASE.BEGIN) {
        if (this.#handoff.pending) this.cancel()
        if (this.#active !== null || input.hit === null || configuration === undefined) return null
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
    if (this.#executing === null && revision !== active.target.baseRevision) {
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

  #isCurrent(active: ActiveTempoDrag): boolean {
    return active.target.expectedSession.modelRevision === active.target.baseRevision
  }

  #begin(input: TempoTrackPointerInput, configuration: TempoTrackDragConfiguration): void {
    const { session, mapping, projectedRevision } = configuration
    const snapshot = session.getSnapshot()
    if (snapshot.modelRevision !== projectedRevision) return
    const event = snapshot.tempoEvents.find(({ id }) => id === input.hit?.tempoEventId)
    if (event === undefined || mapping.width <= 0 || mapping.height <= 0) return
    const target = Object.freeze({ expectedSession: session, baseRevision: snapshot.modelRevision })
    const operation = new TempoTrackDragOperation(event, mapping, input)
    const interactionId = this.#host.begin(operation)
    if (interactionId === null) return
    this.#active = Object.freeze({
      interactionId,
      captureId: input.captureId,
      pointerId: input.pointerId,
      target,
    })
    this.#handoff.reset(target.baseRevision)
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
