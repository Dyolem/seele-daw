import type { AudibleMidiProjectPlan, MidiNoteSpanPlan, SoundbankId } from '@seele-daw/playback'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import type {
  LoadedSampleInstrumentResource,
  PreparedSampleInstrumentResources,
  SampleInstrumentAssetLocation,
  SampleInstrumentResourceCache,
} from '#internal/sample-instrument/loading/resource-cache'
import {
  SampleInstrumentZoneSelectionError,
  findSampleInstrumentZoneForPitch,
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
  readonly unsupportedNoteOccurrences: readonly AudibleMidiUnsupportedSampleNoteOccurrence[]
}

export const AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON = Object.freeze({
  NO_MATCHING_ZONE: 'no-matching-zone',
} as const)

export type AudibleMidiUnsupportedSampleNoteReason =
  (typeof AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON)[keyof typeof AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON]

/** Objective per-occurrence coverage result; it deliberately makes no musical interpretation. */
export interface AudibleMidiUnsupportedSampleNoteOccurrence {
  readonly occurrenceKey: MidiNoteSpanPlan['occurrenceKey']
  readonly pitch: MidiNoteSpanPlan['pitch']
  readonly reason: AudibleMidiUnsupportedSampleNoteReason
  readonly soundbankId: SoundbankId
  readonly trackId: MidiNoteSpanPlan['trackId']
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

function collectNoteSpansBySoundbank(
  plan: AudibleMidiProjectPlan,
): ReadonlyMap<SoundbankId, readonly MidiNoteSpanPlan[]> {
  const routes = new Map<(typeof plan.tracks)[number]['trackId'], (typeof plan.tracks)[number]>()
  for (const track of plan.tracks) {
    if (routes.has(track.trackId)) {
      fail('duplicate-track-route', `Audible MIDI Plan repeats Track route ${track.trackId}`)
    }
    routes.set(track.trackId, track)
  }
  const spansBySoundbank = new Map<SoundbankId, MidiNoteSpanPlan[]>()
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
    let spans = spansBySoundbank.get(soundbankId)
    if (spans === undefined) {
      spans = []
      spansBySoundbank.set(soundbankId, spans)
    }
    spans.push(span)
  }
  return new Map(
    [...spansBySoundbank]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([soundbankId, spans]) => [
        soundbankId,
        Object.freeze(
          [...spans].sort((left, right) => {
            if (left.occurrenceKey < right.occurrenceKey) return -1
            if (left.occurrenceKey > right.occurrenceKey) return 1
            return 0
          }),
        ),
      ]),
  )
}

function partitionSampleResourcesForNoteSpans(
  manifest: SampleInstrumentManifestV1,
  soundbankId: SoundbankId,
  spans: readonly MidiNoteSpanPlan[],
): {
  readonly resourceKeys: readonly string[]
  readonly unsupportedNoteOccurrences: readonly AudibleMidiUnsupportedSampleNoteOccurrence[]
} {
  const resourceKeys = new Set<string>()
  const unsupportedNoteOccurrences: AudibleMidiUnsupportedSampleNoteOccurrence[] = []

  for (const span of spans) {
    let zone: ReturnType<typeof findSampleInstrumentZoneForPitch>
    try {
      zone = findSampleInstrumentZoneForPitch(manifest, span.pitch)
    } catch (error) {
      if (error instanceof SampleInstrumentZoneSelectionError && error.code === 'invalid-pitch') {
        fail('invalid-pitch', `Audible MIDI Plan contains invalid pitch ${error.pitch}`)
      }
      throw error
    }
    if (zone === null) {
      unsupportedNoteOccurrences.push(
        Object.freeze({
          occurrenceKey: span.occurrenceKey,
          pitch: span.pitch,
          reason: AUDIBLE_MIDI_UNSUPPORTED_SAMPLE_NOTE_REASON.NO_MATCHING_ZONE,
          soundbankId,
          trackId: span.trackId,
        }),
      )
      continue
    }
    resourceKeys.add(zone.resource.key)
  }

  return Object.freeze({
    resourceKeys: Object.freeze([...resourceKeys].sort()),
    unsupportedNoteOccurrences: Object.freeze(unsupportedNoteOccurrences),
  })
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
      readonly unsupportedNoteOccurrences: readonly AudibleMidiUnsupportedSampleNoteOccurrence[]
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

  const spansBySoundbank = collectNoteSpansBySoundbank(plan)
  const results = await Promise.all(
    [...spansBySoundbank].map(async ([soundbankId, spans]) => {
      try {
        const location = requireLocation(locator, soundbankId)
        const manifest = await cache.loadManifest(location, signal)
        const { resourceKeys, unsupportedNoteOccurrences } = partitionSampleResourcesForNoteSpans(
          manifest,
          soundbankId,
          spans,
        )
        const prepared = await cache.prepare(location, resourceKeys, signal)
        return Object.freeze<InstrumentPreparationResult>({
          instrument: createPreparedInstrument(soundbankId, prepared),
          kind: 'prepared',
          unsupportedNoteOccurrences,
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
  const unsupportedNoteOccurrences: AudibleMidiUnsupportedSampleNoteOccurrence[] = []
  for (const result of results) {
    if (result.kind === 'prepared') {
      instruments.push(result.instrument)
      unsupportedNoteOccurrences.push(...result.unsupportedNoteOccurrences)
    } else failures.push(result.failure)
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    instruments: Object.freeze(instruments),
    modelRevision: plan.modelRevision,
    unsupportedNoteOccurrences: Object.freeze(unsupportedNoteOccurrences),
  })
}
