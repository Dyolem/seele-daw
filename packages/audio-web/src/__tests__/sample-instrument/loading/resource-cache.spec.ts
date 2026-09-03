import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import {
  SampleInstrumentResourceCacheError,
  SampleInstrumentResourceCache,
} from '#internal/sample-instrument/loading/resource-cache'
import {
  FIXTURE_SOUNDBANK_ID,
  FakeDecodeAudioContext,
  createDecodedAudioBuffer,
  createManifestResponse,
  createPcmWav,
} from '#internal/__tests__/support/sample-instrument-resource-fixture'

const LOCATION = Object.freeze({
  assetBaseUrl: 'https://studio.test/assets/fixture-piano/',
  soundbankId: FIXTURE_SOUNDBANK_ID,
})
const SECOND_SOUNDBANK_ID = parseSoundbankId('fixture-strings')
const SECOND_LOCATION = Object.freeze({
  assetBaseUrl: 'https://studio.test/assets/fixture-strings/',
  soundbankId: SECOND_SOUNDBANK_ID,
})

function createCache(
  fetchImplementation: typeof globalThis.fetch,
  context = new FakeDecodeAudioContext(),
) {
  return new SampleInstrumentResourceCache({
    audioContext: context as unknown as BaseAudioContext,
    expectedOrigin: 'https://studio.test',
    fetch: fetchImplementation,
    limits: {
      maximumDecodedFloat32ByteLength: 4 * 1_024 * 1_024,
      maximumManifestByteLength: 64 * 1_024,
      maximumResourceByteLength: 4 * 1_024 * 1_024,
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
  it('validates the asset boundary, loads only requested resources, and reuses decoded results', async () => {
    const fetchImplementation = createSuccessfulFetch()
    const decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>(async () =>
      createDecodedAudioBuffer(),
    )
    const cache = createCache(fetchImplementation, new FakeDecodeAudioContext(decodeAudioData))

    const first = await cache.prepare(LOCATION, ['samples/low.wav', 'samples/low.wav'])
    const second = await cache.prepare(LOCATION, ['samples/low.wav'])

    expect(first.manifest.soundbankId).toBe(FIXTURE_SOUNDBANK_ID)
    expect(first.resources.map(({ key }) => key)).toEqual(['samples/low.wav'])
    expect(second.resources[0]).toBe(first.resources[0])
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

  it('evicts failed fetch and decode requests so a later preparation can retry', async () => {
    let resourceRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input).endsWith('manifest.json')) return createManifestResponse()
      resourceRequestCount += 1
      return resourceRequestCount === 1
        ? new Response(null, { status: 503 })
        : new Response(createPcmWav())
    })
    const cache = createCache(fetchImplementation)

    await expect(cache.prepare(LOCATION, ['samples/low.wav'])).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({
        code: 'resource-load-failed',
      }),
    )
    await expect(cache.prepare(LOCATION, ['samples/low.wav'])).resolves.toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({ soundbankId: FIXTURE_SOUNDBANK_ID }),
      }),
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
    await expect(decodeCache.prepare(LOCATION, ['samples/high.wav'])).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({
        code: 'resource-decode-failed',
      }),
    )
    await expect(decodeCache.prepare(LOCATION, ['samples/high.wav'])).resolves.toBeDefined()
    expect(decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('bounds retained decoded resources with least-recently-used eviction', async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('manifest.json')) {
        return createManifestResponse(
          url.includes('/fixture-strings/') ? SECOND_SOUNDBANK_ID : FIXTURE_SOUNDBANK_ID,
        )
      }
      return new Response(createPcmWav())
    })
    const decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>(async () =>
      createDecodedAudioBuffer(),
    )
    const cache = new SampleInstrumentResourceCache({
      audioContext: new FakeDecodeAudioContext(decodeAudioData) as unknown as BaseAudioContext,
      expectedOrigin: 'https://studio.test',
      fetch: fetchImplementation,
      limits: {
        maximumDecodedFloat32ByteLength: 1_600,
        maximumManifestByteLength: 64 * 1_024,
        maximumResourceByteLength: 4 * 1_024 * 1_024,
      },
    })

    await cache.prepare(LOCATION, ['samples/low.wav'])
    await cache.prepare(LOCATION, ['samples/high.wav'])
    await cache.prepare(LOCATION, ['samples/low.wav'])
    await cache.prepare(SECOND_LOCATION, ['samples/low.wav'])
    await cache.prepare(LOCATION, ['samples/low.wav'])
    await cache.prepare(LOCATION, ['samples/high.wav'])

    expect(fetchImplementation).toHaveBeenCalledTimes(6)
    expect(decodeAudioData).toHaveBeenCalledTimes(4)
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 1_600,
      decodedResourceCount: 2,
      encodedResourceByteLength: createPcmWav().byteLength * 2,
      manifestCount: 2,
    })
  })

  it('serves an oversized decoded resource without evicting reusable cached entries', async () => {
    const fetchImplementation = createSuccessfulFetch()
    const decodeAudioData = vi
      .fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>()
      .mockResolvedValueOnce(createDecodedAudioBuffer())
      .mockResolvedValueOnce(createDecodedAudioBuffer(200))
    const cache = new SampleInstrumentResourceCache({
      audioContext: new FakeDecodeAudioContext(decodeAudioData) as unknown as BaseAudioContext,
      expectedOrigin: 'https://studio.test',
      fetch: fetchImplementation,
      limits: {
        maximumDecodedFloat32ByteLength: 800,
        maximumManifestByteLength: 64 * 1_024,
        maximumResourceByteLength: 4 * 1_024 * 1_024,
      },
    })

    const retained = await cache.prepare(LOCATION, ['samples/low.wav'])
    const oversized = await cache.prepare(LOCATION, ['samples/high.wav'])
    const retainedAgain = await cache.prepare(LOCATION, ['samples/low.wav'])

    expect(oversized.resources[0]?.audioBuffer.length).toBe(200)
    expect(retainedAgain.resources[0]).toBe(retained.resources[0])
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    expect(decodeAudioData).toHaveBeenCalledTimes(2)
    expect(cache.statistics).toMatchObject({
      decodedFloat32ByteLength: 800,
      decodedResourceCount: 1,
    })
  })

  it('evicts a failed Manifest request so the same Soundbank can retry', async () => {
    let manifestRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async () => {
      manifestRequestCount += 1
      return manifestRequestCount === 1
        ? new Response(null, { status: 503 })
        : createManifestResponse()
    })
    const cache = createCache(fetchImplementation)

    await expect(cache.loadManifest(LOCATION)).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({
        code: 'manifest-load-failed',
      }),
    )
    await expect(cache.loadManifest(LOCATION)).resolves.toEqual(
      expect.objectContaining({ soundbankId: FIXTURE_SOUNDBANK_ID }),
    )
    expect(manifestRequestCount).toBe(2)
  })

  it('lets one caller cancel without aborting another caller sharing the same request', async () => {
    let resolveResource: ((response: Response) => void) | undefined
    let sharedRequestSignal: AbortSignal | undefined
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith('manifest.json')) return createManifestResponse()
      sharedRequestSignal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        resolveResource = resolve
      })
    })
    const cache = createCache(fetchImplementation)
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = cache.prepare(LOCATION, ['samples/low.wav'], firstController.signal)
    const second = cache.prepare(LOCATION, ['samples/low.wav'], secondController.signal)

    await vi.waitFor(() => expect(resolveResource).toBeDefined())
    firstController.abort()
    await expect(first).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({ code: 'aborted' }),
    )
    expect(sharedRequestSignal?.aborted).toBe(false)
    resolveResource?.(new Response(createPcmWav()))
    await expect(second).resolves.toBeDefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('aborts the underlying request when every waiter leaves and ignores its late completion', async () => {
    let resolveResource: ((response: Response) => void) | undefined
    let resourceSignal: AbortSignal | undefined
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith('manifest.json')) return createManifestResponse()
      resourceSignal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        resolveResource = resolve
      })
    })
    const cache = createCache(fetchImplementation)
    const controller = new AbortController()
    const preparation = cache.prepare(LOCATION, ['samples/low.wav'], controller.signal)

    await vi.waitFor(() => expect(resolveResource).toBeDefined())
    controller.abort()
    await expect(preparation).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({ code: 'aborted' }),
    )
    expect(resourceSignal?.aborted).toBe(true)
    resolveResource?.(new Response(createPcmWav()))
    await vi.waitFor(() => expect(cache.statistics.activeRequestCount).toBe(0))
    expect(cache.statistics.decodedResourceCount).toBe(0)
  })

  it('allows an immediate retry after the last waiter cancels an unresolved request', async () => {
    let resolveFirstResource: ((response: Response) => void) | undefined
    let resourceRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input).endsWith('manifest.json')) return createManifestResponse()
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
    const first = cache.prepare(LOCATION, ['samples/low.wav'], controller.signal)

    await vi.waitFor(() => expect(resolveFirstResource).toBeDefined())
    controller.abort()
    await expect(first).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({ code: 'aborted' }),
    )
    await expect(cache.prepare(LOCATION, ['samples/low.wav'])).resolves.toBeDefined()
    expect(resourceRequestCount).toBe(2)
    resolveFirstResource?.(new Response(createPcmWav()))
  })

  it.each([
    {
      code: 'invalid-asset-location',
      run: async () =>
        createCache(createSuccessfulFetch()).loadManifest({
          assetBaseUrl: 'https://other.test/assets/',
          soundbankId: FIXTURE_SOUNDBANK_ID,
        }),
    },
    {
      code: 'soundbank-mismatch',
      run: async () => {
        const alternate = parseSoundbankId('other-soundbank')
        const cache = createCache(
          vi.fn<typeof globalThis.fetch>(async () => createManifestResponse(alternate)),
        )
        return cache.loadManifest(LOCATION)
      },
    },
    {
      code: 'resource-invalid',
      run: async () =>
        createCache(createSuccessfulFetch()).prepare(LOCATION, ['samples/unknown.wav']),
    },
    {
      code: 'resource-invalid',
      run: async () => {
        const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) =>
          String(input).endsWith('manifest.json')
            ? createManifestResponse()
            : new Response(Uint8Array.of(1, 2, 3).buffer),
        )
        return createCache(fetchImplementation).prepare(LOCATION, ['samples/low.wav'])
      },
    },
  ] as const)('fails closed with $code', async ({ code, run }) => {
    await expect(run()).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({ code }),
    )
  })

  it('enforces response byte budgets before retaining or decoding input', async () => {
    const cache = new SampleInstrumentResourceCache({
      audioContext: new FakeDecodeAudioContext() as unknown as BaseAudioContext,
      expectedOrigin: 'https://studio.test',
      fetch: createSuccessfulFetch(),
      limits: {
        maximumDecodedFloat32ByteLength: 4 * 1_024 * 1_024,
        maximumManifestByteLength: 8,
        maximumResourceByteLength: 8,
      },
    })

    await expect(cache.loadManifest(LOCATION)).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({
        code: 'manifest-too-large',
      }),
    )

    const resourceCache = new SampleInstrumentResourceCache({
      audioContext: new FakeDecodeAudioContext() as unknown as BaseAudioContext,
      expectedOrigin: 'https://studio.test',
      fetch: createSuccessfulFetch(),
      limits: {
        maximumDecodedFloat32ByteLength: 4 * 1_024 * 1_024,
        maximumManifestByteLength: 64 * 1_024,
        maximumResourceByteLength: 8,
      },
    })
    await expect(resourceCache.prepare(LOCATION, ['samples/low.wav'])).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({
        code: 'resource-too-large',
        resourceKey: 'samples/low.wav',
      }),
    )
  })

  it('clears decoded resources and disposes idempotently without owning AudioContext', async () => {
    const context = new FakeDecodeAudioContext()
    const cache = createCache(createSuccessfulFetch(), context)
    await cache.prepare(LOCATION, ['samples/low.wav'])
    cache.clearDecodedResources()
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 0,
      decodedResourceCount: 0,
      encodedResourceByteLength: 0,
      manifestCount: 1,
    })

    cache.dispose()
    cache.dispose()
    await expect(cache.loadManifest(LOCATION)).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({ code: 'disposed' }),
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
    const pending = cache.loadManifest(LOCATION)

    await vi.waitFor(() => expect(resolveManifest).toBeDefined())
    cache.dispose()
    resolveManifest?.(createManifestResponse())
    await expect(pending).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentResourceCacheError>>({ code: 'aborted' }),
    )
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 0,
      decodedResourceCount: 0,
      encodedResourceByteLength: 0,
      manifestCount: 0,
    })
  })
})
