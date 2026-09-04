import { parseSoundbankId, type AudibleMidiProjectPlan } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import {
  AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE,
  AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON,
  AudibleMidiSamplePreparationError,
  prepareAudibleMidiSampleResources,
  type AudibleMidiSampleResourceLocator,
} from '#internal/sample-instrument/loading/prepare-plan-resources'
import { SampleInstrumentResourceCache } from '#internal/sample-instrument/loading/resource-cache'
import {
  FIXTURE_SOUNDBANK_ID,
  FakeDecodeAudioContext,
  createManifestResponse,
  createPcmWav,
} from '#internal/__tests__/support/sample-instrument-resource-fixture'

const TRACK_ID = 'track-fixture'
const SECOND_TRACK_ID = 'track-fixture-strings'
const SECOND_SOUNDBANK_ID = parseSoundbankId('fixture-strings')
const UNAVAILABLE_SOUNDBANK_ID = parseSoundbankId('unavailable-fixture')
const LOCATION = Object.freeze({
  assetBaseUrl: 'https://studio.test/assets/fixture-piano/',
  soundbankId: FIXTURE_SOUNDBANK_ID,
})
const SECOND_LOCATION = Object.freeze({
  assetBaseUrl: 'https://studio.test/assets/fixture-strings/',
  soundbankId: SECOND_SOUNDBANK_ID,
})

function createPlan(
  pitches: readonly number[],
  status: AudibleMidiProjectPlan['status'] = 'playable',
  options: { readonly audible?: boolean; readonly duplicateTrackRoute?: boolean } = {},
) {
  const track = Object.freeze({
    audible: options.audible ?? true,
    gain: 0.8,
    instrument: Object.freeze({
      deviceId: 'device-fixture',
      kind: 'sample-instrument',
      soundbankId: FIXTURE_SOUNDBANK_ID,
    }),
    instrumentDeviceId: 'device-fixture',
    muted: false,
    pan: 0,
    soloed: false,
    trackId: TRACK_ID,
  })
  const plan = Object.freeze({
    arrangementEndTick: 1_920,
    diagnostics: Object.freeze([]),
    master: Object.freeze({ gain: 1, muted: false }),
    midiNoteSpans: Object.freeze(
      pitches.map((pitch, index) =>
        Object.freeze({
          channel: 0,
          clipId: `clip-${index}`,
          endTick: 960,
          noteId: `note-${index}`,
          occurrenceKey: JSON.stringify([TRACK_ID, index]),
          pitch,
          sourceId: `source-${index}`,
          startTick: 0,
          trackId: TRACK_ID,
          velocity: 100,
        }),
      ),
    ),
    modelRevision: 0,
    status,
    tempoSegments: Object.freeze([]),
    timelineEndTick: 1_920,
    tracks: Object.freeze(options.duplicateTrackRoute ? [track, track] : [track]),
  })
  // Playback owns validation and branding; this fixture supplies its already-validated DTO shape.
  return plan as unknown as AudibleMidiProjectPlan
}

function createPlanWithUnavailableInstrument(): AudibleMidiProjectPlan {
  const base = createPlan([60])
  const availableTrack = base.tracks[0]!
  const availableSpan = base.midiNoteSpans[0]!
  const unavailableTrackId = 'track-unavailable'
  return Object.freeze({
    ...base,
    midiNoteSpans: Object.freeze([
      availableSpan,
      Object.freeze({
        ...availableSpan,
        noteId: 'note-unavailable',
        occurrenceKey: JSON.stringify([unavailableTrackId, 0]),
        pitch: 64,
        trackId: unavailableTrackId,
      }),
    ]),
    tracks: Object.freeze([
      availableTrack,
      Object.freeze({
        ...availableTrack,
        instrument: Object.freeze({
          ...availableTrack.instrument,
          deviceId: 'device-unavailable',
          soundbankId: UNAVAILABLE_SOUNDBANK_ID,
        }),
        instrumentDeviceId: 'device-unavailable',
        trackId: unavailableTrackId,
      }),
    ]),
  }) as unknown as AudibleMidiProjectPlan
}

function createMultiInstrumentPlan(): AudibleMidiProjectPlan {
  const base = createPlan([60, 60])
  const firstTrack = base.tracks[0]!
  const firstSpan = base.midiNoteSpans[0]!
  const secondSpan = base.midiNoteSpans[1]!
  return Object.freeze({
    ...base,
    midiNoteSpans: Object.freeze([
      firstSpan,
      Object.freeze({
        ...secondSpan,
        noteId: 'note-strings',
        occurrenceKey: JSON.stringify([SECOND_TRACK_ID, 0]),
        trackId: SECOND_TRACK_ID,
      }),
    ]),
    tracks: Object.freeze([
      firstTrack,
      Object.freeze({
        ...firstTrack,
        instrument: Object.freeze({
          ...firstTrack.instrument,
          deviceId: 'device-strings',
          soundbankId: SECOND_SOUNDBANK_ID,
        }),
        instrumentDeviceId: 'device-strings',
        trackId: SECOND_TRACK_ID,
      }),
    ]),
  }) as unknown as AudibleMidiProjectPlan
}

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

function createFixture() {
  const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) =>
    String(input).endsWith('manifest.json')
      ? createManifestResponse()
      : new Response(createPcmWav()),
  )
  const cache = createCache(fetchImplementation)
  const locator: AudibleMidiSampleResourceLocator = {
    locate: (soundbankId) => (soundbankId === FIXTURE_SOUNDBANK_ID ? LOCATION : null),
  }
  return { cache, fetchImplementation, locator }
}

describe('Audible MIDI Sample resource preparation', () => {
  it('loads only unique resources used by the complete stable Plan', async () => {
    const { cache, fetchImplementation, locator } = createFixture()

    const prepared = await prepareAudibleMidiSampleResources(
      createPlan([48, 52, 60, 60]),
      cache,
      locator,
    )

    expect(prepared.instruments.map(({ soundbankId }) => soundbankId)).toEqual([
      FIXTURE_SOUNDBANK_ID,
    ])
    expect(prepared.failures).toEqual([])
    expect(prepared.unsupportedNoteOccurrences).toEqual([])
    expect(prepared.instruments[0]?.resources.map(({ key }) => key)).toEqual([
      'samples/high.wav',
      'samples/low.wav',
    ])
    expect(prepared.modelRevision).toBe(0)
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
  })

  it('treats an empty Plan as a successful zero-resource preparation', async () => {
    const { cache, fetchImplementation, locator } = createFixture()

    const prepared = await prepareAudibleMidiSampleResources(
      createPlan([], 'empty'),
      cache,
      locator,
    )

    expect(prepared.instruments).toEqual([])
    expect(prepared.failures).toEqual([])
    expect(prepared.unsupportedNoteOccurrences).toEqual([])
    expect(prepared.modelRevision).toBe(0)
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('prepares multiple Soundbanks concurrently and reuses the stable score resources', async () => {
    const manifestResolvers = new Map<string, (response: Response) => void>()
    const decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>(async () =>
      Object.freeze({
        duration: 100 / 44_100,
        length: 100,
        numberOfChannels: 2,
        sampleRate: 44_100,
      } as AudioBuffer),
    )
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (!url.endsWith('manifest.json')) return new Response(createPcmWav())
      return new Promise<Response>((resolve) => manifestResolvers.set(url, resolve))
    })
    const cache = createCache(fetchImplementation, new FakeDecodeAudioContext(decodeAudioData))
    const locator: AudibleMidiSampleResourceLocator = {
      locate: (soundbankId) => {
        if (soundbankId === FIXTURE_SOUNDBANK_ID) return LOCATION
        if (soundbankId === SECOND_SOUNDBANK_ID) return SECOND_LOCATION
        return null
      },
    }
    const plan = createMultiInstrumentPlan()
    const firstPreparation = prepareAudibleMidiSampleResources(plan, cache, locator)

    await vi.waitFor(() => expect(manifestResolvers.size).toBe(2))
    manifestResolvers.get(`${LOCATION.assetBaseUrl}manifest.json`)?.(
      createManifestResponse(FIXTURE_SOUNDBANK_ID),
    )
    manifestResolvers.get(`${SECOND_LOCATION.assetBaseUrl}manifest.json`)?.(
      createManifestResponse(SECOND_SOUNDBANK_ID),
    )
    const first = await firstPreparation
    const second = await prepareAudibleMidiSampleResources(plan, cache, locator)

    expect(first.instruments.map(({ soundbankId }) => soundbankId)).toEqual([
      FIXTURE_SOUNDBANK_ID,
      SECOND_SOUNDBANK_ID,
    ])
    expect(second.instruments.map(({ soundbankId }) => soundbankId)).toEqual([
      FIXTURE_SOUNDBANK_ID,
      SECOND_SOUNDBANK_ID,
    ])
    expect(fetchImplementation).toHaveBeenCalledTimes(4)
    expect(decodeAudioData).toHaveBeenCalledTimes(2)
    expect(cache.statistics).toEqual({
      activeRequestCount: 0,
      decodedFloat32ByteLength: 1_600,
      decodedResourceCount: 2,
      encodedResourceByteLength: createPcmWav().byteLength * 2,
      manifestCount: 2,
    })
  })

  it('aborts every pending Soundbank request without retaining a partial score load', async () => {
    const resourceSignals: AbortSignal[] = []
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('manifest.json')) {
        return createManifestResponse(
          url.includes('/fixture-strings/') ? SECOND_SOUNDBANK_ID : FIXTURE_SOUNDBANK_ID,
        )
      }
      const signal = init?.signal
      if (!(signal instanceof AbortSignal)) throw new TypeError('Fixture requires AbortSignal')
      resourceSignals.push(signal)
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Fixture request aborted', 'AbortError')),
          { once: true },
        ),
      )
    })
    const cache = createCache(fetchImplementation)
    const locator: AudibleMidiSampleResourceLocator = {
      locate: (soundbankId) => (soundbankId === FIXTURE_SOUNDBANK_ID ? LOCATION : SECOND_LOCATION),
    }
    const controller = new AbortController()
    const preparation = prepareAudibleMidiSampleResources(
      createMultiInstrumentPlan(),
      cache,
      locator,
      { signal: controller.signal },
    )

    await vi.waitFor(() => expect(resourceSignals).toHaveLength(2))
    controller.abort()

    await expect(preparation).rejects.toEqual(expect.objectContaining({ code: 'aborted' }))
    expect(resourceSignals.every(({ aborted }) => aborted)).toBe(true)
    await vi.waitFor(() => expect(cache.statistics.activeRequestCount).toBe(0))
    expect(cache.statistics).toMatchObject({
      decodedFloat32ByteLength: 0,
      decodedResourceCount: 0,
      manifestCount: 2,
    })
  })

  it('rejects an already-cancelled empty preparation without starting resource work', async () => {
    const { cache, fetchImplementation, locator } = createFixture()
    const controller = new AbortController()
    controller.abort()

    await expect(
      prepareAudibleMidiSampleResources(createPlan([], 'empty'), cache, locator, {
        signal: controller.signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AudibleMidiSamplePreparationError>>({ code: 'aborted' }),
    )
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('retains available Instruments and reports unavailable ones in selective mode', async () => {
    const { cache, locator } = createFixture()

    const prepared = await prepareAudibleMidiSampleResources(
      createPlanWithUnavailableInstrument(),
      cache,
      locator,
      {
        failureMode: AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
      },
    )

    expect(prepared.instruments.map(({ soundbankId }) => soundbankId)).toEqual([
      FIXTURE_SOUNDBANK_ID,
    ])
    expect(prepared.failures).toEqual([
      expect.objectContaining({
        cause: expect.objectContaining({ code: 'missing-asset-location' }),
        soundbankId: UNAVAILABLE_SOUNDBANK_ID,
      }),
    ])
    expect(prepared.unsupportedNoteOccurrences).toEqual([])
  })

  it('isolates valid uncovered Note occurrences and prepares only covered resources', async () => {
    const { cache, fetchImplementation, locator } = createFixture()

    const prepared = await prepareAudibleMidiSampleResources(
      createPlan([47, 48, 73, 73]),
      cache,
      locator,
    )

    expect(prepared.failures).toEqual([])
    expect(prepared.instruments[0]?.resources.map(({ key }) => key)).toEqual(['samples/low.wav'])
    expect(prepared.unsupportedNoteOccurrences).toEqual([
      {
        occurrenceKey: JSON.stringify([TRACK_ID, 0]),
        pitch: 47,
        reason: AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON.NO_MATCHING_ZONE,
        soundbankId: FIXTURE_SOUNDBANK_ID,
        trackId: TRACK_ID,
      },
      {
        occurrenceKey: JSON.stringify([TRACK_ID, 2]),
        pitch: 73,
        reason: AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON.NO_MATCHING_ZONE,
        soundbankId: FIXTURE_SOUNDBANK_ID,
        trackId: TRACK_ID,
      },
      {
        occurrenceKey: JSON.stringify([TRACK_ID, 3]),
        pitch: 73,
        reason: AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON.NO_MATCHING_ZONE,
        soundbankId: FIXTURE_SOUNDBANK_ID,
        trackId: TRACK_ID,
      },
    ])
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('returns an empty-resource Instrument when every valid Note occurrence is uncovered', async () => {
    const { cache, fetchImplementation, locator } = createFixture()

    const prepared = await prepareAudibleMidiSampleResources(createPlan([0, 33]), cache, locator)

    expect(prepared.failures).toEqual([])
    expect(prepared.instruments).toEqual([
      expect.objectContaining({ resources: [], soundbankId: FIXTURE_SOUNDBANK_ID }),
    ])
    expect(prepared.unsupportedNoteOccurrences).toHaveLength(2)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      code: 'blocked-plan',
      run: async () => {
        const { cache, locator } = createFixture()
        return prepareAudibleMidiSampleResources(createPlan([], 'blocked'), cache, locator)
      },
    },
    {
      code: 'invalid-plan-status',
      run: async () => {
        const { cache, locator } = createFixture()
        return prepareAudibleMidiSampleResources(
          createPlan([], 'future-status' as AudibleMidiProjectPlan['status']),
          cache,
          locator,
        )
      },
    },
    {
      code: 'missing-asset-location',
      run: async () => {
        const { cache } = createFixture()
        return prepareAudibleMidiSampleResources(createPlan([60]), cache, { locate: () => null })
      },
    },
    {
      code: 'duplicate-track-route',
      run: async () => {
        const { cache, locator } = createFixture()
        return prepareAudibleMidiSampleResources(
          createPlan([60], 'playable', { duplicateTrackRoute: true }),
          cache,
          locator,
        )
      },
    },
    {
      code: 'inaudible-track-route',
      run: async () => {
        const { cache, locator } = createFixture()
        return prepareAudibleMidiSampleResources(
          createPlan([60], 'playable', { audible: false }),
          cache,
          locator,
        )
      },
    },
    {
      code: 'soundbank-location-mismatch',
      run: async () => {
        const { cache } = createFixture()
        return prepareAudibleMidiSampleResources(createPlan([60]), cache, {
          locate: () => ({ ...LOCATION, soundbankId: parseSoundbankId('wrong-soundbank') }),
        })
      },
    },
    {
      code: 'invalid-pitch',
      run: async () => {
        const { cache, locator } = createFixture()
        return prepareAudibleMidiSampleResources(createPlan([128]), cache, locator)
      },
    },
  ] as const)('fails closed with $code', async ({ code, run }) => {
    await expect(run()).rejects.toEqual(
      expect.objectContaining<Partial<AudibleMidiSamplePreparationError>>({ code }),
    )
  })
})
