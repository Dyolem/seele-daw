import {
  EDITOR_POINTER_INPUT_PHASE,
  InteractionSession,
  type InteractionId,
} from '@seele-daw/editor'
import type { Tick } from '@seele-daw/project-core'
import type { ProjectPlaybackLocateSession } from '@/workbench/project/playback/project-playback-coordinator'
import type {
  TimelineLocateCompletion,
  TimelineLocateConfiguration,
  TimelineLocateInput,
  TimelineLocateState,
} from '@/features/project-workspace/workbench-shell/arrangement/types/timeline-locate'

interface ActiveLocate {
  readonly interactionId: InteractionId
  readonly captureId: symbol
  readonly pointerId: number
  readonly playback: ProjectPlaybackLocateSession
  readonly wasFollowSuspended: boolean
}
const IDLE: TimelineLocateState = Object.freeze({ interactionId: null, previewTick: null })
const LOCATE_OPERATION = Object.freeze({
  update: (tick: Tick) => tick,
  complete: (tick: Tick) => Object.freeze({ preview: tick, result: tick }),
})

/** View-only interaction; Playback owns transport restoration and accepts each Locate once. */
export class TimelineLocateSession {
  readonly #host = new InteractionSession<Tick, Tick, Tick>()
  readonly #onStateChange: (state: TimelineLocateState) => void
  readonly #onComplete: (completion: TimelineLocateCompletion) => void
  #active: ActiveLocate | null = null
  #disposed = false
  constructor(
    onStateChange: (state: TimelineLocateState) => void,
    onComplete: (completion: TimelineLocateCompletion) => void,
  ) {
    this.#onStateChange = onStateChange
    this.#onComplete = onComplete
  }
  get state(): TimelineLocateState {
    return this.#active === null
      ? IDLE
      : Object.freeze({
          interactionId: this.#active.interactionId,
          previewTick: this.#host.state.preview,
        })
  }
  handlePointerInput(
    input: TimelineLocateInput,
    tick: Tick,
    configuration?: TimelineLocateConfiguration,
  ): void {
    if (this.#disposed) return
    try {
      if (input.phase === EDITOR_POINTER_INPUT_PHASE.BEGIN) {
        if (this.#active !== null || configuration === undefined) return
        const playback = configuration.beginPlayback()
        if (playback === null) return
        const interactionId = this.#host.begin(LOCATE_OPERATION)
        if (interactionId === null) {
          playback.cancel()
          return
        }
        this.#active = Object.freeze({
          interactionId,
          captureId: input.captureId,
          pointerId: input.pointerId,
          playback,
          wasFollowSuspended: configuration.wasFollowSuspended,
        })
        this.update(interactionId, tick)
        return
      }
      const active = this.#active
      if (
        active === null ||
        active.captureId !== input.captureId ||
        active.pointerId !== input.pointerId
      )
        return
      if (input.phase === EDITOR_POINTER_INPUT_PHASE.CANCEL) {
        this.cancel()
        return
      }
      if (input.phase === EDITOR_POINTER_INPUT_PHASE.UPDATE) {
        this.update(active.interactionId, tick)
        return
      }
      const target = this.#host.complete(active.interactionId, tick)
      if (target === null || !this.#host.claimCompletion(active.interactionId)) return
      this.#close(active, target)
    } catch (cause) {
      this.cancel()
      throw cause
    }
  }
  update(interactionId: InteractionId, tick: Tick): void {
    if (this.#disposed || this.#active?.interactionId !== interactionId) return
    try {
      this.#host.update(interactionId, tick)
      this.#onStateChange(this.state)
    } catch (cause) {
      this.cancel()
      throw cause
    }
  }
  cancel(): boolean {
    const active = this.#active
    if (active === null) return false
    this.#close(active, null)
    return true
  }
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    try {
      this.cancel()
    } finally {
      this.#host.dispose()
    }
  }
  #close(active: ActiveLocate, tick: Tick | null): void {
    this.#active = null
    if (tick === null) this.#host.cancel(active.interactionId)
    else this.#host.finish(active.interactionId)
    let accepted = false
    try {
      accepted = tick === null ? active.playback.cancel() : active.playback.commit(tick)
    } finally {
      try {
        this.#onStateChange(IDLE)
      } finally {
        this.#onComplete({
          committed: tick !== null,
          accepted,
          startedWhilePlaying: active.playback.startedWhilePlaying,
          wasFollowSuspended: active.wasFollowSuspended,
        })
      }
    }
  }
}
