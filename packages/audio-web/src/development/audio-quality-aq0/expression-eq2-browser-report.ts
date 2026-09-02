import {
  AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY,
  AUDIO_QUALITY_V1A_RENDER_POLICY,
} from '#internal/audio-quality/render-policy'
import {
  AUDIO_QUALITY_EXPRESSION_EQ2_KEY_RELEASE_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_NOTE_START_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_PITCH,
  AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_AMPLITUDE,
  AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_FREQUENCY_HZ,
  AUDIO_QUALITY_EXPRESSION_EQ2_STRESS_VOICE_COUNT,
  AUDIO_QUALITY_EXPRESSION_EQ2_TAIL_WINDOW,
  AUDIO_QUALITY_EXPRESSION_EQ2_ZONE_RELEASE_SECOND,
  createAudioQualityExpressionEq2Plan,
  createAudioQualityExpressionEq2PreparedResources,
  createAudioQualityExpressionEq2RetriggerPlans,
  createAudioQualityExpressionEq2StressPlans,
} from '#internal/development/audio-quality-aq0/expression-eq2-fixture'
import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
} from '#internal/development/audio-quality-aq0/fixture'
import {
  countAudioQualityClippedFrames,
  measureAudioQualityAq0Channel,
  measureAudioQualityAq0Channels,
} from '#internal/development/audio-quality-aq0/measurement'
import {
  renderAudioQualityPlans,
  type AudioQualityOfflineRenderResult,
} from '#internal/development/audio-quality-aq0/offline-render'
import type {
  SampleInstrumentVoicePolyphonyStatistics,
  SampleInstrumentVoiceRuntimeStatistics,
} from '#internal/sample-instrument/voice/voice-runtime'

export const AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY = Object.freeze({
  envelopeErrorToleranceFullScale: 1e-4,
  headroomPeakThresholdDbfs: -3,
  holdLevelRatioMaximum: 1.01,
  holdLevelRatioMinimum: 0.99,
  retriggerLevelRatioMaximum: 2.01,
  retriggerLevelRatioMinimum: 1.99,
  tailThresholdDbfs: -90,
} as const)

type AudioQualityExpressionEq2TriggerId =
  | 'continuous-loop'
  | 'no-loop'
  | 'one-shot'
  | 'sustain-loop'

interface AudioQualityExpressionEq2RuntimeMeasurement {
  readonly clippedFrameCount: number
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly tailPeakDbfs: number | null
  readonly tailPeakLinear: number
}

export interface AudioQualityExpressionEq2TriggerMeasurement extends AudioQualityExpressionEq2RuntimeMeasurement {
  readonly id: AudioQualityExpressionEq2TriggerId
  readonly keyReleaseMaximumAbsoluteError: number
  readonly oneShotPostGatePeakLinear: number | null
  readonly pedalUpReleaseMaximumAbsoluteError: number | null
}

export interface AudioQualityExpressionEq2StressMeasurement extends AudioQualityExpressionEq2RuntimeMeasurement {
  readonly holdLevelRatio: number
  readonly holdRmsLinear: number
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly polyphonyStatisticsAfterSchedule: SampleInstrumentVoicePolyphonyStatistics
  readonly preKeyReleaseRmsLinear: number
  readonly voiceCount: number
}

export interface AudioQualityExpressionEq2RetriggerMeasurement extends AudioQualityExpressionEq2RuntimeMeasurement {
  readonly overlapRmsLinear: number
  readonly polyphonyStatisticsAfterSchedule: SampleInstrumentVoicePolyphonyStatistics
  readonly retriggerLevelRatio: number
  readonly singleVoiceRmsLinear: number
}

export interface AudioQualityExpressionEq2BrowserReport {
  readonly checks: {
    readonly allMeasurementsFinite: boolean
    readonly densePedalHoldLevelStable: boolean
    readonly densePedalPeakAtOrBelowMinus3Dbfs: boolean
    readonly keyReleaseDoesNotStartFinalRelease: boolean
    readonly noClippedFrames: boolean
    readonly oneShotContinuesAfterFinalGate: boolean
    readonly pedalUpReleaseAtOrBelowTolerance: boolean
    readonly resourcesReleasedAfterDispose: boolean
    readonly resourcesReleasedAfterRender: boolean
    readonly retriggerOccurrencesRemainIndependent: boolean
    readonly tailsBelowMinus90Dbfs: boolean
  }
  readonly expressionPolicy: typeof AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY
  readonly gatePolicy: typeof AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY
  readonly retriggerMeasurement: AudioQualityExpressionEq2RetriggerMeasurement
  readonly stressMeasurement: AudioQualityExpressionEq2StressMeasurement
  readonly triggerMeasurements: readonly AudioQualityExpressionEq2TriggerMeasurement[]
}

function isZeroRuntimeStatistics(statistics: SampleInstrumentVoiceRuntimeStatistics): boolean {
  return Object.values(statistics).every((value) => value === 0)
}

function maximumExpectedSignalError(
  channel: Float32Array,
  fromSecond: number,
  toSecond: number,
  options: {
    readonly oneShot: boolean
    readonly releaseSecond: number
    readonly startSecond: number
  },
): number {
  const fromFrame = audioQualitySecondToFrame(fromSecond)
  const toFrame = audioQualitySecondToFrame(toSecond)
  const startFrame = audioQualitySecondToFrame(options.startSecond)
  const releaseFrame = audioQualitySecondToFrame(options.releaseSecond)
  const releaseDurationFrame = audioQualitySecondToFrame(
    AUDIO_QUALITY_EXPRESSION_EQ2_ZONE_RELEASE_SECOND,
  )
  const expectedLevel =
    AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_AMPLITUDE *
    AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain
  let maximumError = 0
  for (let frame = fromFrame; frame < toFrame; frame += 1) {
    const elapsedFrame = frame - startFrame
    let envelopeGain = 1
    if (!options.oneShot && frame >= releaseFrame) {
      envelopeGain = Math.max(0, 1 - (frame - releaseFrame) / releaseDurationFrame)
    }
    const expected =
      elapsedFrame < 0
        ? 0
        : expectedLevel *
          envelopeGain *
          Math.sin(
            (2 * Math.PI * AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_FREQUENCY_HZ * elapsedFrame) /
              AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
          )
    maximumError = Math.max(maximumError, Math.abs(channel[frame]! - expected))
  }
  return maximumError
}

function measureRuntimeTail(rendered: AudioQualityOfflineRenderResult) {
  return measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_TAIL_WINDOW.fromSecond),
    audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_TAIL_WINDOW.toSecond),
  )
}

async function renderTriggerMeasurement(
  id: AudioQualityExpressionEq2TriggerId,
  pitch: number,
): Promise<AudioQualityExpressionEq2TriggerMeasurement> {
  const oneShot = id === 'one-shot'
  const rendered = await renderAudioQualityPlans({
    createPreparedResources: createAudioQualityExpressionEq2PreparedResources,
    plans: [createAudioQualityExpressionEq2Plan({ occurrenceKey: `eq2-${id}`, pitch })],
    renderDurationSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND,
  })
  const channel = rendered.channels[0]!
  const tail = measureRuntimeTail(rendered)
  const postGate = measureAudioQualityAq0Channel(
    channel,
    audioQualitySecondToFrame(0.32),
    audioQualitySecondToFrame(0.35),
  )
  return Object.freeze({
    clippedFrameCount: countAudioQualityClippedFrames(
      rendered.channels,
      0,
      audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND),
    ),
    id,
    keyReleaseMaximumAbsoluteError: maximumExpectedSignalError(
      channel,
      AUDIO_QUALITY_EXPRESSION_EQ2_KEY_RELEASE_SECOND - 0.01,
      AUDIO_QUALITY_EXPRESSION_EQ2_KEY_RELEASE_SECOND + 0.03,
      {
        oneShot,
        releaseSecond: AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
        startSecond: AUDIO_QUALITY_EXPRESSION_EQ2_NOTE_START_SECOND,
      },
    ),
    oneShotPostGatePeakLinear: oneShot ? postGate.peakLinear : null,
    pedalUpReleaseMaximumAbsoluteError: oneShot
      ? null
      : maximumExpectedSignalError(
          channel,
          AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND - 0.005,
          AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND +
            AUDIO_QUALITY_EXPRESSION_EQ2_ZONE_RELEASE_SECOND +
            0.005,
          {
            oneShot,
            releaseSecond: AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
            startSecond: AUDIO_QUALITY_EXPRESSION_EQ2_NOTE_START_SECOND,
          },
        ),
    runtimeStatisticsAfterDispose: rendered.runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender: rendered.runtimeStatisticsAfterRender,
    tailPeakDbfs: tail.peakDbfs,
    tailPeakLinear: tail.peakLinear,
  })
}

async function renderStressMeasurement(): Promise<AudioQualityExpressionEq2StressMeasurement> {
  const rendered = await renderAudioQualityPlans({
    createPreparedResources: createAudioQualityExpressionEq2PreparedResources,
    plans: createAudioQualityExpressionEq2StressPlans(),
    renderDurationSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND,
  })
  const channel = rendered.channels[0]!
  const preKeyRelease = measureAudioQualityAq0Channel(
    channel,
    audioQualitySecondToFrame(0.1),
    audioQualitySecondToFrame(0.14),
  )
  const hold = measureAudioQualityAq0Channel(
    channel,
    audioQualitySecondToFrame(0.2),
    audioQualitySecondToFrame(0.25),
  )
  const peak = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_NOTE_START_SECOND),
    audioQualitySecondToFrame(
      AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND +
        AUDIO_QUALITY_EXPRESSION_EQ2_ZONE_RELEASE_SECOND,
    ),
  )
  const tail = measureRuntimeTail(rendered)
  return Object.freeze({
    clippedFrameCount: countAudioQualityClippedFrames(
      rendered.channels,
      0,
      audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND),
    ),
    holdLevelRatio: hold.rmsLinear / preKeyRelease.rmsLinear,
    holdRmsLinear: hold.rmsLinear,
    peakDbfs: peak.peakDbfs,
    peakLinear: peak.peakLinear,
    polyphonyStatisticsAfterSchedule: rendered.polyphonyStatisticsAfterSchedule,
    preKeyReleaseRmsLinear: preKeyRelease.rmsLinear,
    runtimeStatisticsAfterDispose: rendered.runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender: rendered.runtimeStatisticsAfterRender,
    tailPeakDbfs: tail.peakDbfs,
    tailPeakLinear: tail.peakLinear,
    voiceCount: AUDIO_QUALITY_EXPRESSION_EQ2_STRESS_VOICE_COUNT,
  })
}

async function renderRetriggerMeasurement(): Promise<AudioQualityExpressionEq2RetriggerMeasurement> {
  const rendered = await renderAudioQualityPlans({
    createPreparedResources: createAudioQualityExpressionEq2PreparedResources,
    plans: createAudioQualityExpressionEq2RetriggerPlans(),
    renderDurationSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND,
  })
  const channel = rendered.channels[0]!
  const singleVoice = measureAudioQualityAq0Channel(
    channel,
    audioQualitySecondToFrame(0.14),
    audioQualitySecondToFrame(0.16),
  )
  const overlap = measureAudioQualityAq0Channel(
    channel,
    audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND + 0.02),
    audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND + 0.04),
  )
  const tail = measureRuntimeTail(rendered)
  return Object.freeze({
    clippedFrameCount: countAudioQualityClippedFrames(
      rendered.channels,
      0,
      audioQualitySecondToFrame(AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND),
    ),
    overlapRmsLinear: overlap.rmsLinear,
    polyphonyStatisticsAfterSchedule: rendered.polyphonyStatisticsAfterSchedule,
    retriggerLevelRatio: overlap.rmsLinear / singleVoice.rmsLinear,
    runtimeStatisticsAfterDispose: rendered.runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender: rendered.runtimeStatisticsAfterRender,
    singleVoiceRmsLinear: singleVoice.rmsLinear,
    tailPeakDbfs: tail.peakDbfs,
    tailPeakLinear: tail.peakLinear,
  })
}

function collectFiniteValues(
  triggerMeasurements: readonly AudioQualityExpressionEq2TriggerMeasurement[],
  stressMeasurement: AudioQualityExpressionEq2StressMeasurement,
  retriggerMeasurement: AudioQualityExpressionEq2RetriggerMeasurement,
): readonly number[] {
  return [
    ...triggerMeasurements.flatMap((measurement) => [
      measurement.clippedFrameCount,
      measurement.keyReleaseMaximumAbsoluteError,
      measurement.oneShotPostGatePeakLinear,
      measurement.pedalUpReleaseMaximumAbsoluteError,
      measurement.tailPeakDbfs,
      measurement.tailPeakLinear,
      ...Object.values(measurement.runtimeStatisticsAfterDispose),
      ...Object.values(measurement.runtimeStatisticsAfterRender),
    ]),
    stressMeasurement.clippedFrameCount,
    stressMeasurement.holdLevelRatio,
    stressMeasurement.holdRmsLinear,
    stressMeasurement.peakDbfs,
    stressMeasurement.peakLinear,
    stressMeasurement.preKeyReleaseRmsLinear,
    stressMeasurement.tailPeakDbfs,
    stressMeasurement.tailPeakLinear,
    stressMeasurement.voiceCount,
    ...Object.values(stressMeasurement.polyphonyStatisticsAfterSchedule),
    ...Object.values(stressMeasurement.runtimeStatisticsAfterDispose),
    ...Object.values(stressMeasurement.runtimeStatisticsAfterRender),
    retriggerMeasurement.clippedFrameCount,
    retriggerMeasurement.overlapRmsLinear,
    retriggerMeasurement.retriggerLevelRatio,
    retriggerMeasurement.singleVoiceRmsLinear,
    retriggerMeasurement.tailPeakDbfs,
    retriggerMeasurement.tailPeakLinear,
    ...Object.values(retriggerMeasurement.polyphonyStatisticsAfterSchedule),
    ...Object.values(retriggerMeasurement.runtimeStatisticsAfterDispose),
    ...Object.values(retriggerMeasurement.runtimeStatisticsAfterRender),
  ].filter((value): value is number => value !== null && typeof value === 'number')
}

export async function runAudioQualityExpressionEq2BrowserReport(): Promise<AudioQualityExpressionEq2BrowserReport> {
  const [noLoop, continuousLoop, sustainLoop, oneShot, stressMeasurement, retriggerMeasurement] =
    await Promise.all([
      renderTriggerMeasurement('no-loop', AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.noLoop),
      renderTriggerMeasurement(
        'continuous-loop',
        AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.continuousLoop,
      ),
      renderTriggerMeasurement('sustain-loop', AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.sustainLoop),
      renderTriggerMeasurement('one-shot', AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.oneShot),
      renderStressMeasurement(),
      renderRetriggerMeasurement(),
    ])
  const triggerMeasurements = Object.freeze([noLoop, continuousLoop, sustainLoop, oneShot])
  const runtimeMeasurements: readonly AudioQualityExpressionEq2RuntimeMeasurement[] = [
    ...triggerMeasurements,
    stressMeasurement,
    retriggerMeasurement,
  ]
  const expectedSingleVoicePeak =
    AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_AMPLITUDE *
    AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain
  return Object.freeze({
    checks: Object.freeze({
      allMeasurementsFinite: collectFiniteValues(
        triggerMeasurements,
        stressMeasurement,
        retriggerMeasurement,
      ).every(Number.isFinite),
      densePedalHoldLevelStable:
        stressMeasurement.holdLevelRatio >=
          AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.holdLevelRatioMinimum &&
        stressMeasurement.holdLevelRatio <=
          AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.holdLevelRatioMaximum,
      densePedalPeakAtOrBelowMinus3Dbfs:
        stressMeasurement.peakDbfs !== null &&
        stressMeasurement.peakDbfs <=
          AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.headroomPeakThresholdDbfs,
      keyReleaseDoesNotStartFinalRelease: triggerMeasurements.every(
        ({ keyReleaseMaximumAbsoluteError }) =>
          keyReleaseMaximumAbsoluteError <=
          AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.envelopeErrorToleranceFullScale,
      ),
      noClippedFrames: runtimeMeasurements.every(
        ({ clippedFrameCount }) => clippedFrameCount === 0,
      ),
      oneShotContinuesAfterFinalGate:
        oneShot.oneShotPostGatePeakLinear !== null &&
        oneShot.oneShotPostGatePeakLinear >= expectedSingleVoicePeak * 0.9,
      pedalUpReleaseAtOrBelowTolerance: triggerMeasurements.every(
        ({ pedalUpReleaseMaximumAbsoluteError }) =>
          pedalUpReleaseMaximumAbsoluteError === null ||
          pedalUpReleaseMaximumAbsoluteError <=
            AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.envelopeErrorToleranceFullScale,
      ),
      resourcesReleasedAfterDispose: runtimeMeasurements.every(
        ({ runtimeStatisticsAfterDispose }) =>
          isZeroRuntimeStatistics(runtimeStatisticsAfterDispose),
      ),
      resourcesReleasedAfterRender: runtimeMeasurements.every(({ runtimeStatisticsAfterRender }) =>
        isZeroRuntimeStatistics(runtimeStatisticsAfterRender),
      ),
      retriggerOccurrencesRemainIndependent:
        retriggerMeasurement.polyphonyStatisticsAfterSchedule.soundingVoiceCount === 2 &&
        retriggerMeasurement.polyphonyStatisticsAfterSchedule.voiceStealCount === 0 &&
        retriggerMeasurement.retriggerLevelRatio >=
          AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.retriggerLevelRatioMinimum &&
        retriggerMeasurement.retriggerLevelRatio <=
          AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.retriggerLevelRatioMaximum,
      tailsBelowMinus90Dbfs: runtimeMeasurements.every(
        ({ tailPeakDbfs }) =>
          tailPeakDbfs === null ||
          tailPeakDbfs < AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY.tailThresholdDbfs,
      ),
    }),
    expressionPolicy: AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY,
    gatePolicy: AUDIO_QUALITY_EXPRESSION_EQ2_GATE_POLICY,
    retriggerMeasurement,
    stressMeasurement,
    triggerMeasurements,
  })
}
