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

type ClipSpans = readonly MidiNoteSpanPlan[]
type MidiPitch = MidiNoteSpanPlan['pitch']

/** Each Clip's distinct pitches. A Clip no edit touched keeps its spans array, and so its entry. */
const clipPitches = new WeakMap<ClipSpans, ReadonlySet<MidiPitch>>()

function pitchesOf(spans: ClipSpans): ReadonlySet<MidiPitch> {
  let pitches = clipPitches.get(spans)
  if (pitches === undefined) {
    pitches = new Set(spans.map(({ pitch }) => pitch))
    clipPitches.set(spans, pitches)
  }
  return pitches
}

/** The plan's Clips grouped by the Soundbank their Track plays, Soundbanks in ID order. */
function groupClipsBySoundbank(
  plan: AudibleMidiProjectPlan,
): readonly (readonly [SoundbankId, readonly ClipSpans[]])[] {
  const soundbankByTrack = new Map(
    plan.tracks.map((track) => [track.trackId, track.instrument.soundbankId]),
  )
  const grouped = new Map<SoundbankId, ClipSpans[]>()
  for (const spans of plan.clipSpans.values()) {
    if (spans.length === 0) continue
    // A Clip's spans all belong to its Track.
    const soundbankId = soundbankByTrack.get(spans[0]!.trackId)!
    const clips = grouped.get(soundbankId) ?? []
    clips.push(spans)
    grouped.set(soundbankId, clips)
  }
  return [...grouped].sort(([left], [right]) => compareStrings(left, right))
}

async function prepareInstrument(
  cache: SampleInstrumentResourceCache,
  baseUrl: URL,
  soundbankId: SoundbankId,
  clips: readonly ClipSpans[],
  signal: AbortSignal | undefined,
): Promise<PreparedInstrument> {
  const manifest = await cache.loadManifest(baseUrl, soundbankId, signal)
  const resourceKeys = new Set<string>()
  const unsupportedNoteOccurrences: UnsupportedNoteOccurrence[] = []

  // Zones depend on pitch alone, so a Clip's notes are visited only when some pitch has no zone.
  for (const spans of clips) {
    let uncovered: Set<MidiPitch> | undefined
    for (const pitch of pitchesOf(spans)) {
      const zone = findSampleInstrumentZoneForPitch(manifest, pitch)
      if (zone !== null) resourceKeys.add(zone.resource.key)
      else (uncovered ??= new Set()).add(pitch)
    }
    if (uncovered === undefined) continue
    for (const span of spans) {
      if (!uncovered.has(span.pitch)) continue
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
    groupClipsBySoundbank(plan).map(async ([soundbankId, clips]) => {
      try {
        const baseUrl = assetBaseUrl(soundbankId)
        if (baseUrl === null) throw new Error(`No sample assets are available for ${soundbankId}`)
        return await prepareInstrument(cache, baseUrl, soundbankId, clips, signal)
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
