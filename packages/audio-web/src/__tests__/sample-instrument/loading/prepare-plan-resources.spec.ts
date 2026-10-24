import {
  PLAYBACK_INSTRUMENT_FAILURE_MODE,
  parseSoundbankId,
  type AudibleMidiProjectPlan,
  type SoundbankId,
} from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import {
  prepareSampleResources,
  type SampleAssetBaseUrl,
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
const ASSET_BASE = 'https://studio.test/assets/fixture-piano/'
const SECOND_ASSET_BASE = 'https://studio.test/assets/fixture-strings/'
const { FAIL_PLAN, SKIP_UNAVAILABLE_INSTRUMENTS } = PLAYBACK_INSTRUMENT_FAILURE_MODE

function assetBases(entries: readonly (readonly [SoundbankId, string])[]): SampleAssetBaseUrl {
  const bases = new Map(entries)
  return (soundbankId) => bases.get(soundbankId) ?? null
}

const FIXTURE_ASSETS = assetBases([[FIXTURE_SOUNDBANK_ID, ASSET_BASE]])
const BOTH_ASSETS = assetBases([
  [FIXTURE_SOUNDBANK_ID, ASSET_BASE],
  [SECOND_SOUNDBANK_ID, SECOND_ASSET_BASE],
])

function createPlan(
  pitches: readonly number[],
  status: AudibleMidiProjectPlan['status'] = 'playable',
) {
  const track = Object.freeze({
    audible: true,
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
    tracks: Object.freeze([track]),
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
  return { cache, fetchImplementation }
}

function resourceKeys(
  prepared: Awaited<ReturnType<typeof prepareSampleResources>>,
  soundbankId: SoundbankId = FIXTURE_SOUNDBANK_ID,
): readonly string[] {
  return [...(prepared.instruments.get(soundbankId)?.resources.keys() ?? [])].sort()
}

describe('Sample resource preparation', () => {
  it('loads only unique resources used by the complete stable Plan', async () => {
    const { cache, fetchImplementation } = createFixture()

    const prepared = await prepareSampleResources(
      createPlan([48, 52, 60, 60]),
      cache,
      FIXTURE_ASSETS,
      FAIL_PLAN,
    )

    expect([...prepared.instruments.keys()]).toEqual([FIXTURE_SOUNDBANK_ID])
    expect(prepared.preparationFailures).toEqual([])
    expect(prepared.unsupportedNoteOccurrences).toEqual([])
    expect(resourceKeys(prepared)).toEqual(['samples/high.wav', 'samples/low.wav'])
    expect(prepared.modelRevision).toBe(0)
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
  })

  it('treats an empty Plan as a successful zero-resource preparation', async () => {
    const { cache, fetchImplementation } = createFixture()

    const prepared = await prepareSampleResources(
      createPlan([], 'empty'),
      cache,
      FIXTURE_ASSETS,
      FAIL_PLAN,
    )

    expect(prepared.instruments.size).toBe(0)
    expect(prepared.preparationFailures).toEqual([])
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
    const plan = createMultiInstrumentPlan()
    const firstPreparation = prepareSampleResources(plan, cache, BOTH_ASSETS, FAIL_PLAN)

    await vi.waitFor(() => expect(manifestResolvers.size).toBe(2))
    manifestResolvers.get(`${ASSET_BASE}manifest.json`)?.(
      createManifestResponse(FIXTURE_SOUNDBANK_ID),
    )
    manifestResolvers.get(`${SECOND_ASSET_BASE}manifest.json`)?.(
      createManifestResponse(SECOND_SOUNDBANK_ID),
    )
    const first = await firstPreparation
    const second = await prepareSampleResources(plan, cache, BOTH_ASSETS, FAIL_PLAN)

    expect([...first.instruments.keys()]).toEqual([FIXTURE_SOUNDBANK_ID, SECOND_SOUNDBANK_ID])
    expect([...second.instruments.keys()]).toEqual([FIXTURE_SOUNDBANK_ID, SECOND_SOUNDBANK_ID])
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
    const controller = new AbortController()
    const preparation = prepareSampleResources(
      createMultiInstrumentPlan(),
      cache,
      BOTH_ASSETS,
      FAIL_PLAN,
      controller.signal,
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
    const { cache, fetchImplementation } = createFixture()
    const controller = new AbortController()
    controller.abort()

    await expect(
      prepareSampleResources(
        createPlan([], 'empty'),
        cache,
        FIXTURE_ASSETS,
        FAIL_PLAN,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('retains available Instruments and reports unavailable ones in selective mode', async () => {
    const { cache } = createFixture()

    const prepared = await prepareSampleResources(
      createPlanWithUnavailableInstrument(),
      cache,
      FIXTURE_ASSETS,
      SKIP_UNAVAILABLE_INSTRUMENTS,
    )

    expect([...prepared.instruments.keys()]).toEqual([FIXTURE_SOUNDBANK_ID])
    expect(prepared.preparationFailures).toEqual([
      {
        cause: new Error('No sample assets are available for unavailable-fixture'),
        soundbankId: UNAVAILABLE_SOUNDBANK_ID,
      },
    ])
    expect(prepared.unsupportedNoteOccurrences).toEqual([])
  })

  it('rejects the whole preparation for an unavailable Instrument in fail-plan mode', async () => {
    const { cache } = createFixture()

    await expect(
      prepareSampleResources(
        createPlanWithUnavailableInstrument(),
        cache,
        FIXTURE_ASSETS,
        FAIL_PLAN,
      ),
    ).rejects.toThrow('No sample assets are available for unavailable-fixture')
  })

  it('isolates valid uncovered Note occurrences and prepares only covered resources', async () => {
    const { cache, fetchImplementation } = createFixture()

    const prepared = await prepareSampleResources(
      createPlan([47, 48, 73, 73]),
      cache,
      FIXTURE_ASSETS,
      FAIL_PLAN,
    )

    expect(prepared.preparationFailures).toEqual([])
    expect(resourceKeys(prepared)).toEqual(['samples/low.wav'])
    expect(prepared.unsupportedNoteOccurrences).toEqual([
      {
        occurrenceKey: JSON.stringify([TRACK_ID, 0]),
        pitch: 47,
        reason: 'no-matching-zone',
        soundbankId: FIXTURE_SOUNDBANK_ID,
        trackId: TRACK_ID,
      },
      {
        occurrenceKey: JSON.stringify([TRACK_ID, 2]),
        pitch: 73,
        reason: 'no-matching-zone',
        soundbankId: FIXTURE_SOUNDBANK_ID,
        trackId: TRACK_ID,
      },
      {
        occurrenceKey: JSON.stringify([TRACK_ID, 3]),
        pitch: 73,
        reason: 'no-matching-zone',
        soundbankId: FIXTURE_SOUNDBANK_ID,
        trackId: TRACK_ID,
      },
    ])
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('returns an empty-resource Instrument when every valid Note occurrence is uncovered', async () => {
    const { cache, fetchImplementation } = createFixture()

    const prepared = await prepareSampleResources(
      createPlan([0, 33]),
      cache,
      FIXTURE_ASSETS,
      FAIL_PLAN,
    )

    expect(prepared.preparationFailures).toEqual([])
    expect([...prepared.instruments.keys()]).toEqual([FIXTURE_SOUNDBANK_ID])
    expect(resourceKeys(prepared)).toEqual([])
    expect(prepared.unsupportedNoteOccurrences).toHaveLength(2)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })
})
