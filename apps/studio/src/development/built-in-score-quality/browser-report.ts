import {
  SampleInstrumentResourceCache,
  prepareAudibleMidiSampleResources,
  type PreparedAudibleMidiSampleResources,
} from '@seele-daw/audio-web'
import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
  countAudioQualityClippedFrames,
  measureAudioQualityAq0Channels,
  renderAudioQualityPlans,
  type AudioQualityAq0ChannelMeasurement,
} from '@seele-daw/audio-web/development/audio-quality-aq0'
import type { SoundbankId } from '@seele-daw/playback'
import { PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE } from '@seele-daw/project-midi'

import {
  BUILT_IN_SCORE_QUALITY_FIXTURE_SCHEMA,
  BUILT_IN_SCORE_QUALITY_PLACEHOLDER,
  BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND,
  BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS,
  BUILT_IN_SCORE_QUALITY_TAIL_WINDOW,
  createBuiltInScoreQualityPlaybackFixture,
} from '@/development/built-in-score-quality/fixture'
import { decodeMidiProgramPlaceholderDeviceState } from '@/workbench/instrument/midi-import-instrument-policy'
import {
  DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS,
  createDefaultBuiltInSampleAssetLocations,
} from '@/workbench/project/playback/browser-runtime'

export const BUILT_IN_SCORE_QUALITY_BROWSER_REPORT_SCHEMA =
  'seele.built-in-multi-instrument-score-quality-browser-report'

export const BUILT_IN_SCORE_QUALITY_GATE_POLICY = Object.freeze({
  representativeMixPeakThresholdDbfs: -3,
  tailThresholdDbfs: -90,
} as const)

type ResourceCacheStatistics = SampleInstrumentResourceCache['statistics']
type PreparedZone =
  PreparedAudibleMidiSampleResources['instruments'][number]['manifest']['zones'][number]

export interface BuiltInScoreQualitySelectedZoneMeasurement {
  readonly exclusiveGroup: PreparedZone['exclusiveGroup']
  readonly loopKind: PreparedZone['loop']['kind']
  readonly pitch: number
  readonly soundbankId: SoundbankId
  readonly triggerMode: PreparedZone['triggerMode']
  readonly zoneId: string
}

export interface BuiltInScoreQualityBrowserReport {
  readonly checks: {
    readonly allMeasurementsFinite: boolean
    readonly allPlansScheduled: boolean
    readonly allScorePitchesCovered: boolean
    readonly cc64FinalGateExtended: boolean
    readonly channelTenUsesPercussion: boolean
    readonly decodedCacheWithinRetentionBudget: boolean
    readonly decodedCacheReleasedAfterDispose: boolean
    readonly initialGainAndPanPreserved: boolean
    readonly loopZonesExercised: boolean
    readonly noClippedFrames: boolean
    readonly percussionHiHatChokePresent: boolean
    readonly percussionOneShotsExercised: boolean
    readonly placeholderRemainsSilentAndVisible: boolean
    readonly representativeMixPeakAtOrBelowThreshold: boolean
    readonly routeSetExact: boolean
    readonly runtimeReleasedAfterDispose: boolean
    readonly runtimeReleasedAfterRender: boolean
    readonly tailBelowThreshold: boolean
  }
  readonly environment: {
    readonly offlineAudioContextAvailable: true
    readonly userAgent: string
  }
  readonly fixture: {
    readonly encodedMidiByteLength: number
    readonly importedNoteCount: number
    readonly importedTrackCount: number
    readonly schema: typeof BUILT_IN_SCORE_QUALITY_FIXTURE_SCHEMA
    readonly sourceTrackCount: number
  }
  readonly gatePolicy: typeof BUILT_IN_SCORE_QUALITY_GATE_POLICY
  readonly importAndPlayback: {
    readonly importDiagnosticCodes: readonly string[]
    readonly playbackDiagnosticCodes: readonly string[]
    readonly planStatus: string
    readonly playableTrackCount: number
    readonly scheduledVoiceCount: number
  }
  readonly lifecycle: {
    readonly cacheAfterDispose: ResourceCacheStatistics
    readonly cacheAfterRender: ResourceCacheStatistics
    readonly runtimeAfterDispose: ReturnType<typeof runtimeStatisticsShape>
    readonly runtimeAfterRender: ReturnType<typeof runtimeStatisticsShape>
  }
  readonly mix: {
    readonly channelMeasurements: readonly AudioQualityAq0ChannelMeasurement[]
    readonly clippedFrameCount: number
    readonly peakDbfs: number | null
    readonly peakLinear: number
    readonly rmsDbfs: number | null
    readonly rmsLinear: number
    readonly tailPeakDbfs: number | null
    readonly tailPeakLinear: number
  }
  readonly resources: {
    readonly decodedFloat32ByteLength: number
    readonly encodedByteLength: number
    readonly instrumentCount: number
    readonly resourceCount: number
    readonly selectedZones: readonly BuiltInScoreQualitySelectedZoneMeasurement[]
  }
  readonly sampleRateHz: typeof AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ
  readonly schema: typeof BUILT_IN_SCORE_QUALITY_BROWSER_REPORT_SCHEMA
  readonly schemaVersion: 1
}

export interface RunBuiltInScoreQualityBrowserReportOptions {
  readonly expectedOrigin: string
  readonly fetch?: typeof globalThis.fetch
  readonly userAgent?: string
}

function runtimeStatisticsShape(statistics: {
  readonly activeVoiceCount: number
  readonly connectedNodeCount: number
  readonly endedListenerCount: number
  readonly sourceNodeCount: number
}) {
  return Object.freeze({ ...statistics })
}

function isZeroStatistics(statistics: Readonly<Record<string, number>>): boolean {
  return Object.values(statistics).every((value) => value === 0)
}

function isZeroCacheStatistics(statistics: ResourceCacheStatistics): boolean {
  return Object.values(statistics).every((value) => value === 0)
}

function zoneContainsPitch(zone: PreparedZone, pitch: number): boolean {
  return zone.selector.kind === 'exact-midi'
    ? zone.selector.pitch === pitch
    : pitch >= zone.selector.minimumPitch && pitch <= zone.selector.maximumPitch
}

function copyExclusiveGroup(group: PreparedZone['exclusiveGroup']): PreparedZone['exclusiveGroup'] {
  return group === null ? null : Object.freeze({ ...group })
}

function collectSelectedZones(
  preparedResources: PreparedAudibleMidiSampleResources,
  voicePlans: ReturnType<typeof createBuiltInScoreQualityPlaybackFixture>['voicePlans'],
): readonly BuiltInScoreQualitySelectedZoneMeasurement[] {
  const instrumentBySoundbank = new Map(
    preparedResources.instruments.map(
      (instrument) => [instrument.soundbankId, instrument] as const,
    ),
  )
  const identities = new Map<
    string,
    { readonly pitch: number; readonly soundbankId: SoundbankId }
  >()
  for (const plan of voicePlans) {
    identities.set(`${plan.soundbankId}:${plan.pitch}`, {
      pitch: plan.pitch,
      soundbankId: plan.soundbankId,
    })
  }

  return Object.freeze(
    [...identities.values()]
      .sort(
        (left, right) =>
          left.soundbankId.localeCompare(right.soundbankId) || left.pitch - right.pitch,
      )
      .map(({ pitch, soundbankId }) => {
        const instrument = instrumentBySoundbank.get(soundbankId)
        const zone = instrument?.manifest.zones.find((candidate) =>
          zoneContainsPitch(candidate, pitch),
        )
        if (zone === undefined) {
          throw new TypeError(`MI5 prepared resources do not cover ${soundbankId} pitch ${pitch}`)
        }
        return Object.freeze({
          exclusiveGroup: copyExclusiveGroup(zone.exclusiveGroup),
          loopKind: zone.loop.kind,
          pitch,
          soundbankId,
          triggerMode: zone.triggerMode,
          zoneId: zone.zoneId,
        })
      }),
  )
}

function measurePreparedResources(preparedResources: PreparedAudibleMidiSampleResources) {
  const resources = preparedResources.instruments.flatMap(({ resources }) => resources)
  return Object.freeze({
    decodedFloat32ByteLength: resources.reduce(
      (total, { audioBuffer }) =>
        total + audioBuffer.length * audioBuffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
      0,
    ),
    encodedByteLength: resources.reduce(
      (total, { encodedByteLength }) => total + encodedByteLength,
      0,
    ),
    instrumentCount: preparedResources.instruments.length,
    resourceCount: resources.length,
  })
}

function routeSetIsExact(
  fixture: ReturnType<typeof createBuiltInScoreQualityPlaybackFixture>,
): boolean {
  const actual = [
    ...new Set(fixture.projectPlan.tracks.map(({ instrument }) => instrument.soundbankId)),
  ].sort()
  const expected = BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS.map(({ soundbankId }) => soundbankId)
    .slice()
    .sort()
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  )
}

function initialControlsArePreserved(
  fixture: ReturnType<typeof createBuiltInScoreQualityPlaybackFixture>,
): boolean {
  return BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS.every((expectation) => {
    const route = fixture.projectPlan.tracks.find(
      ({ instrument }) => instrument.soundbankId === expectation.soundbankId,
    )
    const channelPlan = fixture.voicePlans.find(
      ({ soundbankId }) => soundbankId === expectation.soundbankId,
    )
    return (
      route !== undefined &&
      channelPlan?.channel === expectation.channel &&
      Math.abs(route.gain - expectation.gain) < 1e-12 &&
      Math.abs(route.pan - expectation.pan) < 1e-12
    )
  })
}

function fixtureProgramsArePreserved(
  fixture: ReturnType<typeof createBuiltInScoreQualityPlaybackFixture>,
): boolean {
  return BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS.every((expectation) =>
    fixture.decodedDocument.tracks.some(
      ({ channel, programNumber }) =>
        channel === expectation.channel && programNumber === expectation.programNumber,
    ),
  )
}

function placeholderRemainsSilentAndVisible(
  fixture: ReturnType<typeof createBuiltInScoreQualityPlaybackFixture>,
): boolean {
  const placeholder = fixture.snapshot.devices
    .map(decodeMidiProgramPlaceholderDeviceState)
    .find((state) => state !== null)
  return (
    placeholder?.channel === BUILT_IN_SCORE_QUALITY_PLACEHOLDER.channel &&
    placeholder.programNumber === BUILT_IN_SCORE_QUALITY_PLACEHOLDER.programNumber &&
    fixture.importDiagnostics.some(
      ({ code }) => code === PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_UNAVAILABLE,
    ) &&
    fixture.projectPlan.diagnostics.some(({ code }) => code === 'instrument-runtime-missing') &&
    fixture.projectPlan.status === 'partial' &&
    fixture.projectPlan.tracks.length === BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS.length
  )
}

function hasExpectedLoopZones(
  selectedZones: readonly BuiltInScoreQualitySelectedZoneMeasurement[],
): boolean {
  return ['string-ensemble', 'trumpet', 'flute'].every((soundbankId) =>
    selectedZones.some((zone) => zone.soundbankId === soundbankId && zone.loopKind !== 'none'),
  )
}

function percussionZones(
  selectedZones: readonly BuiltInScoreQualitySelectedZoneMeasurement[],
): readonly BuiltInScoreQualitySelectedZoneMeasurement[] {
  return selectedZones.filter(({ soundbankId }) => soundbankId === 'general-midi-percussion')
}

function hasExpectedHiHatChoke(
  selectedZones: readonly BuiltInScoreQualitySelectedZoneMeasurement[],
): boolean {
  const percussion = percussionZones(selectedZones)
  const closed = percussion.find(({ pitch }) => pitch === 42)
  const open = percussion.find(({ pitch }) => pitch === 46)
  return (
    closed?.exclusiveGroup !== null &&
    closed?.exclusiveGroup !== undefined &&
    open?.exclusiveGroup !== null &&
    open?.exclusiveGroup !== undefined &&
    closed.exclusiveGroup.groupId === open.exclusiveGroup.groupId &&
    closed.exclusiveGroup.offByGroupId === open.exclusiveGroup.groupId &&
    open.exclusiveGroup.offByGroupId === closed.exclusiveGroup.groupId &&
    closed.exclusiveGroup.offMode === 'fast' &&
    open.exclusiveGroup.offMode === 'fast'
  )
}

function finiteMeasurementValues(
  mix: ReturnType<typeof measureAudioQualityAq0Channels>,
  tail: ReturnType<typeof measureAudioQualityAq0Channels>,
): readonly number[] {
  return [
    mix.peakDbfs,
    mix.peakLinear,
    mix.rmsDbfs,
    mix.rmsLinear,
    tail.peakDbfs,
    tail.peakLinear,
    ...mix.channelMeasurements.flatMap((channel) => Object.values(channel)),
    ...tail.channelMeasurements.flatMap((channel) => Object.values(channel)),
  ].filter((value): value is number => value !== null)
}

/** Measures the original MI5 score through real Catalogue assets and the production Voice Runtime. */
export async function runBuiltInScoreQualityBrowserReport(
  options: RunBuiltInScoreQualityBrowserReportOptions,
): Promise<BuiltInScoreQualityBrowserReport> {
  const fixture = createBuiltInScoreQualityPlaybackFixture()
  const assetLocations = createDefaultBuiltInSampleAssetLocations(options.expectedOrigin)
  const renderState: {
    cache?: SampleInstrumentResourceCache
    preparedResources?: PreparedAudibleMidiSampleResources
  } = {}

  try {
    const rendered = await renderAudioQualityPlans({
      createPreparedResources: async (context) => {
        const cache = new SampleInstrumentResourceCache({
          audioContext: context,
          expectedOrigin: options.expectedOrigin,
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
          limits: DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS,
        })
        renderState.cache = cache
        const preparedResources = await prepareAudibleMidiSampleResources(
          fixture.projectPlan,
          cache,
          Object.freeze({
            locate: (soundbankId: SoundbankId) => {
              const assetBaseUrl = assetLocations.get(soundbankId)
              return assetBaseUrl === undefined
                ? null
                : Object.freeze({ assetBaseUrl, soundbankId })
            },
          }),
        )
        renderState.preparedResources = preparedResources
        return preparedResources
      },
      plans: fixture.voicePlans,
      renderDurationSecond: BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND,
    })
    const { cache, preparedResources } = renderState
    if (cache === undefined || preparedResources === undefined) {
      throw new TypeError('MI5 score resources were not prepared')
    }

    const selectedZones = collectSelectedZones(preparedResources, fixture.voicePlans)
    const resourceMeasurement = measurePreparedResources(preparedResources)
    const mix = measureAudioQualityAq0Channels(
      rendered.channels,
      0,
      audioQualitySecondToFrame(BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND),
    )
    const tail = measureAudioQualityAq0Channels(
      rendered.channels,
      audioQualitySecondToFrame(BUILT_IN_SCORE_QUALITY_TAIL_WINDOW.fromSecond),
      audioQualitySecondToFrame(BUILT_IN_SCORE_QUALITY_TAIL_WINDOW.toSecond),
    )
    const clippedFrameCount = countAudioQualityClippedFrames(
      rendered.channels,
      0,
      audioQualitySecondToFrame(BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND),
    )
    const cacheAfterRender = cache.statistics
    cache.dispose()
    const cacheAfterDispose = cache.statistics
    const runtimeAfterRender = runtimeStatisticsShape(rendered.runtimeStatisticsAfterRender)
    const runtimeAfterDispose = runtimeStatisticsShape(rendered.runtimeStatisticsAfterDispose)
    const percussion = percussionZones(selectedZones)
    const allScorePitchesCovered =
      selectedZones.length ===
      new Set(fixture.voicePlans.map(({ pitch, soundbankId }) => `${soundbankId}:${pitch}`)).size

    return Object.freeze({
      checks: Object.freeze({
        allMeasurementsFinite: finiteMeasurementValues(mix, tail).every(Number.isFinite),
        allPlansScheduled:
          rendered.scheduleResults.length === fixture.voicePlans.length &&
          rendered.scheduleResults.every(({ outcome }) => outcome === 'scheduled'),
        allScorePitchesCovered,
        cc64FinalGateExtended: fixture.voicePlans.some(
          ({ keyReleasePlaybackClockSecond, releasePlaybackClockSecond, soundbankId }) =>
            soundbankId === 'studio-grand' &&
            keyReleasePlaybackClockSecond < releasePlaybackClockSecond,
        ),
        channelTenUsesPercussion:
          fixtureProgramsArePreserved(fixture) &&
          fixture.voicePlans.some(
            ({ channel, soundbankId }) =>
              channel === 9 && soundbankId === 'general-midi-percussion',
          ),
        decodedCacheWithinRetentionBudget:
          cacheAfterRender.decodedFloat32ByteLength <=
          DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS.maximumDecodedFloat32ByteLength,
        decodedCacheReleasedAfterDispose: isZeroCacheStatistics(cacheAfterDispose),
        initialGainAndPanPreserved: initialControlsArePreserved(fixture),
        loopZonesExercised: hasExpectedLoopZones(selectedZones),
        noClippedFrames: clippedFrameCount === 0,
        percussionHiHatChokePresent: hasExpectedHiHatChoke(selectedZones),
        percussionOneShotsExercised:
          percussion.length >= 4 &&
          percussion.every(({ triggerMode }) => triggerMode === 'one-shot'),
        placeholderRemainsSilentAndVisible: placeholderRemainsSilentAndVisible(fixture),
        representativeMixPeakAtOrBelowThreshold:
          mix.peakDbfs !== null &&
          mix.peakDbfs <= BUILT_IN_SCORE_QUALITY_GATE_POLICY.representativeMixPeakThresholdDbfs,
        routeSetExact: routeSetIsExact(fixture),
        runtimeReleasedAfterDispose: isZeroStatistics(runtimeAfterDispose),
        runtimeReleasedAfterRender: isZeroStatistics(runtimeAfterRender),
        tailBelowThreshold:
          tail.peakDbfs === null ||
          tail.peakDbfs < BUILT_IN_SCORE_QUALITY_GATE_POLICY.tailThresholdDbfs,
      }),
      environment: Object.freeze({
        offlineAudioContextAvailable: true,
        userAgent: options.userAgent ?? navigator.userAgent,
      }),
      fixture: Object.freeze({
        encodedMidiByteLength: fixture.encodedMidiBytes.byteLength,
        importedNoteCount: fixture.snapshot.midiNotePartitions.reduce(
          (noteCount, partition) => noteCount + partition.notes.length,
          0,
        ),
        importedTrackCount: fixture.snapshot.tracks.length,
        schema: BUILT_IN_SCORE_QUALITY_FIXTURE_SCHEMA,
        sourceTrackCount: fixture.decodedDocument.tracks.length,
      }),
      gatePolicy: BUILT_IN_SCORE_QUALITY_GATE_POLICY,
      importAndPlayback: Object.freeze({
        importDiagnosticCodes: Object.freeze(fixture.importDiagnostics.map(({ code }) => code)),
        playbackDiagnosticCodes: Object.freeze(
          fixture.projectPlan.diagnostics.map(({ code }) => code),
        ),
        planStatus: fixture.projectPlan.status,
        playableTrackCount: fixture.projectPlan.tracks.length,
        scheduledVoiceCount: fixture.voicePlans.length,
      }),
      lifecycle: Object.freeze({
        cacheAfterDispose,
        cacheAfterRender,
        runtimeAfterDispose,
        runtimeAfterRender,
      }),
      mix: Object.freeze({
        ...mix,
        clippedFrameCount,
        tailPeakDbfs: tail.peakDbfs,
        tailPeakLinear: tail.peakLinear,
      }),
      resources: Object.freeze({
        ...resourceMeasurement,
        selectedZones,
      }),
      sampleRateHz: AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
      schema: BUILT_IN_SCORE_QUALITY_BROWSER_REPORT_SCHEMA,
      schemaVersion: 1,
    })
  } finally {
    renderState.cache?.dispose()
  }
}
