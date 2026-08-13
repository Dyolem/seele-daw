import type { SoundbankId } from '@seele-daw/playback'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import {
  SampleInstrumentManifestError,
  parseSampleInstrumentManifestV1,
} from '#internal/sample-instrument/contract/manifest-validator'
import {
  SupportedWavFileError,
  parseSupportedWavMetadata,
} from '#internal/sample-instrument/contract/wav-file'
import { resolveSampleResourceUrl } from '#internal/sample-instrument/contract/resource-key'

export interface SampleInstrumentAssetLocation {
  readonly assetBaseUrl: string | URL
  readonly soundbankId: SoundbankId
}

export interface SampleInstrumentResourceCacheOptions {
  readonly audioContext: BaseAudioContext
  readonly expectedOrigin: string
  readonly fetch?: typeof globalThis.fetch
  readonly limits: SampleInstrumentResourceCacheLimits
}

export interface SampleInstrumentResourceCacheLimits {
  readonly maximumManifestByteLength: number
  readonly maximumResourceByteLength: number
}

export interface LoadedSampleInstrumentResource {
  readonly audioBuffer: AudioBuffer
  readonly encodedByteLength: number
  readonly key: string
}

export interface PreparedSampleInstrumentResources {
  readonly manifest: SampleInstrumentManifestV1
  readonly resources: readonly LoadedSampleInstrumentResource[]
}

export interface SampleInstrumentResourceCacheStatistics {
  readonly activeRequestCount: number
  readonly decodedFloat32ByteLength: number
  readonly decodedResourceCount: number
  readonly encodedResourceByteLength: number
  readonly manifestCount: number
}

export type SampleInstrumentResourceCacheErrorCode =
  | 'aborted'
  | 'disposed'
  | 'invalid-asset-location'
  | 'invalid-configuration'
  | 'manifest-invalid'
  | 'manifest-load-failed'
  | 'manifest-too-large'
  | 'resource-decode-failed'
  | 'resource-invalid'
  | 'resource-load-failed'
  | 'resource-too-large'
  | 'soundbank-mismatch'

export class SampleInstrumentResourceCacheError extends Error {
  readonly code: SampleInstrumentResourceCacheErrorCode
  readonly resourceKey: string | null
  readonly soundbankId: SoundbankId | null

  constructor(
    code: SampleInstrumentResourceCacheErrorCode,
    message: string,
    options: {
      readonly resourceKey?: string
      readonly soundbankId?: SoundbankId
    } = {},
  ) {
    super(message)
    this.name = 'SampleInstrumentResourceCacheError'
    this.code = code
    this.resourceKey = options.resourceKey ?? null
    this.soundbankId = options.soundbankId ?? null
  }
}

interface NormalizedAssetLocation {
  readonly baseUrl: URL
  readonly soundbankId: SoundbankId
}

interface SharedRequest<T> {
  readonly abortController: AbortController
  readonly promise: Promise<T>
  waiterCount: number
}

function fail(
  code: SampleInstrumentResourceCacheErrorCode,
  message: string,
  options?: {
    readonly resourceKey?: string
    readonly soundbankId?: SoundbankId
  },
): never {
  throw new SampleInstrumentResourceCacheError(code, message, options)
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) fail('aborted', 'Sample resource preparation was aborted')
}

function normalizeExpectedOrigin(expectedOrigin: string): string {
  let url: URL
  try {
    url = new URL(expectedOrigin)
  } catch {
    fail('invalid-configuration', 'expectedOrigin must be an absolute HTTP(S) origin')
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.origin !== url.href.replace(/\/$/, '')
  ) {
    fail('invalid-configuration', 'expectedOrigin must contain only an HTTP(S) origin')
  }
  return url.origin
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('invalid-configuration', `${name} must be a positive safe integer`)
  }
}

function validateLimits(limits: SampleInstrumentResourceCacheLimits): void {
  assertPositiveSafeInteger(limits.maximumManifestByteLength, 'maximumManifestByteLength')
  assertPositiveSafeInteger(limits.maximumResourceByteLength, 'maximumResourceByteLength')
}

function normalizeLocation(
  input: SampleInstrumentAssetLocation,
  expectedOrigin: string,
): NormalizedAssetLocation {
  let baseUrl: URL
  try {
    baseUrl = new URL(input.assetBaseUrl)
  } catch {
    fail('invalid-asset-location', 'assetBaseUrl must be an absolute URL', {
      soundbankId: input.soundbankId,
    })
  }
  if (
    (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
    baseUrl.origin !== expectedOrigin ||
    baseUrl.username !== '' ||
    baseUrl.password !== '' ||
    !baseUrl.pathname.endsWith('/') ||
    baseUrl.search !== '' ||
    baseUrl.hash !== ''
  ) {
    fail(
      'invalid-asset-location',
      'assetBaseUrl must be a same-origin HTTP(S) directory URL without query or hash',
      { soundbankId: input.soundbankId },
    )
  }
  return Object.freeze({ baseUrl, soundbankId: input.soundbankId })
}

function identityForManifest(location: NormalizedAssetLocation): string {
  return JSON.stringify([location.soundbankId, location.baseUrl.href])
}

function identityForResource(location: NormalizedAssetLocation, resourceKey: string): string {
  return JSON.stringify([location.soundbankId, location.baseUrl.href, resourceKey])
}

function decodedFloat32ByteLength(resource: LoadedSampleInstrumentResource): number {
  return (
    resource.audioBuffer.length *
    resource.audioBuffer.numberOfChannels *
    Float32Array.BYTES_PER_ELEMENT
  )
}

/**
 * Application-lifetime cache for validated Sample Instrument manifests and decoded WAV resources.
 * Individual callers may cancel their wait without invalidating another caller sharing the request.
 */
export class SampleInstrumentResourceCache {
  readonly #audioContext: BaseAudioContext
  readonly #expectedOrigin: string
  readonly #fetch: typeof globalThis.fetch
  readonly #limits: SampleInstrumentResourceCacheLimits
  readonly #manifestRequests = new Map<string, SharedRequest<SampleInstrumentManifestV1>>()
  readonly #manifests = new Map<string, SampleInstrumentManifestV1>()
  readonly #resourceRequests = new Map<string, SharedRequest<LoadedSampleInstrumentResource>>()
  readonly #resources = new Map<string, LoadedSampleInstrumentResource>()
  #disposed = false

  constructor(options: SampleInstrumentResourceCacheOptions) {
    if (typeof options.audioContext.decodeAudioData !== 'function') {
      fail('invalid-configuration', 'audioContext must support decodeAudioData')
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch
    if (typeof fetchImplementation !== 'function') {
      fail('invalid-configuration', 'Fetch is unavailable')
    }
    validateLimits(options.limits)
    this.#audioContext = options.audioContext
    this.#expectedOrigin = normalizeExpectedOrigin(options.expectedOrigin)
    this.#fetch = fetchImplementation.bind(globalThis)
    this.#limits = Object.freeze({ ...options.limits })
  }

  get statistics(): SampleInstrumentResourceCacheStatistics {
    return Object.freeze({
      activeRequestCount: this.#manifestRequests.size + this.#resourceRequests.size,
      decodedFloat32ByteLength: [...this.#resources.values()].reduce(
        (total, resource) => total + decodedFloat32ByteLength(resource),
        0,
      ),
      decodedResourceCount: this.#resources.size,
      encodedResourceByteLength: [...this.#resources.values()].reduce(
        (total, resource) => total + resource.encodedByteLength,
        0,
      ),
      manifestCount: this.#manifests.size,
    })
  }

  async loadManifest(
    locationInput: SampleInstrumentAssetLocation,
    signal?: AbortSignal,
  ): Promise<SampleInstrumentManifestV1> {
    this.#assertUsable()
    throwIfAborted(signal)
    const location = normalizeLocation(locationInput, this.#expectedOrigin)
    const identity = identityForManifest(location)
    const cached = this.#manifests.get(identity)
    if (cached !== undefined) return cached

    return this.#joinRequest(
      this.#manifestRequests,
      identity,
      (requestSignal) => this.#fetchManifest(location, requestSignal),
      signal,
      (manifest) => this.#manifests.set(identity, manifest),
    )
  }

  async prepare(
    locationInput: SampleInstrumentAssetLocation,
    resourceKeys: readonly string[],
    signal?: AbortSignal,
  ): Promise<PreparedSampleInstrumentResources> {
    this.#assertUsable()
    throwIfAborted(signal)
    const location = normalizeLocation(locationInput, this.#expectedOrigin)
    const manifest = await this.loadManifest(locationInput, signal)
    this.#assertUsable()
    throwIfAborted(signal)
    const knownResourceKeys = new Set(manifest.zones.map(({ resource }) => resource.key))
    const uniqueResourceKeys = [...new Set(resourceKeys)].sort()
    for (const resourceKey of uniqueResourceKeys) {
      if (!knownResourceKeys.has(resourceKey)) {
        fail('resource-invalid', 'resource key is not declared by the Manifest', {
          resourceKey,
          soundbankId: location.soundbankId,
        })
      }
    }

    const resources = await Promise.all(
      uniqueResourceKeys.map((resourceKey) => this.#loadResource(location, resourceKey, signal)),
    )
    this.#assertUsable()
    throwIfAborted(signal)
    return Object.freeze({ manifest, resources: Object.freeze(resources) })
  }

  /** Clears decoded buffers and pending resource work while retaining validated Manifests. */
  clearDecodedResources(): void {
    this.#assertUsable()
    for (const request of this.#resourceRequests.values()) request.abortController.abort()
    this.#resourceRequests.clear()
    this.#resources.clear()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const request of this.#manifestRequests.values()) request.abortController.abort()
    for (const request of this.#resourceRequests.values()) request.abortController.abort()
    this.#manifestRequests.clear()
    this.#resourceRequests.clear()
    this.#manifests.clear()
    this.#resources.clear()
  }

  #assertUsable(): void {
    if (this.#disposed) fail('disposed', 'Sample Instrument resource cache is disposed')
  }

  async #joinRequest<T>(
    requests: Map<string, SharedRequest<T>>,
    identity: string,
    start: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal | undefined,
    save: (value: T) => void,
  ): Promise<T> {
    let request = requests.get(identity)
    if (request === undefined) {
      const abortController = new AbortController()
      const promise = start(abortController.signal)
      request = { abortController, promise, waiterCount: 0 }
      requests.set(identity, request)
      void promise
        .then((value) => {
          if (!this.#disposed && requests.get(identity) === request) save(value)
        })
        .catch(() => undefined)
        .finally(() => {
          if (requests.get(identity) === request) requests.delete(identity)
        })
    }

    request.waiterCount += 1
    try {
      return await this.#waitForCaller(request.promise, signal)
    } finally {
      request.waiterCount -= 1
      if (request.waiterCount === 0 && requests.get(identity) === request) {
        // A retry must never join an abandoned request whose Fetch has not observed abort yet.
        requests.delete(identity)
        request.abortController.abort()
      }
    }
  }

  async #waitForCaller<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal)
    if (signal === undefined) return promise

    return new Promise<T>((resolve, reject) => {
      let settled = false
      const handleAbort = () => {
        if (settled) return
        settled = true
        reject(new SampleInstrumentResourceCacheError('aborted', 'Preparation was aborted'))
      }
      signal.addEventListener('abort', handleAbort, { once: true })
      void promise.then(
        (value) => {
          if (settled) return
          settled = true
          signal.removeEventListener('abort', handleAbort)
          resolve(value)
        },
        (error: unknown) => {
          if (settled) return
          settled = true
          signal.removeEventListener('abort', handleAbort)
          reject(error)
        },
      )
      if (signal.aborted) handleAbort()
    })
  }

  async #fetchManifest(
    location: NormalizedAssetLocation,
    signal: AbortSignal,
  ): Promise<SampleInstrumentManifestV1> {
    let response: Response
    try {
      response = await this.#fetch(new URL('manifest.json', location.baseUrl), {
        signal,
      })
    } catch (error) {
      if (signal.aborted) fail('aborted', 'Manifest request was aborted')
      fail('manifest-load-failed', `Manifest request failed: ${errorDetail(error)}`, {
        soundbankId: location.soundbankId,
      })
    }
    if (!response.ok) {
      fail('manifest-load-failed', `Manifest request failed with HTTP ${response.status}`, {
        soundbankId: location.soundbankId,
      })
    }

    let encoded: ArrayBuffer
    try {
      encoded = await this.#readBoundedResponse(
        response,
        this.#limits.maximumManifestByteLength,
        'manifest-too-large',
        'Manifest',
        { soundbankId: location.soundbankId },
      )
    } catch (error) {
      if (error instanceof SampleInstrumentResourceCacheError) throw error
      if (signal.aborted) fail('aborted', 'Manifest request was aborted')
      fail('manifest-load-failed', `Manifest response failed: ${errorDetail(error)}`, {
        soundbankId: location.soundbankId,
      })
    }
    if (signal.aborted || this.#disposed) {
      fail('aborted', 'Manifest result is no longer requested')
    }

    let manifest: SampleInstrumentManifestV1
    try {
      const json = new TextDecoder('utf-8', { fatal: true }).decode(encoded)
      manifest = parseSampleInstrumentManifestV1(JSON.parse(json))
    } catch (error) {
      const detail =
        error instanceof SampleInstrumentManifestError ? error.message : errorDetail(error)
      fail('manifest-invalid', `Manifest validation failed: ${detail}`, {
        soundbankId: location.soundbankId,
      })
    }
    if (manifest.soundbankId !== location.soundbankId) {
      fail(
        'soundbank-mismatch',
        `Manifest declares ${manifest.soundbankId} instead of ${location.soundbankId}`,
        { soundbankId: location.soundbankId },
      )
    }
    return manifest
  }

  async #loadResource(
    location: NormalizedAssetLocation,
    resourceKey: string,
    signal?: AbortSignal,
  ): Promise<LoadedSampleInstrumentResource> {
    this.#assertUsable()
    const identity = identityForResource(location, resourceKey)
    throwIfAborted(signal)
    const cached = this.#resources.get(identity)
    if (cached !== undefined) return cached
    return this.#joinRequest(
      this.#resourceRequests,
      identity,
      (requestSignal) => this.#fetchAndDecode(location, resourceKey, requestSignal),
      signal,
      (resource) => this.#resources.set(identity, resource),
    )
  }

  async #fetchAndDecode(
    location: NormalizedAssetLocation,
    resourceKey: string,
    signal: AbortSignal,
  ): Promise<LoadedSampleInstrumentResource> {
    let response: Response
    try {
      response = await this.#fetch(resolveSampleResourceUrl(location.baseUrl, resourceKey), {
        signal,
      })
    } catch (error) {
      if (signal.aborted) fail('aborted', `${resourceKey}: request was aborted`)
      fail('resource-load-failed', `${resourceKey}: request failed: ${errorDetail(error)}`, {
        resourceKey,
        soundbankId: location.soundbankId,
      })
    }
    if (!response.ok) {
      fail('resource-load-failed', `${resourceKey}: request failed with HTTP ${response.status}`, {
        resourceKey,
        soundbankId: location.soundbankId,
      })
    }

    let encoded: ArrayBuffer
    try {
      encoded = await this.#readBoundedResponse(
        response,
        this.#limits.maximumResourceByteLength,
        'resource-too-large',
        resourceKey,
        { resourceKey, soundbankId: location.soundbankId },
      )
    } catch (error) {
      if (error instanceof SampleInstrumentResourceCacheError) throw error
      if (signal.aborted) fail('aborted', `${resourceKey}: request was aborted`)
      fail('resource-load-failed', `${resourceKey}: response failed: ${errorDetail(error)}`, {
        resourceKey,
        soundbankId: location.soundbankId,
      })
    }
    try {
      parseSupportedWavMetadata(new Uint8Array(encoded))
    } catch (error) {
      const detail = error instanceof SupportedWavFileError ? error.detail : errorDetail(error)
      fail('resource-invalid', `${resourceKey}: ${detail}`, {
        resourceKey,
        soundbankId: location.soundbankId,
      })
    }
    throwIfAborted(signal)

    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await this.#audioContext.decodeAudioData(encoded.slice(0))
    } catch (error) {
      fail('resource-decode-failed', `${resourceKey}: ${errorDetail(error)}`, {
        resourceKey,
        soundbankId: location.soundbankId,
      })
    }
    if (signal.aborted || this.#disposed) {
      fail('aborted', `${resourceKey}: decoded result is no longer requested`)
    }
    return Object.freeze({ audioBuffer, encodedByteLength: encoded.byteLength, key: resourceKey })
  }

  async #readBoundedResponse(
    response: Response,
    maximumByteLength: number,
    tooLargeCode: 'manifest-too-large' | 'resource-too-large',
    label: string,
    context: {
      readonly resourceKey?: string
      readonly soundbankId?: SoundbankId
    },
  ): Promise<ArrayBuffer> {
    const contentLength = response.headers.get('content-length')
    if (contentLength !== null && /^\d+$/.test(contentLength)) {
      const declaredByteLength = Number(contentLength)
      if (!Number.isSafeInteger(declaredByteLength) || declaredByteLength > maximumByteLength) {
        await response.body?.cancel().catch(() => undefined)
        fail(tooLargeCode, `${label} exceeds the configured byte budget`, context)
      }
    }

    if (response.body === null) return new ArrayBuffer(0)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let byteLength = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        byteLength += value.byteLength
        if (!Number.isSafeInteger(byteLength) || byteLength > maximumByteLength) {
          await reader.cancel().catch(() => undefined)
          fail(tooLargeCode, `${label} exceeds the configured byte budget`, context)
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }

    const bytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes.buffer
  }
}
