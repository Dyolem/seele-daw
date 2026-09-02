import {
  AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY,
  AUDIO_QUALITY_V1A_RENDER_POLICY,
  calculateAudioQualityV1aVelocityGain,
} from '#internal/audio-quality/render-policy'
import {
  runAudioQualityAq2BrowserReport,
  type AudioQualityAq2BrowserReport,
} from '#internal/development/audio-quality-aq0/aq2-browser-report'
import {
  runAudioQualityAq3BrowserReport,
  type AudioQualityAq3BrowserReport,
} from '#internal/development/audio-quality-aq0/aq3-browser-report'
import {
  runAudioQualityExpressionEq2BrowserReport,
  type AudioQualityExpressionEq2BrowserReport,
} from '#internal/development/audio-quality-aq0/expression-eq2-browser-report'
import {
  AUDIO_QUALITY_AQ0_NOTE_RELEASE_SECOND,
  AUDIO_QUALITY_AQ0_NOTE_START_SECOND,
  AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND,
  AUDIO_QUALITY_AQ0_REPORT_SCHEMA,
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  AUDIO_QUALITY_AQ0_SOURCE_AMPLITUDE,
  AUDIO_QUALITY_AQ0_SOURCE_DURATION_SECOND,
  AUDIO_QUALITY_AQ0_SOURCE_FREQUENCY_HZ,
  AUDIO_QUALITY_AQ0_STEADY_WINDOW,
  AUDIO_QUALITY_AQ0_TAIL_WINDOW,
  AUDIO_QUALITY_AQ0_VELOCITY_VECTOR,
  AUDIO_QUALITY_AQ0_ZONE_RELEASE_SECOND,
  AUDIO_QUALITY_AQ1_COHERENT_STRESS_VOICE_COUNT,
  AUDIO_QUALITY_AQ1_REFERENCE_TRIAD_PITCHES,
  audioQualitySecondToFrame,
  createAudioQualityBrowserPlan,
} from '#internal/development/audio-quality-aq0/fixture'
import {
  countAudioQualityClippedFrames,
  measureAudioQualityAq0Channels,
  type AudioQualityAq0ChannelMeasurement,
} from '#internal/development/audio-quality-aq0/measurement'
import {
  renderAudioQualityAq0Plans,
  type AudioQualityOfflineRenderResult,
} from '#internal/development/audio-quality-aq0/offline-render'
import type { SampleInstrumentVoiceRuntimeStatistics } from '#internal/sample-instrument/voice/voice-runtime'

export { AUDIO_QUALITY_AQ0_REPORT_SCHEMA, AUDIO_QUALITY_AQ0_VELOCITY_VECTOR }

interface AudioQualityAq0RenderedWindowMeasurement {
  readonly channelMeasurements: readonly AudioQualityAq0ChannelMeasurement[]
  readonly clippedFrameCount: number
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly rmsDbfs: number | null
  readonly rmsLinear: number
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly tailPeakDbfs: number | null
  readonly tailPeakLinear: number
}

export interface AudioQualityAq0VelocityMeasurement extends AudioQualityAq0RenderedWindowMeasurement {
  readonly baseGain: number
  readonly relativeRmsDbToVelocity127: number | null
  readonly velocity: number
}

export interface AudioQualityAq0PolyphonyMeasurement extends AudioQualityAq0RenderedWindowMeasurement {
  readonly id: 'coherent-ten-voice-stress' | 'reference-triad'
  readonly pitches: readonly number[]
  readonly velocity: number
  readonly voiceCount: number
}

export interface AudioQualityAq0BrowserReport {
  readonly aq2: AudioQualityAq2BrowserReport
  readonly aq3: AudioQualityAq3BrowserReport
  readonly checks: {
    readonly allMeasurementsFinite: boolean
    readonly aq2AllMeasurementsFinite: boolean
    readonly aq2EnvelopeErrorsAtOrBelowTolerance: boolean
    readonly aq2LoopSeamsAtOrBelowTolerance: boolean
    readonly aq2LoopSignalsAudible: boolean
    readonly aq2MutexFastReleaseAtOrBelowTolerance: boolean
    readonly aq2MutexRoutesNewVoiceAfterChoke: boolean
    readonly aq2OneShotContinuesAfterNoteOff: boolean
    readonly aq2ResourcesReleasedAfterDispose: boolean
    readonly aq2ResourcesReleasedAfterRender: boolean
    readonly aq2TailsBelowMinus90Dbfs: boolean
    readonly aq3AllMeasurementsFinite: boolean
    readonly aq3NoClippedFrames: boolean
    readonly aq3ProjectRuntimeBudgetExact: boolean
    readonly aq3ResourcesReleasedAfterDispose: boolean
    readonly aq3ResourcesReleasedAfterRender: boolean
    readonly aq3RetirementFastReleaseAtOrBelowTolerance: boolean
    readonly aq3RetirementTailsBelowMinus90Dbfs: boolean
    readonly aq3SoundingLevelsAtOrBelowTolerance: boolean
    readonly aq3StressBudgetExact: boolean
    readonly aq3TailsBelowMinus90Dbfs: boolean
    readonly expressionEq2AllMeasurementsFinite: boolean
    readonly expressionEq2DensePedalHoldLevelStable: boolean
    readonly expressionEq2DensePedalPeakAtOrBelowMinus3Dbfs: boolean
    readonly expressionEq2KeyReleaseDoesNotStartFinalRelease: boolean
    readonly expressionEq2NoClippedFrames: boolean
    readonly expressionEq2OneShotContinuesAfterFinalGate: boolean
    readonly expressionEq2PedalUpReleaseAtOrBelowTolerance: boolean
    readonly expressionEq2ResourcesReleasedAfterDispose: boolean
    readonly expressionEq2ResourcesReleasedAfterRender: boolean
    readonly expressionEq2RetriggerOccurrencesRemainIndependent: boolean
    readonly expressionEq2TailsBelowMinus90Dbfs: boolean
    readonly noClippedFrames: boolean
    readonly referencePeakAtOrBelowMinus3Dbfs: boolean
    readonly resourcesReleasedAfterDispose: boolean
    readonly resourcesReleasedAfterRender: boolean
    readonly stressPeakAtOrBelowMinus1Dbfs: boolean
    readonly tailsBelowMinus90Dbfs: boolean
  }
  readonly environment: {
    readonly offlineAudioContextAvailable: true
    readonly userAgent: string
  }
  readonly expressionEq2: AudioQualityExpressionEq2BrowserReport
  readonly expressionPolicy: typeof AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY
  readonly expressionRenderPolicy: typeof AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY.id
  readonly fixture: {
    readonly noteReleaseSecond: number
    readonly noteStartSecond: number
    readonly renderDurationSecond: number
    readonly sampleRateHz: number
    readonly sourceAmplitude: number
    readonly sourceDurationSecond: number
    readonly sourceFrequencyHz: number
    readonly steadyWindow: typeof AUDIO_QUALITY_AQ0_STEADY_WINDOW
    readonly tailWindow: typeof AUDIO_QUALITY_AQ0_TAIL_WINDOW
    readonly zoneReleaseSecond: number
  }
  readonly policy: typeof AUDIO_QUALITY_V1A_RENDER_POLICY
  readonly polyphonyMeasurements: readonly AudioQualityAq0PolyphonyMeasurement[]
  readonly renderPolicy: typeof AUDIO_QUALITY_V1A_RENDER_POLICY.id
  readonly schema: typeof AUDIO_QUALITY_AQ0_REPORT_SCHEMA
  readonly schemaVersion: 5
  readonly velocityMeasurements: readonly AudioQualityAq0VelocityMeasurement[]
}

function isZeroStatistics(statistics: SampleInstrumentVoiceRuntimeStatistics): boolean {
  return (
    statistics.activeVoiceCount === 0 &&
    statistics.connectedNodeCount === 0 &&
    statistics.endedListenerCount === 0 &&
    statistics.sourceNodeCount === 0
  )
}

function measureRenderedWindow(
  rendered: AudioQualityOfflineRenderResult,
): AudioQualityAq0RenderedWindowMeasurement {
  const steady = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_STEADY_WINDOW.fromSecond),
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_STEADY_WINDOW.toSecond),
  )
  const tail = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_TAIL_WINDOW.fromSecond),
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_TAIL_WINDOW.toSecond),
  )
  return Object.freeze({
    ...steady,
    clippedFrameCount: countAudioQualityClippedFrames(
      rendered.channels,
      0,
      audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND),
    ),
    runtimeStatisticsAfterDispose: rendered.runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender: rendered.runtimeStatisticsAfterRender,
    tailPeakDbfs: tail.peakDbfs,
    tailPeakLinear: tail.peakLinear,
  })
}

async function renderVelocity(velocity: number): Promise<AudioQualityAq0VelocityMeasurement> {
  const measured = measureRenderedWindow(
    await renderAudioQualityAq0Plans([
      createAudioQualityBrowserPlan({ occurrenceKey: `velocity-${velocity}`, velocity }),
    ]),
  )
  return Object.freeze({
    ...measured,
    baseGain: calculateAudioQualityV1aVelocityGain(velocity),
    relativeRmsDbToVelocity127: null,
    velocity,
  })
}

async function renderPolyphony(
  id: AudioQualityAq0PolyphonyMeasurement['id'],
  pitches: readonly number[],
  velocity: number,
): Promise<AudioQualityAq0PolyphonyMeasurement> {
  const measured = measureRenderedWindow(
    await renderAudioQualityAq0Plans(
      pitches.map((pitch, index) =>
        createAudioQualityBrowserPlan({
          occurrenceKey: `${id}-${index + 1}`,
          pitch,
          velocity,
        }),
      ),
    ),
  )
  return Object.freeze({
    ...measured,
    id,
    pitches: Object.freeze([...pitches]),
    velocity,
    voiceCount: pitches.length,
  })
}

function withRelativeVelocityLevel(
  measurement: AudioQualityAq0VelocityMeasurement,
  referenceRmsLinear: number,
): AudioQualityAq0VelocityMeasurement {
  return Object.freeze({
    ...measurement,
    relativeRmsDbToVelocity127:
      measurement.rmsLinear === 0 || referenceRmsLinear === 0
        ? null
        : 20 * Math.log10(measurement.rmsLinear / referenceRmsLinear),
  })
}

function collectFiniteMeasurementValues(
  velocityMeasurements: readonly AudioQualityAq0VelocityMeasurement[],
  polyphonyMeasurements: readonly AudioQualityAq0PolyphonyMeasurement[],
): readonly number[] {
  return [...velocityMeasurements, ...polyphonyMeasurements].flatMap((measurement) => {
    const commonValues = [
      measurement.clippedFrameCount,
      measurement.peakDbfs,
      measurement.peakLinear,
      measurement.rmsDbfs,
      measurement.rmsLinear,
      measurement.tailPeakDbfs,
      measurement.tailPeakLinear,
      measurement.velocity,
      ...measurement.channelMeasurements.flatMap((channel) => [
        channel.dcOffset,
        channel.peakDbfs,
        channel.peakLinear,
        channel.rmsDbfs,
        channel.rmsLinear,
      ]),
      ...Object.values(measurement.runtimeStatisticsAfterDispose),
      ...Object.values(measurement.runtimeStatisticsAfterRender),
    ]
    const policyValues =
      'baseGain' in measurement
        ? [measurement.baseGain, measurement.relativeRmsDbToVelocity127]
        : [measurement.voiceCount, ...measurement.pitches]
    return [...commonValues, ...policyValues].filter(
      (value): value is number => value !== null && typeof value === 'number',
    )
  })
}

export async function runAudioQualityAq0BrowserBaseline(): Promise<AudioQualityAq0BrowserReport> {
  const [rawVelocityMeasurements, referenceTriad, coherentStress] = await Promise.all([
    Promise.all(AUDIO_QUALITY_AQ0_VELOCITY_VECTOR.map(renderVelocity)),
    renderPolyphony('reference-triad', AUDIO_QUALITY_AQ1_REFERENCE_TRIAD_PITCHES, 96),
    renderPolyphony(
      'coherent-ten-voice-stress',
      Object.freeze(
        Array.from({ length: AUDIO_QUALITY_AQ1_COHERENT_STRESS_VOICE_COUNT }, () => 60),
      ),
      127,
    ),
  ])
  const referenceVelocity = rawVelocityMeasurements.at(-1)
  if (referenceVelocity === undefined) throw new TypeError('AQ0 Velocity reference is unavailable')
  const velocityMeasurements = Object.freeze(
    rawVelocityMeasurements.map((measurement) =>
      withRelativeVelocityLevel(measurement, referenceVelocity.rmsLinear),
    ),
  )
  const polyphonyMeasurements = Object.freeze([referenceTriad, coherentStress])
  const allMeasurements = [...velocityMeasurements, ...polyphonyMeasurements]
  const [aq2, aq3, expressionEq2] = await Promise.all([
    runAudioQualityAq2BrowserReport(),
    runAudioQualityAq3BrowserReport(),
    runAudioQualityExpressionEq2BrowserReport(),
  ])

  return Object.freeze({
    aq2,
    aq3,
    checks: Object.freeze({
      allMeasurementsFinite: collectFiniteMeasurementValues(
        velocityMeasurements,
        polyphonyMeasurements,
      ).every(Number.isFinite),
      aq2AllMeasurementsFinite: aq2.checks.allMeasurementsFinite,
      aq2EnvelopeErrorsAtOrBelowTolerance: aq2.checks.envelopeErrorsAtOrBelowTolerance,
      aq2LoopSeamsAtOrBelowTolerance: aq2.checks.loopSeamsAtOrBelowTolerance,
      aq2LoopSignalsAudible: aq2.checks.loopSignalsAudible,
      aq2MutexFastReleaseAtOrBelowTolerance: aq2.checks.mutexFastReleaseAtOrBelowTolerance,
      aq2MutexRoutesNewVoiceAfterChoke: aq2.checks.mutexRoutesNewVoiceAfterChoke,
      aq2OneShotContinuesAfterNoteOff: aq2.checks.oneShotContinuesAfterNoteOff,
      aq2ResourcesReleasedAfterDispose: aq2.checks.resourcesReleasedAfterDispose,
      aq2ResourcesReleasedAfterRender: aq2.checks.resourcesReleasedAfterRender,
      aq2TailsBelowMinus90Dbfs: aq2.checks.tailsBelowMinus90Dbfs,
      aq3AllMeasurementsFinite: aq3.checks.allMeasurementsFinite,
      aq3NoClippedFrames: aq3.checks.noClippedFrames,
      aq3ProjectRuntimeBudgetExact: aq3.checks.projectRuntimeBudgetExact,
      aq3ResourcesReleasedAfterDispose: aq3.checks.resourcesReleasedAfterDispose,
      aq3ResourcesReleasedAfterRender: aq3.checks.resourcesReleasedAfterRender,
      aq3RetirementFastReleaseAtOrBelowTolerance:
        aq3.checks.retirementFastReleaseAtOrBelowTolerance,
      aq3RetirementTailsBelowMinus90Dbfs: aq3.checks.retirementTailsBelowMinus90Dbfs,
      aq3SoundingLevelsAtOrBelowTolerance: aq3.checks.soundingLevelsAtOrBelowTolerance,
      aq3StressBudgetExact: aq3.checks.stressBudgetExact,
      aq3TailsBelowMinus90Dbfs: aq3.checks.tailsBelowMinus90Dbfs,
      expressionEq2AllMeasurementsFinite: expressionEq2.checks.allMeasurementsFinite,
      expressionEq2DensePedalHoldLevelStable: expressionEq2.checks.densePedalHoldLevelStable,
      expressionEq2DensePedalPeakAtOrBelowMinus3Dbfs:
        expressionEq2.checks.densePedalPeakAtOrBelowMinus3Dbfs,
      expressionEq2KeyReleaseDoesNotStartFinalRelease:
        expressionEq2.checks.keyReleaseDoesNotStartFinalRelease,
      expressionEq2NoClippedFrames: expressionEq2.checks.noClippedFrames,
      expressionEq2OneShotContinuesAfterFinalGate:
        expressionEq2.checks.oneShotContinuesAfterFinalGate,
      expressionEq2PedalUpReleaseAtOrBelowTolerance:
        expressionEq2.checks.pedalUpReleaseAtOrBelowTolerance,
      expressionEq2ResourcesReleasedAfterDispose:
        expressionEq2.checks.resourcesReleasedAfterDispose,
      expressionEq2ResourcesReleasedAfterRender: expressionEq2.checks.resourcesReleasedAfterRender,
      expressionEq2RetriggerOccurrencesRemainIndependent:
        expressionEq2.checks.retriggerOccurrencesRemainIndependent,
      expressionEq2TailsBelowMinus90Dbfs: expressionEq2.checks.tailsBelowMinus90Dbfs,
      noClippedFrames: allMeasurements.every((measurement) => measurement.clippedFrameCount === 0),
      referencePeakAtOrBelowMinus3Dbfs:
        referenceTriad.peakDbfs !== null && referenceTriad.peakDbfs <= -3,
      resourcesReleasedAfterDispose: allMeasurements.every((measurement) =>
        isZeroStatistics(measurement.runtimeStatisticsAfterDispose),
      ),
      resourcesReleasedAfterRender: allMeasurements.every((measurement) =>
        isZeroStatistics(measurement.runtimeStatisticsAfterRender),
      ),
      stressPeakAtOrBelowMinus1Dbfs:
        coherentStress.peakDbfs !== null && coherentStress.peakDbfs <= -1,
      tailsBelowMinus90Dbfs: allMeasurements.every(
        (measurement) => measurement.tailPeakDbfs === null || measurement.tailPeakDbfs < -90,
      ),
    }),
    environment: Object.freeze({
      offlineAudioContextAvailable: true,
      userAgent: navigator.userAgent,
    }),
    expressionEq2,
    expressionPolicy: AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY,
    expressionRenderPolicy: AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY.id,
    fixture: Object.freeze({
      noteReleaseSecond: AUDIO_QUALITY_AQ0_NOTE_RELEASE_SECOND,
      noteStartSecond: AUDIO_QUALITY_AQ0_NOTE_START_SECOND,
      renderDurationSecond: AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND,
      sampleRateHz: AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
      sourceAmplitude: AUDIO_QUALITY_AQ0_SOURCE_AMPLITUDE,
      sourceDurationSecond: AUDIO_QUALITY_AQ0_SOURCE_DURATION_SECOND,
      sourceFrequencyHz: AUDIO_QUALITY_AQ0_SOURCE_FREQUENCY_HZ,
      steadyWindow: AUDIO_QUALITY_AQ0_STEADY_WINDOW,
      tailWindow: AUDIO_QUALITY_AQ0_TAIL_WINDOW,
      zoneReleaseSecond: AUDIO_QUALITY_AQ0_ZONE_RELEASE_SECOND,
    }),
    policy: AUDIO_QUALITY_V1A_RENDER_POLICY,
    polyphonyMeasurements,
    renderPolicy: AUDIO_QUALITY_V1A_RENDER_POLICY.id,
    schema: AUDIO_QUALITY_AQ0_REPORT_SCHEMA,
    schemaVersion: 5,
    velocityMeasurements,
  })
}
