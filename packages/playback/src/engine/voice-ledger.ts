import type {
  PlaybackTimerPort,
  PlaybackVoiceHandle,
  PreparedPlaybackRuntime,
} from '#internal/engine/playback-runtime'
import type { ScheduledSampleVoicePlan } from '#internal/scheduler/audible-midi-scheduler'

export interface ScheduledVoice {
  readonly handle: PlaybackVoiceHandle
  readonly plan: ScheduledSampleVoicePlan
  readonly runtime: PreparedPlaybackRuntime
}

/**
 * The voices scheduled so far, and the runtimes retired by a handoff while their voices still
 * sound. A retired runtime is disposed once none of its voices is active.
 */
export class VoiceLedger {
  readonly #timer: PlaybackTimerPort
  readonly #cadenceMillisecond: number
  readonly #voices = new Set<ScheduledVoice>()
  readonly #retired = new Set<PreparedPlaybackRuntime>()
  #sweep: unknown = null
  #closed = false

  constructor(timer: PlaybackTimerPort, cadenceMillisecond: number) {
    this.#timer = timer
    this.#cadenceMillisecond = cadenceMillisecond
  }

  get voices(): ReadonlySet<ScheduledVoice> {
    return this.#voices
  }

  add(voice: ScheduledVoice): void {
    this.#voices.add(voice)
  }

  delete(voice: ScheduledVoice): void {
    this.#voices.delete(voice)
  }

  /** Drops the voices of a runtime that was disposed directly. */
  forget(runtime: PreparedPlaybackRuntime): void {
    for (const voice of this.#voices) {
      if (voice.runtime === runtime) this.#voices.delete(voice)
    }
  }

  retire(runtime: PreparedPlaybackRuntime): void {
    this.#retired.add(runtime)
  }

  /** Silences `current` and every retired runtime; rethrows the first failure. */
  allNotesOff(current: PreparedPlaybackRuntime | null): void {
    let failure: { readonly cause: unknown } | null = null
    for (const runtime of this.#runtimes(current)) {
      try {
        runtime.allNotesOff()
      } catch (cause) {
        failure ??= { cause }
      }
    }
    if (failure !== null && !this.#closed) throw failure.cause
  }

  /** Forgets finished voices and disposes the retired runtimes that no longer sound. */
  collect(): void {
    for (const voice of this.#voices) {
      let active = false
      try {
        active = voice.handle.isActive()
      } catch {
        // A failed or disposed runtime cannot keep a usable voice.
      }
      if (!active) this.#voices.delete(voice)
    }
    for (const runtime of this.#retired) {
      if ([...this.#voices].some((voice) => voice.runtime === runtime)) continue
      runtime.dispose()
      this.#retired.delete(runtime)
    }
    if (this.#isEmpty()) this.stopSweep()
  }

  /**
   * While playback is inactive the scheduler timer does not run, so nothing would collect a
   * release tail. This lighter sweep runs until every voice and retired runtime has finished.
   */
  startSweep(): void {
    if (this.#closed) return
    this.collect()
    if (this.#isEmpty() || this.#sweep !== null) return
    this.#sweep = this.#timer.setRepeating(() => {
      if (!this.#closed) this.collect()
    }, this.#cadenceMillisecond)
  }

  stopSweep(): void {
    if (this.#sweep === null) return
    this.#timer.clear(this.#sweep)
    this.#sweep = null
  }

  /** Disposes `current` and every retired runtime and forgets all voices. */
  release(current: PreparedPlaybackRuntime | null): void {
    for (const runtime of this.#runtimes(current)) runtime.dispose()
    this.#retired.clear()
    this.#voices.clear()
  }

  /** After closing, failures to silence are no longer reported. */
  close(): void {
    this.#closed = true
  }

  #runtimes(current: PreparedPlaybackRuntime | null): Set<PreparedPlaybackRuntime> {
    const runtimes = new Set(this.#retired)
    if (current !== null) runtimes.add(current)
    return runtimes
  }

  #isEmpty(): boolean {
    return this.#retired.size === 0 && this.#voices.size === 0
  }
}
