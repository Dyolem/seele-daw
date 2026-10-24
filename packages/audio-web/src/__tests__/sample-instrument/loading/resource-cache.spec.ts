import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import { SampleInstrumentResourceCache } from '#internal/sample-instrument/loading/resource-cache'
import {
  FIXTURE_SOUNDBANK_ID,
  FakeDecodeAudioContext,
  createDecodedAudioBuffer,
  createManifestResponse,
  createPcmWav,
} from '#internal/__tests__/support/sample-instrument-resource-fixture'

const BASE_URL = new URL('https://studio.test/assets/fixture-piano/')
const SECOND_BASE_URL = new URL('https://studio.test/assets/fixture-strings/')
const ABORTED = expect.objectContaining({ name: 'AbortError' })

function createCache(
  fetchImplementation: typeof globalThis.fetch,
  context = new FakeDecodeAudioContext(),
  limits: Partial<ConstructorParameters<typeof SampleInstrumentResourceCache>[0]['limits']> = {},
) {
  return new SampleInstrumentResourceCache({
    audioContext: context as unknown as BaseAudioContext,
    fetch: fetchImplementation,
    limits: {
      maximumDecodedFloat32ByteLength: 4 * 1_024 * 1_024,
      maximumManifestByteLength: 64 * 1_024,
      maximumResourceByteLength: 4 * 1_024 * 1_024,
      ...limits,
    },
  })
}

function createSuccessfulFetch() {
  return vi.fn<typeof globalThis.fetch>(async (input) =>
    String(input).endsWith('manifest.json')
      ? createManifestResponse()
      : new Response(createPcmWav()),
  )
}

describe('Sample Instrument resource cache', () => {
  it('loads only the requested resources and reuses decoded results', async () => {
    const fetchImplementation = createSuccessfulFetch()
    const decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>(async () =>
      createDecodedAudioBuffer(),
    )
    const cache = createCache(fetchImplementation, new FakeDecodeAudioContext(decodeAudioData))

    const manifest = await cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)
    const first = await cache.loadResources(BASE_URL, ['samples/low.wav', 'samples/low.wav'])
    const second = await cache.loadResources(BASE_URL, ['samples/low.wav'])

    expect(manifest.soundbankId).toBe(FIXTURE_SOUNDBANK_ID)
    expect([...first.keys()]).toEqual(['samples/low.wav'])
    expect(second.get('samples/low.wav')).toBe(first.get('samples/low.wav'))
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(decodeAudioData).toHaveBeenCalledOnce()
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 800,
      decodedResourceCount: 1,
      encodedResourceByteLength: createPcmWav().byteLength,
      manifestCount: 1,
    })
  })

  it('forgets failed fetch and decode requests so a later preparation can retry', async () => {
    let resourceRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async () => {
      resourceRequestCount += 1
      return resourceRequestCount === 1
        ? new Response(null, { status: 503 })
        : new Response(createPcmWav())
    })
    const cache = createCache(fetchImplementation)

    await expect(cache.loadResources(BASE_URL, ['samples/low.wav'])).rejects.toThrow(
      'samples/low.wav could not be loaded: HTTP 503',
    )
    await expect(cache.loadResources(BASE_URL, ['samples/low.wav'])).resolves.toHaveProperty(
      'size',
      1,
    )
    expect(resourceRequestCount).toBe(2)

    const decodeAudioData = vi
      .fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>()
      .mockRejectedValueOnce(new TypeError('fixture decode failure'))
      .mockResolvedValue(createDecodedAudioBuffer())
    const decodeCache = createCache(
      createSuccessfulFetch(),
      new FakeDecodeAudioContext(decodeAudioData),
    )
    await expect(decodeCache.loadResources(BASE_URL, ['samples/high.wav'])).rejects.toThrow(
      'samples/high.wav could not be decoded: fixture decode failure',
    )
    await expect(decodeCache.loadResources(BASE_URL, ['samples/high.wav'])).resolves.toBeDefined()
    expect(decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('bounds retained decoded resources with least-recently-used eviction', async () => {
    const fetchImplementation = createSuccessfulFetch()
    const decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>(async () =>
      createDecodedAudioBuffer(),
    )
    const cache = createCache(fetchImplementation, new FakeDecodeAudioContext(decodeAudioData), {
      maximumDecodedFloat32ByteLength: 1_600,
    })

    await cache.loadResources(BASE_URL, ['samples/low.wav'])
    await cache.loadResources(BASE_URL, ['samples/high.wav'])
    await cache.loadResources(BASE_URL, ['samples/low.wav'])
    // The same key under another Soundbank is another resource.
    await cache.loadResources(SECOND_BASE_URL, ['samples/low.wav'])
    await cache.loadResources(BASE_URL, ['samples/low.wav'])
    await cache.loadResources(BASE_URL, ['samples/high.wav'])

    expect(fetchImplementation).toHaveBeenCalledTimes(4)
    expect(decodeAudioData).toHaveBeenCalledTimes(4)
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 1_600,
      decodedResourceCount: 2,
      encodedResourceByteLength: createPcmWav().byteLength * 2,
      manifestCount: 0,
    })
  })

  it('serves an oversized decoded resource without evicting reusable cached entries', async () => {
    const fetchImplementation = createSuccessfulFetch()
    const decodeAudioData = vi
      .fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>()
      .mockResolvedValueOnce(createDecodedAudioBuffer())
      .mockResolvedValueOnce(createDecodedAudioBuffer(200))
    const cache = createCache(fetchImplementation, new FakeDecodeAudioContext(decodeAudioData), {
      maximumDecodedFloat32ByteLength: 800,
    })

    const retained = await cache.loadResources(BASE_URL, ['samples/low.wav'])
    const oversized = await cache.loadResources(BASE_URL, ['samples/high.wav'])
    const retainedAgain = await cache.loadResources(BASE_URL, ['samples/low.wav'])

    expect(oversized.get('samples/high.wav')?.audioBuffer.length).toBe(200)
    expect(retainedAgain.get('samples/low.wav')).toBe(retained.get('samples/low.wav'))
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(decodeAudioData).toHaveBeenCalledTimes(2)
    expect(cache.statistics).toMatchObject({
      decodedFloat32ByteLength: 800,
      decodedResourceCount: 1,
    })
  })

  it('forgets a failed Manifest request so the same Soundbank can retry', async () => {
    let manifestRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async () => {
      manifestRequestCount += 1
      return manifestRequestCount === 1
        ? new Response(null, { status: 503 })
        : createManifestResponse()
    })
    const cache = createCache(fetchImplementation)

    await expect(cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)).rejects.toThrow(
      'The fixture-piano Manifest could not be loaded: HTTP 503',
    )
    await expect(cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)).resolves.toEqual(
      expect.objectContaining({ soundbankId: FIXTURE_SOUNDBANK_ID }),
    )
    expect(manifestRequestCount).toBe(2)
  })

  it('rejects a Manifest that declares another Soundbank', async () => {
    const cache = createCache(
      vi.fn<typeof globalThis.fetch>(async () =>
        createManifestResponse(parseSoundbankId('other-soundbank')),
      ),
    )

    await expect(cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)).rejects.toThrow(
      'The fixture-piano Manifest declares other-soundbank',
    )
  })

  it('lets one caller cancel without aborting another caller sharing the same request', async () => {
    let resolveResource: ((response: Response) => void) | undefined
    let sharedRequestSignal: AbortSignal | undefined
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      sharedRequestSignal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        resolveResource = resolve
      })
    })
    const cache = createCache(fetchImplementation)
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = cache.loadResources(BASE_URL, ['samples/low.wav'], firstController.signal)
    const second = cache.loadResources(BASE_URL, ['samples/low.wav'], secondController.signal)

    await vi.waitFor(() => expect(resolveResource).toBeDefined())
    firstController.abort()
    await expect(first).rejects.toEqual(ABORTED)
    expect(sharedRequestSignal?.aborted).toBe(false)
    resolveResource?.(new Response(createPcmWav()))
    await expect(second).resolves.toHaveProperty('size', 1)
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('aborts the underlying request when every waiter leaves and ignores its late completion', async () => {
    let resolveResource: ((response: Response) => void) | undefined
    let resourceSignal: AbortSignal | undefined
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      resourceSignal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        resolveResource = resolve
      })
    })
    const cache = createCache(fetchImplementation)
    const controller = new AbortController()
    const loading = cache.loadResources(BASE_URL, ['samples/low.wav'], controller.signal)

    await vi.waitFor(() => expect(resolveResource).toBeDefined())
    controller.abort()
    await expect(loading).rejects.toEqual(ABORTED)
    expect(resourceSignal?.aborted).toBe(true)
    resolveResource?.(new Response(createPcmWav()))
    await vi.waitFor(() => expect(cache.statistics.activeRequestCount).toBe(0))
    expect(cache.statistics.decodedResourceCount).toBe(0)
  })

  it('allows an immediate retry after the last waiter cancels an unresolved request', async () => {
    let resolveFirstResource: ((response: Response) => void) | undefined
    let resourceRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async () => {
      resourceRequestCount += 1
      if (resourceRequestCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirstResource = resolve
        })
      }
      return new Response(createPcmWav())
    })
    const cache = createCache(fetchImplementation)
    const controller = new AbortController()
    const first = cache.loadResources(BASE_URL, ['samples/low.wav'], controller.signal)

    await vi.waitFor(() => expect(resolveFirstResource).toBeDefined())
    controller.abort()
    await expect(first).rejects.toEqual(ABORTED)
    await expect(cache.loadResources(BASE_URL, ['samples/low.wav'])).resolves.toBeDefined()
    expect(resourceRequestCount).toBe(2)
    resolveFirstResource?.(new Response(createPcmWav()))
  })

  it('enforces response byte budgets before retaining or decoding input', async () => {
    const decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>()
    const cache = createCache(
      createSuccessfulFetch(),
      new FakeDecodeAudioContext(decodeAudioData),
      {
        maximumManifestByteLength: 8,
        maximumResourceByteLength: 8,
      },
    )

    await expect(cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)).rejects.toThrow(
      'The fixture-piano Manifest could not be loaded: exceeds the byte budget of 8 bytes',
    )
    await expect(cache.loadResources(BASE_URL, ['samples/low.wav'])).rejects.toThrow(
      'samples/low.wav could not be loaded: exceeds the byte budget of 8 bytes',
    )
    expect(decodeAudioData).not.toHaveBeenCalled()
  })

  it('disposes idempotently without owning the AudioContext', async () => {
    const cache = createCache(createSuccessfulFetch())
    await cache.loadResources(BASE_URL, ['samples/low.wav'])

    cache.dispose()
    cache.dispose()
    expect(cache.statistics.decodedResourceCount).toBe(0)
    await expect(cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)).rejects.toThrow(
      'The sample resource cache is disposed',
    )
  })

  it('aborts pending work on dispose and does not retain a late result', async () => {
    let resolveManifest: ((response: Response) => void) | undefined
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Promise<Response>((resolve) => {
          resolveManifest = resolve
        }),
    )
    const cache = createCache(fetchImplementation)
    const pending = cache.loadManifest(BASE_URL, FIXTURE_SOUNDBANK_ID)

    await vi.waitFor(() => expect(resolveManifest).toBeDefined())
    cache.dispose()
    resolveManifest?.(createManifestResponse())
    await expect(pending).rejects.toEqual(ABORTED)
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 0,
      decodedResourceCount: 0,
      encodedResourceByteLength: 0,
      manifestCount: 0,
    })
  })
})
