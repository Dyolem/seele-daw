import type { SoundbankId } from '@seele-daw/playback'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest-validator'
import { resolveSampleResourceUrl } from '#internal/sample-instrument/contract/resource-key'

export interface SampleInstrumentResourceCacheOptions {
  readonly audioContext: BaseAudioContext
  readonly fetch?: typeof globalThis.fetch
  readonly limits: SampleInstrumentResourceCacheLimits
}

export interface SampleInstrumentResourceCacheLimits {
  /** Decoded Float32 bytes kept for reuse; voices still playing may hold more. */
  readonly maximumDecodedFloat32ByteLength: number
  readonly maximumManifestByteLength: number
  readonly maximumResourceByteLength: number
}

export interface LoadedSampleInstrumentResource {
  readonly audioBuffer: AudioBuffer
  readonly encodedByteLength: number
  readonly key: string
}

export interface SampleInstrumentResourceCacheStatistics {
  readonly activeRequestCount: number
  readonly decodedFloat32ByteLength: number
  readonly decodedResourceCount: number
  readonly encodedResourceByteLength: number
  readonly manifestCount: number
}

interface SharedRequest<T> {
  readonly abortController: AbortController
  readonly promise: Promise<T>
  waiterCount: number
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function aborted(what: string): DOMException {
  return new DOMException(`${what} was aborted`, 'AbortError')
}

function decodedFloat32ByteLength(resource: LoadedSampleInstrumentResource): number {
  return (
    resource.audioBuffer.length *
    resource.audioBuffer.numberOfChannels *
    Float32Array.BYTES_PER_ELEMENT
  )
}

async function readBoundedBody(
  response: Response,
  maximumByteLength: number,
): Promise<ArrayBuffer> {
  const tooLarge = () => new Error(`exceeds the byte budget of ${maximumByteLength} bytes`)
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > maximumByteLength) {
    await response.body?.cancel().catch(() => undefined)
    throw tooLarge()
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
      if (byteLength > maximumByteLength) {
        await reader.cancel().catch(() => undefined)
        throw tooLarge()
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

/**
 * Application-lifetime cache of Manifests and decoded WAV resources, keyed by URL. Decoded
 * resources stay within an LRU byte budget. Callers asking for the same URL share one request,
 * and one caller cancelling does not cancel it for the others.
 */
export class SampleInstrumentResourceCache {
  readonly #audioContext: BaseAudioContext
  readonly #fetch: typeof globalThis.fetch
  readonly #limits: SampleInstrumentResourceCacheLimits
  readonly #manifestRequests = new Map<string, SharedRequest<SampleInstrumentManifestV1>>()
  readonly #manifests = new Map<string, SampleInstrumentManifestV1>()
  readonly #resourceRequests = new Map<string, SharedRequest<LoadedSampleInstrumentResource>>()
  readonly #resources = new Map<string, LoadedSampleInstrumentResource>()
  #decodedFloat32ByteLength = 0
  #encodedResourceByteLength = 0
  #disposed = false

  constructor(options: SampleInstrumentResourceCacheOptions) {
    this.#audioContext = options.audioContext
    this.#fetch = (options.fetch ?? globalThis.fetch).bind(globalThis)
    this.#limits = Object.freeze({ ...options.limits })
  }

  get statistics(): SampleInstrumentResourceCacheStatistics {
    return Object.freeze({
      activeRequestCount: this.#manifestRequests.size + this.#resourceRequests.size,
      decodedFloat32ByteLength: this.#decodedFloat32ByteLength,
      decodedResourceCount: this.#resources.size,
      encodedResourceByteLength: this.#encodedResourceByteLength,
      manifestCount: this.#manifests.size,
    })
  }

  /** The Manifest in `baseUrl`, which must declare `soundbankId`. */
  async loadManifest(
    baseUrl: URL,
    soundbankId: SoundbankId,
    signal?: AbortSignal,
  ): Promise<SampleInstrumentManifestV1> {
    this.#assertUsable()
    signal?.throwIfAborted()
    const url = new URL('manifest.json', baseUrl)
    const cached = this.#manifests.get(url.href)
    if (cached !== undefined) return cached
    return this.#joinRequest(
      this.#manifestRequests,
      url.href,
      (requestSignal) => this.#fetchManifest(url, soundbankId, requestSignal),
      signal,
      (manifest) => this.#manifests.set(url.href, manifest),
    )
  }

  /** The decoded resources in `baseUrl`, by resource key. */
  async loadResources(
    baseUrl: URL,
    resourceKeys: Iterable<string>,
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, LoadedSampleInstrumentResource>> {
    this.#assertUsable()
    signal?.throwIfAborted()
    const keys = [...new Set(resourceKeys)].sort()
    const resources = await Promise.all(
      keys.map((key) => this.#loadResource(resolveSampleResourceUrl(baseUrl, key), key, signal)),
    )
    this.#assertUsable()
    signal?.throwIfAborted()
    return new Map(resources.map((resource) => [resource.key, resource]))
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
    this.#decodedFloat32ByteLength = 0
    this.#encodedResourceByteLength = 0
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error('The sample resource cache is disposed')
  }

  #loadResource(
    url: URL,
    key: string,
    signal: AbortSignal | undefined,
  ): Promise<LoadedSampleInstrumentResource> {
    const cached = this.#resources.get(url.href)
    if (cached !== undefined) {
      // Map insertion order is the LRU order; a hit moves the entry to the end.
      this.#resources.delete(url.href)
      this.#resources.set(url.href, cached)
      return Promise.resolve(cached)
    }
    return this.#joinRequest(
      this.#resourceRequests,
      url.href,
      (requestSignal) => this.#fetchAndDecode(url, key, requestSignal),
      signal,
      (resource) => this.#retainResource(url.href, resource),
    )
  }

  #retainResource(identity: string, resource: LoadedSampleInstrumentResource): void {
    const decodedByteLength = decodedFloat32ByteLength(resource)
    if (decodedByteLength > this.#limits.maximumDecodedFloat32ByteLength) return

    while (
      this.#decodedFloat32ByteLength + decodedByteLength >
      this.#limits.maximumDecodedFloat32ByteLength
    ) {
      const oldestEntry = this.#resources.entries().next()
      if (oldestEntry.done) break
      const [oldestIdentity, oldestResource] = oldestEntry.value
      this.#resources.delete(oldestIdentity)
      this.#decodedFloat32ByteLength -= decodedFloat32ByteLength(oldestResource)
      this.#encodedResourceByteLength -= oldestResource.encodedByteLength
    }

    this.#resources.set(identity, resource)
    this.#decodedFloat32ByteLength += decodedByteLength
    this.#encodedResourceByteLength += resource.encodedByteLength
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
        // A retry must never join an abandoned request whose fetch has not observed the abort yet.
        requests.delete(identity)
        request.abortController.abort()
      }
    }
  }

  #waitForCaller<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal === undefined) return promise
    signal.throwIfAborted()
    return new Promise<T>((resolve, reject) => {
      const handleAbort = () => reject(aborted('Preparation'))
      signal.addEventListener('abort', handleAbort, { once: true })
      void promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', handleAbort))
    })
  }

  async #fetchBounded(
    url: URL,
    maximumByteLength: number,
    label: string,
    signal: AbortSignal,
  ): Promise<ArrayBuffer> {
    let body: ArrayBuffer
    try {
      const response = await this.#fetch(url, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      body = await readBoundedBody(response, maximumByteLength)
    } catch (error) {
      if (signal.aborted || this.#disposed) throw aborted(label)
      throw new Error(`${label} could not be loaded: ${errorDetail(error)}`, { cause: error })
    }
    // A fetch that ignores its signal can still complete after nobody wants the result.
    if (signal.aborted || this.#disposed) throw aborted(label)
    return body
  }

  async #fetchManifest(
    url: URL,
    soundbankId: SoundbankId,
    signal: AbortSignal,
  ): Promise<SampleInstrumentManifestV1> {
    const label = `The ${soundbankId} Manifest`
    const encoded = await this.#fetchBounded(
      url,
      this.#limits.maximumManifestByteLength,
      label,
      signal,
    )
    let manifest: SampleInstrumentManifestV1
    try {
      const json = new TextDecoder('utf-8', { fatal: true }).decode(encoded)
      manifest = parseSampleInstrumentManifestV1(JSON.parse(json))
    } catch (error) {
      throw new Error(`${label} is invalid: ${errorDetail(error)}`, { cause: error })
    }
    if (manifest.soundbankId !== soundbankId) {
      throw new Error(`${label} declares ${manifest.soundbankId}`)
    }
    return manifest
  }

  async #fetchAndDecode(
    url: URL,
    key: string,
    signal: AbortSignal,
  ): Promise<LoadedSampleInstrumentResource> {
    const encoded = await this.#fetchBounded(
      url,
      this.#limits.maximumResourceByteLength,
      key,
      signal,
    )
    const encodedByteLength = encoded.byteLength
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await this.#audioContext.decodeAudioData(encoded)
    } catch (error) {
      throw new Error(`${key} could not be decoded: ${errorDetail(error)}`, { cause: error })
    }
    if (signal.aborted || this.#disposed) throw aborted(key)
    return Object.freeze({ audioBuffer, encodedByteLength, key })
  }
}
