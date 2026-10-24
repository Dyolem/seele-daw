import {
  PLAYBACK_INSTRUMENT_FAILURE_MODE,
  type AudibleMidiProjectPlan,
  type InstrumentPreparationFailure,
  type MidiNoteSpanPlan,
  type PlaybackInstrumentFailureMode,
  type SoundbankId,
  type UnsupportedNoteOccurrence,
} from '@seele-daw/playback'

import type { SampleInstrumentResourceCache } from '#internal/sample-instrument/loading/resource-cache'
import { findSampleInstrumentZoneForPitch } from '#internal/sample-instrument/loading/zone-selection'
import type { SampleInstrument } from '#internal/sample-instrument/voice/voice-runtime'

/** Where a Soundbank's assets are served from; null when this build has none for it. */
export type SampleAssetBaseUrl = (soundbankId: SoundbankId) => URL | null

/** The instruments loaded for one plan revision, and what of the plan they cannot play. */
export interface PreparedSampleResources {
  readonly modelRevision: AudibleMidiProjectPlan['modelRevision']
  readonly instruments: ReadonlyMap<SoundbankId, SampleInstrument>
  readonly preparationFailures: readonly InstrumentPreparationFailure[]
  readonly unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[]
}

interface PreparedInstrument {
  readonly instrument: SampleInstrument
  readonly soundbankId: SoundbankId
  readonly unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[]
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** The plan's note spans grouped by the Soundbank their Track plays, Soundbanks in ID order. */
function groupSpansBySoundbank(
  plan: AudibleMidiProjectPlan,
): readonly (readonly [SoundbankId, readonly MidiNoteSpanPlan[]])[] {
  const soundbankByTrack = new Map(
    plan.tracks.map((track) => [track.trackId, track.instrument.soundbankId]),
  )
  const grouped = new Map<SoundbankId, MidiNoteSpanPlan[]>()
  for (const span of plan.midiNoteSpans) {
    const soundbankId = soundbankByTrack.get(span.trackId)
    if (soundbankId === undefined) throw new Error(`Note span ${span.occurrenceKey} has no Track`)
    const spans = grouped.get(soundbankId) ?? []
    spans.push(span)
    grouped.set(soundbankId, spans)
  }
  return [...grouped].sort(([left], [right]) => compareStrings(left, right))
}

async function prepareInstrument(
  cache: SampleInstrumentResourceCache,
  baseUrl: URL,
  soundbankId: SoundbankId,
  spans: readonly MidiNoteSpanPlan[],
  signal: AbortSignal | undefined,
): Promise<PreparedInstrument> {
  const manifest = await cache.loadManifest(baseUrl, soundbankId, signal)
  const resourceKeys = new Set<string>()
  const unsupportedNoteOccurrences: UnsupportedNoteOccurrence[] = []

  for (const span of spans) {
    const zone = findSampleInstrumentZoneForPitch(manifest, span.pitch)
    if (zone !== null) {
      resourceKeys.add(zone.resource.key)
      continue
    }
    unsupportedNoteOccurrences.push(
      Object.freeze({
        occurrenceKey: span.occurrenceKey,
        pitch: span.pitch,
        reason: 'no-matching-zone',
        soundbankId,
        trackId: span.trackId,
      }),
    )
  }

  const resources = await cache.loadResources(baseUrl, resourceKeys, signal)
  return Object.freeze({
    instrument: Object.freeze({ manifest, resources }),
    soundbankId,
    // Only the reported notes are sorted; sorting every span on every edit costs milliseconds.
    unsupportedNoteOccurrences: Object.freeze(
      unsupportedNoteOccurrences.sort((left, right) =>
        compareStrings(left.occurrenceKey, right.occurrenceKey),
      ),
    ),
  })
}

/**
 * Loads every instrument a plan plays. Under SKIP_UNAVAILABLE_INSTRUMENTS an instrument that fails
 * to load is reported and left out; under FAIL_PLAN its failure rejects the whole preparation.
 */
export async function prepareSampleResources(
  plan: AudibleMidiProjectPlan,
  cache: SampleInstrumentResourceCache,
  assetBaseUrl: SampleAssetBaseUrl,
  failureMode: PlaybackInstrumentFailureMode,
  signal?: AbortSignal,
): Promise<PreparedSampleResources> {
  signal?.throwIfAborted()
  const results = await Promise.all(
    groupSpansBySoundbank(plan).map(async ([soundbankId, spans]) => {
      try {
        const baseUrl = assetBaseUrl(soundbankId)
        if (baseUrl === null) throw new Error(`No sample assets are available for ${soundbankId}`)
        return await prepareInstrument(cache, baseUrl, soundbankId, spans, signal)
      } catch (cause) {
        if (
          signal?.aborted === true ||
          failureMode === PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN
        ) {
          throw cause
        }
        return Object.freeze<InstrumentPreparationFailure>({ cause, soundbankId })
      }
    }),
  )

  const instruments = new Map<SoundbankId, SampleInstrument>()
  const preparationFailures: InstrumentPreparationFailure[] = []
  const unsupportedNoteOccurrences: UnsupportedNoteOccurrence[] = []
  for (const result of results) {
    if ('instrument' in result) {
      instruments.set(result.soundbankId, result.instrument)
      unsupportedNoteOccurrences.push(...result.unsupportedNoteOccurrences)
    } else {
      preparationFailures.push(result)
    }
  }

  return Object.freeze({
    modelRevision: plan.modelRevision,
    instruments,
    preparationFailures: Object.freeze(preparationFailures),
    unsupportedNoteOccurrences: Object.freeze(unsupportedNoteOccurrences),
  })
}
