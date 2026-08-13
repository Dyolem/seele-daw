import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest-validator'
import { findSampleInstrumentZoneForPitch } from '#internal/sample-instrument/loading/zone-selection'
import { resolveSampleResourceUrl } from '#internal/sample-instrument/contract/resource-key'
import { type SampleInstrumentResourceMeasurement } from '#internal/sample-instrument/loading/measurement'

export type SampleInstrumentAuditionNoteOffMode = 'linear-release' | 'natural-end'
export type SampleInstrumentAuditionVelocityCurve =
  | 'constant'
  | 'linear-amplitude'
  | 'squared-amplitude'

export interface SampleInstrumentAuditionNoteRequest {
  readonly durationSecond: number
  readonly noteOffMode: SampleInstrumentAuditionNoteOffMode
  readonly pitch: number
  readonly releaseSecond: number
  readonly velocity: number
  readonly velocityCurve: SampleInstrumentAuditionVelocityCurve
}

export interface SampleInstrumentAuditionResult {
  readonly effectiveNaturalEndSecond: number | null
  readonly endsBeforeRequestedNoteOff: boolean
  readonly pitch: number
  readonly playbackRate: number
  readonly releaseSecond: number | null
  readonly resourceKey: string
  readonly velocityGain: number
  readonly zoneId: string
}

export interface SampleInstrumentDecodedResourceMeasurement extends SampleInstrumentResourceMeasurement {
  readonly decodeDurationMillisecond: number
  readonly fetchDurationMillisecond: number
}

export interface SampleInstrumentBrowserLoadMeasurement {
  readonly cacheHitCount: number
  readonly decodedFloat32ByteLength: number
  readonly encodedByteLength: number
  readonly resourceCount: number
  readonly resources: readonly SampleInstrumentDecodedResourceMeasurement[]
  readonly wallDurationMillisecond: number
}

export interface SampleInstrumentAuditionSessionOptions {
  readonly assetBaseUrl: string | URL
  readonly audioContextFactory?: () => AudioContext
  readonly expectedOrigin: string
  readonly fetch?: typeof globalThis.fetch
  readonly now?: () => number
}

export type SampleInstrumentAuditionErrorCode =
  | 'audio-context-failed'
  | 'disposed'
  | 'invalid-configuration'
  | 'invalid-request'
  | 'resource-load-failed'
  | 'unsupported-pitch'

export class SampleInstrumentAuditionError extends Error {
  readonly code: SampleInstrumentAuditionErrorCode
  readonly detail: string

  constructor(code: SampleInstrumentAuditionErrorCode, message: string) {
    super(message)
    this.name = 'SampleInstrumentAuditionError'
    this.code = code
    this.detail = message
  }
}

interface LoadedAuditionResource {
  readonly buffer: AudioBuffer
  readonly measurement: SampleInstrumentDecodedResourceMeasurement
}

interface LoadedResourceResult {
  readonly cacheHit: boolean
  readonly resource: LoadedAuditionResource
}

interface ActiveAuditionVoice {
  readonly gain: GainNode
  readonly source: AudioBufferSourceNode
}

function fail(code: SampleInstrumentAuditionErrorCode, message: string): never {
  throw new SampleInstrumentAuditionError(code, message)
}

function createVelocityGain(
  velocity: number,
  curve: SampleInstrumentAuditionVelocityCurve,
): number {
  const normalized = velocity / 127
  if (curve === 'constant') return 1
  if (curve === 'linear-amplitude') return normalized
  return normalized ** 2
}

function validateNoteRequest(request: SampleInstrumentAuditionNoteRequest): void {
  if (
    !Number.isFinite(request.durationSecond) ||
    request.durationSecond <= 0 ||
    request.durationSecond > 60
  ) {
    fail('invalid-request', 'note duration must be finite and greater than 0 through 60 seconds')
  }
  if (!Number.isInteger(request.velocity) || request.velocity < 1 || request.velocity > 127) {
    fail('invalid-request', 'velocity must be an integer from 1 through 127')
  }
  if (
    !Number.isFinite(request.releaseSecond) ||
    request.releaseSecond < 0.001 ||
    request.releaseSecond > 5
  ) {
    fail('invalid-request', 'release must be finite and from 0.001 through 5 seconds')
  }
}

function uniqueResourceKeysForPitches(
  manifest: SampleInstrumentManifestV1,
  pitches: readonly number[],
): readonly string[] {
  const keys = new Set<string>()
  for (const pitch of pitches) {
    const zone = findSampleInstrumentZoneForPitch(manifest, pitch)
    if (zone === null) fail('unsupported-pitch', `Manifest does not cover MIDI pitch ${pitch}`)
    keys.add(zone.resource.key)
  }
  return Object.freeze([...keys].sort())
}

function allResourceKeys(manifest: SampleInstrumentManifestV1): readonly string[] {
  return Object.freeze([...new Set(manifest.zones.map(({ resource }) => resource.key))].sort())
}

/**
 * Development-only browser probe for measuring and comparing Sample Instrument policies.
 * It deliberately does not implement Transport, Scheduler, production caching, or Project state.
 */
export class SampleInstrumentAuditionSession {
  readonly #assetBaseUrl: URL
  readonly #audioContextFactory: () => AudioContext
  readonly #fetch: typeof globalThis.fetch
  readonly #now: () => number
  readonly #resourceRequests = new Map<string, Promise<LoadedAuditionResource>>()
  readonly #activeVoices = new Set<ActiveAuditionVoice>()
  #audioContext: AudioContext | null = null
  #manifestRequest: Promise<SampleInstrumentManifestV1> | null = null
  #disposed = false

  constructor(options: SampleInstrumentAuditionSessionOptions) {
    const assetBaseUrl = new URL(options.assetBaseUrl)
    if (
      assetBaseUrl.origin !== options.expectedOrigin ||
      !assetBaseUrl.pathname.endsWith('/') ||
      (assetBaseUrl.protocol !== 'http:' && assetBaseUrl.protocol !== 'https:')
    ) {
      fail(
        'invalid-configuration',
        'asset base must be a same-origin HTTP(S) URL ending with a slash',
      )
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch
    if (typeof fetchImplementation !== 'function') {
      fail('invalid-configuration', 'Fetch is unavailable')
    }
    this.#assetBaseUrl = assetBaseUrl
    this.#fetch = fetchImplementation.bind(globalThis)
    this.#now = options.now ?? (() => performance.now())
    this.#audioContextFactory =
      options.audioContextFactory ??
      (() => {
        const AudioContextConstructor = globalThis.AudioContext
        if (AudioContextConstructor === undefined) {
          fail('audio-context-failed', 'Web Audio AudioContext is unavailable')
        }
        return new AudioContextConstructor()
      })
  }

  get assetBaseUrl(): string {
    return this.#assetBaseUrl.href
  }

  get decodedResourceCount(): number {
    return this.#resourceRequests.size
  }

  async loadManifest(): Promise<SampleInstrumentManifestV1> {
    this.#assertUsable()
    if (this.#manifestRequest !== null) return this.#manifestRequest
    const request = this.#loadManifest()
    this.#manifestRequest = request
    try {
      return await request
    } catch (error) {
      if (this.#manifestRequest === request) this.#manifestRequest = null
      throw error
    }
  }

  async activateAudio(): Promise<string> {
    const context = await this.#ensureAudioContext()
    return context.state
  }

  async measureAllResources(): Promise<SampleInstrumentBrowserLoadMeasurement> {
    const manifest = await this.loadManifest()
    return this.#measureResourceKeys(allResourceKeys(manifest))
  }

  async measurePitches(
    pitches: readonly number[],
  ): Promise<SampleInstrumentBrowserLoadMeasurement> {
    const manifest = await this.loadManifest()
    return this.#measureResourceKeys(uniqueResourceKeysForPitches(manifest, pitches))
  }

  async auditionNote(
    request: SampleInstrumentAuditionNoteRequest,
  ): Promise<SampleInstrumentAuditionResult> {
    this.#assertUsable()
    validateNoteRequest(request)
    const manifest = await this.loadManifest()
    const zone = findSampleInstrumentZoneForPitch(manifest, request.pitch)
    if (zone === null) {
      fail('unsupported-pitch', `Manifest does not cover MIDI pitch ${request.pitch}`)
    }
    if (zone.loop.kind !== 'none') {
      fail('invalid-request', 'this development probe currently accepts only non-looping Zones')
    }

    const context = await this.#ensureAudioContext()
    const { resource } = await this.#loadResource(zone.resource.key, context)
    const source = context.createBufferSource()
    const gain = context.createGain()
    const playbackRate = 2 ** ((request.pitch - zone.rootMidiPitch + zone.tuneCent / 100) / 12)
    const velocityGain = createVelocityGain(request.velocity, request.velocityCurve)
    const startTime = context.currentTime + 0.02
    const effectiveNaturalEndSecond =
      Math.max(0, resource.buffer.duration - zone.startOffsetSecond) / playbackRate
    const voice = Object.freeze({ gain, source })

    source.buffer = resource.buffer
    source.playbackRate.setValueAtTime(playbackRate, startTime)
    gain.gain.setValueAtTime(velocityGain, startTime)
    source.connect(gain)
    gain.connect(context.destination)
    source.addEventListener(
      'ended',
      () => {
        this.#activeVoices.delete(voice)
        source.disconnect()
        gain.disconnect()
      },
      { once: true },
    )
    this.#activeVoices.add(voice)
    source.start(startTime, zone.startOffsetSecond)

    if (request.noteOffMode === 'linear-release') {
      const releaseStartTime = startTime + request.durationSecond
      const releaseEndTime = releaseStartTime + request.releaseSecond
      gain.gain.setValueAtTime(velocityGain, releaseStartTime)
      gain.gain.linearRampToValueAtTime(0, releaseEndTime)
      source.stop(releaseEndTime + 0.01)
    }

    return Object.freeze({
      effectiveNaturalEndSecond,
      endsBeforeRequestedNoteOff: effectiveNaturalEndSecond < request.durationSecond,
      pitch: request.pitch,
      playbackRate,
      releaseSecond: request.noteOffMode === 'linear-release' ? request.releaseSecond : null,
      resourceKey: zone.resource.key,
      velocityGain,
      zoneId: zone.zoneId,
    })
  }

  stopAll(): void {
    for (const voice of this.#activeVoices) {
      try {
        voice.source.stop()
      } catch {
        // An already-ended source is removed by its ended listener.
      }
      voice.source.disconnect()
      voice.gain.disconnect()
    }
    this.#activeVoices.clear()
  }

  clearDecodedResources(): void {
    this.#assertUsable()
    this.#resourceRequests.clear()
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    this.stopAll()
    this.#resourceRequests.clear()
    this.#manifestRequest = null
    const context = this.#audioContext
    this.#audioContext = null
    if (context !== null && context.state !== 'closed') await context.close()
  }

  #assertUsable(): void {
    if (this.#disposed) fail('disposed', 'audition session is disposed')
  }

  async #loadManifest(): Promise<SampleInstrumentManifestV1> {
    const response = await this.#fetchNoStore(
      new URL('manifest.json', this.#assetBaseUrl),
      'Manifest request',
    )
    if (!response.ok) {
      fail('resource-load-failed', `Manifest request failed with HTTP ${response.status}`)
    }
    try {
      return parseSampleInstrumentManifestV1(await response.json())
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown Manifest failure'
      fail('resource-load-failed', `Manifest validation failed: ${detail}`)
    }
  }

  async #ensureAudioContext(): Promise<AudioContext> {
    this.#assertUsable()
    let context = this.#audioContext
    if (context === null) {
      try {
        context = this.#audioContextFactory()
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown AudioContext failure'
        fail('audio-context-failed', detail)
      }
      this.#audioContext = context
    }
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'unknown AudioContext resume failure'
        fail('audio-context-failed', detail)
      }
    }
    if (context.state !== 'running') {
      fail('audio-context-failed', `AudioContext is ${context.state}`)
    }
    return context
  }

  async #loadResource(key: string, context: AudioContext): Promise<LoadedResourceResult> {
    const existing = this.#resourceRequests.get(key)
    if (existing !== undefined) {
      return Object.freeze({ cacheHit: true, resource: await existing })
    }
    const request = this.#fetchAndDecodeResource(key, context)
    this.#resourceRequests.set(key, request)
    try {
      return Object.freeze({ cacheHit: false, resource: await request })
    } catch (error) {
      if (this.#resourceRequests.get(key) === request) this.#resourceRequests.delete(key)
      throw error
    }
  }

  async #fetchAndDecodeResource(
    key: string,
    context: AudioContext,
  ): Promise<LoadedAuditionResource> {
    const fetchStarted = this.#now()
    const response = await this.#fetchNoStore(
      resolveSampleResourceUrl(this.#assetBaseUrl, key),
      `${key}: request`,
    )
    if (!response.ok) {
      fail('resource-load-failed', `${key}: request failed with HTTP ${response.status}`)
    }
    const encoded = await response.arrayBuffer()
    const fetchDurationMillisecond = this.#now() - fetchStarted
    const decodeStarted = this.#now()
    let buffer: AudioBuffer
    try {
      buffer = await context.decodeAudioData(encoded.slice(0))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown audio decode failure'
      fail('resource-load-failed', `${key}: ${detail}`)
    }
    const decodeDurationMillisecond = this.#now() - decodeStarted
    return Object.freeze({
      buffer,
      measurement: Object.freeze({
        channelCount: buffer.numberOfChannels,
        decodeDurationMillisecond,
        encodedByteLength: encoded.byteLength,
        fetchDurationMillisecond,
        frameCount: buffer.length,
        key,
        sampleRateHz: buffer.sampleRate,
      }),
    })
  }

  async #fetchNoStore(url: URL, label: string): Promise<Response> {
    try {
      return await this.#fetch(url, { cache: 'no-store' })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown Fetch failure'
      fail('resource-load-failed', `${label} failed: ${detail}`)
    }
  }

  async #measureResourceKeys(
    keys: readonly string[],
  ): Promise<SampleInstrumentBrowserLoadMeasurement> {
    const context = await this.#ensureAudioContext()
    const started = this.#now()
    const loaded = await Promise.all(keys.map((key) => this.#loadResource(key, context)))
    const resources = loaded
      .map(({ resource }) => resource.measurement)
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    return Object.freeze({
      cacheHitCount: loaded.filter(({ cacheHit }) => cacheHit).length,
      decodedFloat32ByteLength: resources.reduce(
        (total, resource) =>
          total + resource.frameCount * resource.channelCount * Float32Array.BYTES_PER_ELEMENT,
        0,
      ),
      encodedByteLength: resources.reduce(
        (total, resource) => total + resource.encodedByteLength,
        0,
      ),
      resourceCount: resources.length,
      resources: Object.freeze(resources),
      wallDurationMillisecond: this.#now() - started,
    })
  }
}

export function createSampleInstrumentAuditionSession(
  options: SampleInstrumentAuditionSessionOptions,
): SampleInstrumentAuditionSession {
  return new SampleInstrumentAuditionSession(options)
}
