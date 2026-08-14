import {
  SampleInstrumentResourceCache,
  SampleInstrumentVoiceRuntime,
  WebAudioContextRuntime,
  prepareAudibleMidiSampleResources,
  type AudibleMidiSampleResourceLocator,
  type PreparedAudibleMidiSampleResources,
  type SampleInstrumentResourceCacheLimits,
} from '@seele-daw/audio-web'
import {
  STUDIO_GRAND_SOUNDBANK_ID,
  parseSoundbankId,
  parsePlaybackClockSecond,
  type AudibleMidiProjectPlan,
  type ScheduledSampleVoicePlan,
  type SoundbankId,
} from '@seele-daw/playback'

import type {
  ProjectPlaybackPreparedRuntime,
  ProjectPlaybackRuntimePort,
  ProjectPlaybackVoiceHandle,
} from '@/workbench/project/playback/project-playback-coordinator'

export interface BrowserProjectPlaybackRuntimeOptions {
  readonly assetBaseBySoundbank?: ReadonlyMap<SoundbankId, string | URL>
  readonly audioContextFactory?: () => AudioContext
  readonly expectedOrigin: string
  readonly fetch?: typeof globalThis.fetch
  readonly resourceLimits?: SampleInstrumentResourceCacheLimits
}

const DEFAULT_RESOURCE_LIMITS = Object.freeze<SampleInstrumentResourceCacheLimits>({
  maximumManifestByteLength: 64 * 1_024,
  maximumResourceByteLength: 4 * 1_024 * 1_024,
})

class PreparedBrowserProjectPlaybackRuntime implements ProjectPlaybackPreparedRuntime {
  readonly modelRevision: ProjectPlaybackPreparedRuntime['modelRevision']
  readonly #voiceRuntime: SampleInstrumentVoiceRuntime
  readonly #audioContext: AudioContext

  constructor(
    preparedResources: PreparedAudibleMidiSampleResources,
    voiceRuntime: SampleInstrumentVoiceRuntime,
    audioContext: AudioContext,
  ) {
    this.modelRevision = preparedResources.modelRevision
    this.#voiceRuntime = voiceRuntime
    this.#audioContext = audioContext
  }

  advanceGeneration(generation: ScheduledSampleVoicePlan['engineGeneration']): void {
    this.#voiceRuntime.advanceGeneration(generation)
  }

  allNotesOff(): void {
    this.#voiceRuntime.allNotesOff()
  }

  dispose(): void {
    this.#voiceRuntime.dispose()
  }

  now(): ReturnType<typeof parsePlaybackClockSecond> {
    return parsePlaybackClockSecond(this.#audioContext.currentTime)
  }

  schedule(plan: ScheduledSampleVoicePlan): ProjectPlaybackVoiceHandle | null {
    const result = this.#voiceRuntime.schedule(plan)
    if (result.outcome !== 'scheduled' || result.token === null) return null
    const token = result.token
    return Object.freeze<ProjectPlaybackVoiceHandle>({
      cancel: (atPlaybackClockSecond) => this.#voiceRuntime.cancel(token, atPlaybackClockSecond),
      engineGeneration: token.engineGeneration,
      isActive: () => this.#voiceRuntime.hasVoice(token),
      occurrenceKey: token.occurrenceKey,
      rescheduleRelease: (releasePlaybackClockSecond) => {
        const update = this.#voiceRuntime.rescheduleRelease(token, releasePlaybackClockSecond)
        return (
          update.outcome === 'no-change' ||
          update.outcome === 'released-now' ||
          update.outcome === 'rescheduled'
        )
      },
    })
  }
}

class BrowserProjectPlaybackRuntime implements ProjectPlaybackRuntimePort {
  readonly #assetBaseBySoundbank: ReadonlyMap<SoundbankId, string | URL>
  readonly #contextRuntime: WebAudioContextRuntime
  readonly #expectedOrigin: string
  readonly #fetch: typeof globalThis.fetch | undefined
  readonly #resourceLimits: SampleInstrumentResourceCacheLimits
  #resourceCache: SampleInstrumentResourceCache | null = null
  #disposed = false

  constructor(options: BrowserProjectPlaybackRuntimeOptions) {
    this.#assetBaseBySoundbank = options.assetBaseBySoundbank ?? new Map()
    this.#contextRuntime = new WebAudioContextRuntime({
      audioContextFactory: options.audioContextFactory,
    })
    this.#expectedOrigin = options.expectedOrigin
    this.#fetch = options.fetch
    this.#resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS
  }

  async prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
  ): Promise<ProjectPlaybackPreparedRuntime> {
    if (this.#disposed) throw new Error('Browser Project Playback Runtime is disposed')
    // AudioContext activation stays at the start of the synchronous user-gesture call stack;
    // resource Fetch/decode can then continue asynchronously without losing browser permission.
    const output = await this.#contextRuntime.activate()
    if (signal.aborted) throw new DOMException('Playback preparation was aborted', 'AbortError')

    let cache = this.#resourceCache
    if (cache === null) {
      cache = new SampleInstrumentResourceCache({
        audioContext: output.audioContext,
        expectedOrigin: this.#expectedOrigin,
        fetch: this.#fetch,
        limits: this.#resourceLimits,
      })
      this.#resourceCache = cache
    }
    const locator: AudibleMidiSampleResourceLocator = Object.freeze({
      locate: (soundbankId: SoundbankId) => {
        const assetBaseUrl = this.#assetBaseBySoundbank.get(soundbankId)
        return assetBaseUrl === undefined ? null : Object.freeze({ assetBaseUrl, soundbankId })
      },
    })
    const preparedResources = await prepareAudibleMidiSampleResources(plan, cache, locator, signal)
    if (signal.aborted) throw new DOMException('Playback preparation was aborted', 'AbortError')
    const voiceRuntime = new SampleInstrumentVoiceRuntime({ output, preparedResources })
    return new PreparedBrowserProjectPlaybackRuntime(
      preparedResources,
      voiceRuntime,
      output.audioContext,
    )
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#resourceCache?.dispose()
    this.#resourceCache = null
    void this.#contextRuntime.dispose().catch(() => undefined)
  }
}

/** Creates the browser resources without activating an AudioContext before the first Play gesture. */
export function createBrowserProjectPlaybackRuntime(
  options: BrowserProjectPlaybackRuntimeOptions,
): ProjectPlaybackRuntimePort {
  return new BrowserProjectPlaybackRuntime(options)
}

/** Resolves the developer-local built-in asset URL used by the current audible validation slice. */
export function createDefaultBuiltInSampleAssetLocations(
  origin: string,
): ReadonlyMap<SoundbankId, URL> {
  return new Map<SoundbankId, URL>([
    [
      parseSoundbankId(STUDIO_GRAND_SOUNDBANK_ID),
      new URL('/soundbanks/generated/studio-grand/', origin),
    ],
  ])
}
