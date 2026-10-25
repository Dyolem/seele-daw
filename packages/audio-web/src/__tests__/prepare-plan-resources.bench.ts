// Run with `pnpm --filter @seele-daw/audio-web bench`. Backs ADR-006: every edit during playback
// prepares the whole plan again, so preparing a large plan whose instruments are cached must stay
// cheap.
import {
  PLAYBACK_INSTRUMENT_FAILURE_MODE,
  parseSoundbankId,
  type AudibleMidiProjectPlan,
  type SoundbankId,
} from '@seele-daw/playback'
import { bench, describe } from 'vitest'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import { prepareSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'
import type { SampleInstrumentResourceCache } from '#internal/sample-instrument/loading/resource-cache'

const TRACK_COUNT = 16
const NOTES_PER_TRACK = 5_000
const LOWEST_KEY = 21
const KEY_COUNT = 88

function createManifest(soundbankId: SoundbankId): SampleInstrumentManifestV1 {
  return Object.freeze({
    displayName: soundbankId,
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId,
    zones: Object.freeze(
      Array.from({ length: KEY_COUNT }, (_, index) => {
        const pitch = LOWEST_KEY + index
        return Object.freeze({
          amplitudeEnvelope: Object.freeze({
            attack: Object.freeze({ curve: null, durationSecond: 0 }),
            release: Object.freeze({ curve: null, durationSecond: 0.3 }),
          }),
          exclusiveGroup: null,
          loop: Object.freeze({ kind: 'none' }),
          resource: Object.freeze({ key: `samples/${pitch}.wav`, mediaType: 'audio/wav' }),
          rootMidiPitch: pitch,
          selector: Object.freeze({ kind: 'exact-midi', pitch }),
          startOffsetSecond: 0,
          triggerMode: 'gated',
          tuneCent: 0,
          zoneId: `zone-${pitch}`,
        })
      }),
    ),
  }) as SampleInstrumentManifestV1
}

const soundbankIds = Array.from({ length: TRACK_COUNT }, (_, index) =>
  parseSoundbankId(`bench-bank-${index}`),
)
const tracks = soundbankIds.map((soundbankId, index) =>
  Object.freeze({ instrument: Object.freeze({ soundbankId }), trackId: `track-${index}` }),
)
// One Clip per Track, with only the fields preparation reads.
function clipSpans(trackIndex: number) {
  const { trackId } = tracks[trackIndex]!
  return Object.freeze(
    Array.from({ length: NOTES_PER_TRACK }, (_, noteIndex) =>
      Object.freeze({
        occurrenceKey: JSON.stringify([trackId, 'clip', 'source', `note-${noteIndex}`]),
        pitch: LOWEST_KEY + ((noteIndex * 7 + trackIndex) % KEY_COUNT),
        trackId,
      }),
    ),
  )
}
const clips = new Map(
  tracks.map((_track, trackIndex) => [`clip-${trackIndex}`, clipSpans(trackIndex)]),
)
function planWith(spansByClip: ReadonlyMap<string, unknown>): AudibleMidiProjectPlan {
  return Object.freeze({
    clipSpans: spansByClip,
    modelRevision: 1,
    tracks,
  }) as unknown as AudibleMidiProjectPlan
}
const plan = planWith(clips)

// After the first Play every Manifest and resource is cached; the cache hands out the same objects.
const manifests = new Map(
  soundbankIds.map((soundbankId) => [soundbankId, createManifest(soundbankId)]),
)
const cache = {
  loadManifest: async (_baseUrl: URL, soundbankId: SoundbankId) => manifests.get(soundbankId)!,
  loadResources: async () => new Map(),
} as unknown as SampleInstrumentResourceCache
const assetBaseUrl = (soundbankId: SoundbankId) => new URL(`https://studio.test/${soundbankId}/`)

describe('sample resource preparation', () => {
  bench(`${TRACK_COUNT} tracks × ${NOTES_PER_TRACK} notes, instruments cached`, async () => {
    await prepareSampleResources(
      plan,
      cache,
      assetBaseUrl,
      PLAYBACK_INSTRUMENT_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
    )
  })

  // What an edit to one Clip costs: only that Clip's spans are new.
  bench(`${TRACK_COUNT} tracks × ${NOTES_PER_TRACK} notes, one Clip edited`, async () => {
    await prepareSampleResources(
      planWith(new Map([...clips, ['clip-0', clipSpans(0)]])),
      cache,
      assetBaseUrl,
      PLAYBACK_INSTRUMENT_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
    )
  })
})
