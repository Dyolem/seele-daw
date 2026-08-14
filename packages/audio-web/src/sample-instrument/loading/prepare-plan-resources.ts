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
  readonly failures: readonly AudibleMidiSamplePreparationFailure[]
  readonly instruments: readonly PreparedAudibleMidiSampleInstrument[]
  readonly modelRevision: AudibleMidiProjectPlan['modelRevision']
}

export const AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE = Object.freeze({
  FAIL_FAST: 'fail-fast',
  SKIP_UNAVAILABLE_INSTRUMENTS: 'skip-unavailable-instruments',
} as const)

export type AudibleMidiSamplePreparationFailureMode =
  (typeof AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE)[keyof typeof AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE]

export interface AudibleMidiSamplePreparationFailure {
  readonly cause: unknown
  readonly soundbankId: SoundbankId
}

export interface PrepareAudibleMidiSampleResourcesOptions {
  readonly failureMode?: AudibleMidiSamplePreparationFailureMode
  readonly signal?: AbortSignal
}

export type AudibleMidiSamplePreparationErrorCode =
  | 'aborted'
  | 'blocked-plan'
  | 'duplicate-track-route'
  | 'inaudible-track-route'
  | 'invalid-failure-mode'
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

function parseFailureMode(
  value: AudibleMidiSamplePreparationFailureMode | undefined,
): AudibleMidiSamplePreparationFailureMode {
  switch (value) {
    case undefined:
    case AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE.FAIL_FAST:
      return AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE.FAIL_FAST
    case AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS:
      return AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS
    default:
      fail('invalid-failure-mode', `Unknown Sample preparation failure mode ${String(value)}`)
  }
}

type InstrumentPreparationResult =
  | {
      readonly kind: 'prepared'
      readonly instrument: PreparedAudibleMidiSampleInstrument
    }
  | {
      readonly kind: 'failed'
      readonly failure: AudibleMidiSamplePreparationFailure
    }

/** Prepares Sample resources for one stable Plan under an explicit per-Instrument failure policy. */
export async function prepareAudibleMidiSampleResources(
  plan: AudibleMidiProjectPlan,
  cache: SampleInstrumentResourceCache,
  locator: AudibleMidiSampleResourceLocator,
  options: PrepareAudibleMidiSampleResourcesOptions = {},
): Promise<PreparedAudibleMidiSampleResources> {
  const failureMode = parseFailureMode(options.failureMode)
  const { signal } = options
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
  const results = await Promise.all(
    [...pitchesBySoundbank].map(async ([soundbankId, pitches]) => {
      try {
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
        return Object.freeze<InstrumentPreparationResult>({
          instrument: createPreparedInstrument(soundbankId, prepared),
          kind: 'prepared',
        })
      } catch (cause) {
        if (
          signal?.aborted === true ||
          failureMode === AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE.FAIL_FAST
        ) {
          throw cause
        }
        return Object.freeze<InstrumentPreparationResult>({
          failure: Object.freeze({ cause, soundbankId }),
          kind: 'failed',
        })
      }
    }),
  )
  const failures: AudibleMidiSamplePreparationFailure[] = []
  const instruments: PreparedAudibleMidiSampleInstrument[] = []
  for (const result of results) {
    if (result.kind === 'prepared') instruments.push(result.instrument)
    else failures.push(result.failure)
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    instruments: Object.freeze(instruments),
    modelRevision: plan.modelRevision,
  })
}
