import type { AudibleMidiProjectPlan, SoundbankId } from '@seele-daw/playback'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import type {
  LoadedSampleInstrumentResource,
  PreparedSampleInstrumentResources,
  SampleInstrumentAssetLocation,
  SampleInstrumentResourceCache,
} from '#internal/sample-instrument/loading/resource-cache'
import {
  SampleInstrumentZoneSelectionError,
  collectSampleInstrumentResourceKeysForPitches,
} from '#internal/sample-instrument/loading/zone-selection'

export interface AudibleMidiSampleResourceLocator {
  locate(soundbankId: SoundbankId): SampleInstrumentAssetLocation | null
}

export interface PreparedAudibleMidiSampleInstrument {
  readonly manifest: SampleInstrumentManifestV1
  readonly resources: readonly LoadedSampleInstrumentResource[]
  readonly soundbankId: SoundbankId
}

export interface PreparedAudibleMidiSampleResources {
  readonly instruments: readonly PreparedAudibleMidiSampleInstrument[]
  readonly modelRevision: AudibleMidiProjectPlan['modelRevision']
}

export type AudibleMidiSamplePreparationErrorCode =
  | 'aborted'
  | 'blocked-plan'
  | 'duplicate-track-route'
  | 'inaudible-track-route'
  | 'invalid-pitch'
  | 'invalid-plan-status'
  | 'missing-asset-location'
  | 'missing-track-route'
  | 'soundbank-location-mismatch'
  | 'unsupported-pitch'

export class AudibleMidiSamplePreparationError extends Error {
  readonly code: AudibleMidiSamplePreparationErrorCode
  readonly soundbankId: SoundbankId | null

  constructor(
    code: AudibleMidiSamplePreparationErrorCode,
    message: string,
    soundbankId: SoundbankId | null = null,
  ) {
    super(message)
    this.name = 'AudibleMidiSamplePreparationError'
    this.code = code
    this.soundbankId = soundbankId
  }
}

function fail(
  code: AudibleMidiSamplePreparationErrorCode,
  message: string,
  soundbankId: SoundbankId | null = null,
): never {
  throw new AudibleMidiSamplePreparationError(code, message, soundbankId)
}

function collectPitchesBySoundbank(
  plan: AudibleMidiProjectPlan,
): ReadonlyMap<SoundbankId, readonly number[]> {
  const routes = new Map<(typeof plan.tracks)[number]['trackId'], (typeof plan.tracks)[number]>()
  for (const track of plan.tracks) {
    if (routes.has(track.trackId)) {
      fail('duplicate-track-route', `Audible MIDI Plan repeats Track route ${track.trackId}`)
    }
    routes.set(track.trackId, track)
  }
  const pitchesBySoundbank = new Map<SoundbankId, Set<number>>()
  for (const span of plan.midiNoteSpans) {
    const route = routes.get(span.trackId)
    if (route === undefined) {
      fail('missing-track-route', `MIDI Note Span ${span.occurrenceKey} has no Track route`)
    }
    if (!route.audible) {
      fail(
        'inaudible-track-route',
        `MIDI Note Span ${span.occurrenceKey} targets an inaudible Track`,
      )
    }
    const soundbankId = route.instrument.soundbankId
    let pitches = pitchesBySoundbank.get(soundbankId)
    if (pitches === undefined) {
      pitches = new Set<number>()
      pitchesBySoundbank.set(soundbankId, pitches)
    }
    pitches.add(span.pitch)
  }
  return new Map(
    [...pitchesBySoundbank]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([soundbankId, pitches]) => [
        soundbankId,
        Object.freeze([...pitches].sort((a, b) => a - b)),
      ]),
  )
}

function requireLocation(
  locator: AudibleMidiSampleResourceLocator,
  soundbankId: SoundbankId,
): SampleInstrumentAssetLocation {
  const location = locator.locate(soundbankId)
  if (location === null) {
    fail(
      'missing-asset-location',
      `No Sample Instrument assets are available for ${soundbankId}`,
      soundbankId,
    )
  }
  if (location.soundbankId !== soundbankId) {
    fail(
      'soundbank-location-mismatch',
      `Resource locator returned ${location.soundbankId} for ${soundbankId}`,
      soundbankId,
    )
  }
  return Object.freeze({
    assetBaseUrl: String(location.assetBaseUrl),
    soundbankId: location.soundbankId,
  })
}

function createPreparedInstrument(
  soundbankId: SoundbankId,
  prepared: PreparedSampleInstrumentResources,
): PreparedAudibleMidiSampleInstrument {
  return Object.freeze({
    manifest: prepared.manifest,
    resources: prepared.resources,
    soundbankId,
  })
}

/** Prepares every Sample resource referenced by a stable plan before Transport enters Playing. */
export async function prepareAudibleMidiSampleResources(
  plan: AudibleMidiProjectPlan,
  cache: SampleInstrumentResourceCache,
  locator: AudibleMidiSampleResourceLocator,
  signal?: AbortSignal,
): Promise<PreparedAudibleMidiSampleResources> {
  if (signal?.aborted === true) {
    fail('aborted', 'Sample resource preparation was aborted')
  }
  switch (plan.status) {
    case 'blocked':
      fail('blocked-plan', 'A blocked Audible MIDI Plan cannot prepare audio resources')
    case 'empty':
    case 'partial':
    case 'playable':
      break
    default:
      fail('invalid-plan-status', 'Audible MIDI Plan has an unknown status')
  }

  const pitchesBySoundbank = collectPitchesBySoundbank(plan)
  const instruments = await Promise.all(
    [...pitchesBySoundbank].map(async ([soundbankId, pitches]) => {
      const location = requireLocation(locator, soundbankId)
      const manifest = await cache.loadManifest(location, signal)
      let resourceKeys: readonly string[]
      try {
        resourceKeys = collectSampleInstrumentResourceKeysForPitches(manifest, pitches)
      } catch (error) {
        if (error instanceof SampleInstrumentZoneSelectionError) {
          if (error.code === 'invalid-pitch') {
            fail('invalid-pitch', `Audible MIDI Plan contains invalid pitch ${error.pitch}`)
          }
          fail(
            'unsupported-pitch',
            `${soundbankId} does not cover MIDI pitch ${error.pitch}`,
            soundbankId,
          )
        }
        throw error
      }
      const prepared = await cache.prepare(location, resourceKeys, signal)
      return [soundbankId, createPreparedInstrument(soundbankId, prepared)] as const
    }),
  )

  return Object.freeze({
    instruments: Object.freeze(instruments.map(([, instrument]) => instrument)),
    modelRevision: plan.modelRevision,
  })
}
