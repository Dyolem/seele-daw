import {
  parsePlaybackClockSecond,
  type AudibleMidiProjectPlan,
  type PlaybackAbortSignal,
  type PlaybackClockSecond,
  type PlaybackPreparationOptions,
  type PlaybackRuntimePort,
  type PreparedPlaybackPlan,
} from '@seele-daw/playback'

import { WebAudioContextRuntime } from '#internal/context/audio-context-runtime'
import {
  prepareSampleResources,
  type SampleAssetBaseUrl,
} from '#internal/sample-instrument/loading/prepare-plan-resources'
import {
  SampleInstrumentResourceCache,
  type SampleInstrumentResourceCacheLimits,
} from '#internal/sample-instrument/loading/resource-cache'
import { SampleInstrumentVoiceRuntime } from '#internal/sample-instrument/voice/voice-runtime'

export interface WebAudioPlaybackRuntimeOptions {
  /** Where each Soundbank's assets are served from; null when this build has none for it. */
  readonly assetBaseUrl: SampleAssetBaseUrl
  readonly limits: SampleInstrumentResourceCacheLimits
  readonly audioContextFactory?: () => AudioContext
  readonly fetch?: typeof globalThis.fetch
}

interface ActiveOutput {
  readonly audioContext: BaseAudioContext
  readonly cache: SampleInstrumentResourceCache
  readonly voices: SampleInstrumentVoiceRuntime
}

class WebAudioPlaybackRuntime implements PlaybackRuntimePort {
  readonly #options: WebAudioPlaybackRuntimeOptions
  readonly #context: WebAudioContextRuntime
  #active: ActiveOutput | null = null
  #disposed = false

  constructor(options: WebAudioPlaybackRuntimeOptions) {
    this.#options = options
    this.#context = new WebAudioContextRuntime({ audioContextFactory: options.audioContextFactory })
  }

  async prepare(
    plan: AudibleMidiProjectPlan,
    signal: PlaybackAbortSignal,
    options: PlaybackPreparationOptions,
  ): Promise<PreparedPlaybackPlan> {
    if (this.#disposed) throw new Error('The Web Audio playback runtime is disposed')
    // Fetches take a DOM AbortSignal; mirror playback's cancellation onto one.
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort)
    try {
      // Starting the output stays first, in the synchronous call stack of the user gesture.
      const active = await this.#activate()
      const resources = await prepareSampleResources(
        plan,
        active.cache,
        this.#options.assetBaseUrl,
        options.instrumentFailureMode,
        controller.signal,
      )
      controller.signal.throwIfAborted()
      return Object.freeze<PreparedPlaybackPlan>({
        modelRevision: resources.modelRevision,
        preparationFailures: resources.preparationFailures,
        unsupportedNoteOccurrences: resources.unsupportedNoteOccurrences,
        schedule: (voice) => {
          const instrument = resources.instruments.get(voice.soundbankId)
          return instrument === undefined ? null : active.voices.schedule(voice, instrument)
        },
      })
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }

  now(): PlaybackClockSecond {
    if (this.#active === null) throw new Error('The audio output has not started')
    return parsePlaybackClockSecond(this.#active.audioContext.currentTime)
  }

  allNotesOff(): void {
    this.#active?.voices.allNotesOff()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#active?.voices.dispose()
    this.#active?.cache.dispose()
    this.#active = null
    void this.#context.dispose().catch(() => undefined)
  }

  async #activate(): Promise<ActiveOutput> {
    const output = await this.#context.activate()
    if (this.#active !== null) return this.#active
    this.#active = Object.freeze({
      audioContext: output.audioContext,
      cache: new SampleInstrumentResourceCache({
        audioContext: output.audioContext,
        fetch: this.#options.fetch,
        limits: this.#options.limits,
      }),
      voices: new SampleInstrumentVoiceRuntime({ output }),
    })
    return this.#active
  }
}

/** Creates the playback runtime without starting audio output before the first Play gesture. */
export function createWebAudioPlaybackRuntime(
  options: WebAudioPlaybackRuntimeOptions,
): PlaybackRuntimePort {
  return new WebAudioPlaybackRuntime(options)
}
