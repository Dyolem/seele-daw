import { parseSoundbankId, type AudibleMidiProjectPlan } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import {
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
const LOCATION = Object.freeze({
  assetBaseUrl: 'https://studio.test/assets/fixture-piano/',
  soundbankId: FIXTURE_SOUNDBANK_ID,
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
    tracks: Object.freeze(options.duplicateTrackRoute ? [track, track] : [track]),
  })
  // Playback owns validation and branding; this fixture supplies its already-validated DTO shape.
  return plan as unknown as AudibleMidiProjectPlan
}

function createFixture() {
  const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) =>
    String(input).endsWith('manifest.json')
      ? createManifestResponse()
      : new Response(createPcmWav()),
  )
  const cache = new SampleInstrumentResourceCache({
    audioContext: new FakeDecodeAudioContext() as unknown as BaseAudioContext,
    expectedOrigin: 'https://studio.test',
    fetch: fetchImplementation,
    limits: {
      maximumManifestByteLength: 64 * 1_024,
      maximumResourceByteLength: 4 * 1_024 * 1_024,
    },
  })
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
    expect(prepared.modelRevision).toBe(0)
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects an already-cancelled empty preparation without starting resource work', async () => {
    const { cache, fetchImplementation, locator } = createFixture()
    const controller = new AbortController()
    controller.abort()

    await expect(
      prepareAudibleMidiSampleResources(createPlan([], 'empty'), cache, locator, controller.signal),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AudibleMidiSamplePreparationError>>({ code: 'aborted' }),
    )
    expect(fetchImplementation).not.toHaveBeenCalled()
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
      code: 'unsupported-pitch',
      run: async () => {
        const { cache, locator } = createFixture()
        return prepareAudibleMidiSampleResources(createPlan([73]), cache, locator)
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
