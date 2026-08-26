import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import {
  AUDIO_QUALITY_AQ3_PROJECT_PLAN_COUNT,
  AUDIO_QUALITY_AQ3_RENDER_DURATION_SECOND,
  AUDIO_QUALITY_AQ3_SOURCE_AMPLITUDE,
  AUDIO_QUALITY_AQ3_STEAL_SECOND,
  AUDIO_QUALITY_AQ3_STRESS_PLAN_COUNT,
  AUDIO_QUALITY_AQ3_TAIL_WINDOW,
  createAudioQualityAq3PreparedResources,
  createAudioQualityAq3ProjectLimitPlans,
  createAudioQualityAq3StressPlans,
} from '#internal/development/audio-quality-aq0/aq3-fixture'
import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
} from '#internal/development/audio-quality-aq0/fixture'
import {
  countAudioQualityClippedFrames,
  measureAudioQualityAq0Channel,
  measureAudioQualityAq0Channels,
} from '#internal/development/audio-quality-aq0/measurement'
import { renderAudioQualityPlans } from '#internal/development/audio-quality-aq0/offline-render'
import type {
  SampleInstrumentVoicePolyphonyStatistics,
  SampleInstrumentVoiceRuntimeStatistics,
} from '#internal/sample-instrument/voice/voice-runtime'

export const AUDIO_QUALITY_AQ3_GATE_POLICY = Object.freeze({
  levelErrorToleranceFullScale: 1e-5,
  retirementErrorToleranceFullScale: 1e-5,
  tailThresholdDbfs: -90,
} as const)

export interface AudioQualityAq3PolyphonyMeasurement {
  readonly clippedFrameCount: number
  readonly droppedPlanCount: number
  readonly expectedSoundingChannelLevel: number
  readonly id: 'project-runtime-limit' | 'ten-thousand-plan-stress'
  readonly planCount: number
  readonly polyphonyStatisticsAfterDispose: SampleInstrumentVoicePolyphonyStatistics
  readonly polyphonyStatisticsAfterRender: SampleInstrumentVoicePolyphonyStatistics
  readonly polyphonyStatisticsAfterSchedule: SampleInstrumentVoicePolyphonyStatistics
  readonly retirementChannelTailPeakDbfs: number | null
  readonly retirementChannelTailPeakLinear: number
  readonly retirementFastReleaseMaximumAbsoluteError: number
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly soundingChannelLevelError: number
  readonly soundingChannelPeakLinear: number
  readonly scheduledPlanCount: number
  readonly tailPeakDbfs: number | null
  readonly tailPeakLinear: number
}

export interface AudioQualityAq3BrowserReport {
  readonly checks: {
    readonly allMeasurementsFinite: boolean
    readonly noClippedFrames: boolean
    readonly projectRuntimeBudgetExact: boolean
    readonly resourcesReleasedAfterDispose: boolean
    readonly resourcesReleasedAfterRender: boolean
    readonly retirementFastReleaseAtOrBelowTolerance: boolean
    readonly retirementTailsBelowMinus90Dbfs: boolean
    readonly soundingLevelsAtOrBelowTolerance: boolean
    readonly stressBudgetExact: boolean
    readonly tailsBelowMinus90Dbfs: boolean
  }
  readonly gatePolicy: typeof AUDIO_QUALITY_AQ3_GATE_POLICY
  readonly measurements: readonly AudioQualityAq3PolyphonyMeasurement[]
}

function isZeroRuntimeStatistics(statistics: SampleInstrumentVoiceRuntimeStatistics): boolean {
  return Object.values(statistics).every((value) => value === 0)
}

function hasZeroPolyphonyOccupancy(statistics: SampleInstrumentVoicePolyphonyStatistics): boolean {
  return statistics.retirementVoiceCount === 0 && statistics.soundingVoiceCount === 0
}

function measureRetirementFastReleaseError(
  channel: Float32Array,
  retirementVoiceCount: number,
): number {
  const expectedStartLevel =
    AUDIO_QUALITY_AQ3_SOURCE_AMPLITUDE *
    AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain *
    retirementVoiceCount
  const fromFrame = audioQualitySecondToFrame(AUDIO_QUALITY_AQ3_STEAL_SECOND) + 1
  const releaseEndSecond =
    AUDIO_QUALITY_AQ3_STEAL_SECOND + AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
  const toFrame = audioQualitySecondToFrame(releaseEndSecond)
  let maximumError = 0
  for (let frame = fromFrame; frame < toFrame; frame += 1) {
    const progress =
      (frame / AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ - AUDIO_QUALITY_AQ3_STEAL_SECOND) /
      AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
    maximumError = Math.max(
      maximumError,
      Math.abs(channel[frame]! - expectedStartLevel * (1 - progress)),
    )
  }
  return maximumError
}

async function renderPolyphonyScenario(
  id: AudioQualityAq3PolyphonyMeasurement['id'],
  plans: ReturnType<
    typeof createAudioQualityAq3ProjectLimitPlans | typeof createAudioQualityAq3StressPlans
  >,
  expectedRetirementVoiceCount: number,
  expectedSoundingVoiceCount: number,
): Promise<AudioQualityAq3PolyphonyMeasurement> {
  const rendered = await renderAudioQualityPlans({
    acceptedScheduleOutcomes: ['scheduled', 'polyphony-dropped'],
    createPreparedResources: createAudioQualityAq3PreparedResources,
    plans,
    renderDurationSecond: AUDIO_QUALITY_AQ3_RENDER_DURATION_SECOND,
  })
  const retirementChannel = rendered.channels[0]!
  const soundingChannel = rendered.channels[1]!
  const scheduledPlanCount = rendered.scheduleResults.filter(
    ({ outcome }) => outcome === 'scheduled',
  ).length
  const droppedPlanCount = rendered.scheduleResults.filter(
    ({ outcome }) => outcome === 'polyphony-dropped',
  ).length
  const expectedSoundingChannelLevel =
    AUDIO_QUALITY_AQ3_SOURCE_AMPLITUDE *
    AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain *
    expectedSoundingVoiceCount
  const sounding = measureAudioQualityAq0Channel(
    soundingChannel,
    audioQualitySecondToFrame(0.08),
    audioQualitySecondToFrame(0.16),
  )
  const retirementTailStartSecond =
    AUDIO_QUALITY_AQ3_STEAL_SECOND +
    AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond +
    128 / AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ
  const retirementTail = measureAudioQualityAq0Channel(
    retirementChannel,
    audioQualitySecondToFrame(retirementTailStartSecond),
    audioQualitySecondToFrame(retirementTailStartSecond + 0.02),
  )
  const tail = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ3_TAIL_WINDOW.fromSecond),
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ3_TAIL_WINDOW.toSecond),
  )
  return Object.freeze({
    clippedFrameCount: countAudioQualityClippedFrames(
      rendered.channels,
      0,
      audioQualitySecondToFrame(AUDIO_QUALITY_AQ3_RENDER_DURATION_SECOND),
    ),
    droppedPlanCount,
    expectedSoundingChannelLevel,
    id,
    planCount: plans.length,
    polyphonyStatisticsAfterDispose: rendered.polyphonyStatisticsAfterDispose,
    polyphonyStatisticsAfterRender: rendered.polyphonyStatisticsAfterRender,
    polyphonyStatisticsAfterSchedule: rendered.polyphonyStatisticsAfterSchedule,
    retirementChannelTailPeakDbfs: retirementTail.peakDbfs,
    retirementChannelTailPeakLinear: retirementTail.peakLinear,
    retirementFastReleaseMaximumAbsoluteError: measureRetirementFastReleaseError(
      retirementChannel,
      expectedRetirementVoiceCount,
    ),
    runtimeStatisticsAfterDispose: rendered.runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender: rendered.runtimeStatisticsAfterRender,
    soundingChannelLevelError: Math.abs(sounding.peakLinear - expectedSoundingChannelLevel),
    soundingChannelPeakLinear: sounding.peakLinear,
    scheduledPlanCount,
    tailPeakDbfs: tail.peakDbfs,
    tailPeakLinear: tail.peakLinear,
  })
}

function collectFiniteValues(
  measurements: readonly AudioQualityAq3PolyphonyMeasurement[],
): readonly number[] {
  return measurements
    .flatMap((measurement) => [
      measurement.clippedFrameCount,
      measurement.droppedPlanCount,
      measurement.expectedSoundingChannelLevel,
      measurement.planCount,
      measurement.retirementChannelTailPeakDbfs,
      measurement.retirementChannelTailPeakLinear,
      measurement.retirementFastReleaseMaximumAbsoluteError,
      measurement.soundingChannelLevelError,
      measurement.soundingChannelPeakLinear,
      measurement.scheduledPlanCount,
      measurement.tailPeakDbfs,
      measurement.tailPeakLinear,
      ...Object.values(measurement.polyphonyStatisticsAfterDispose),
      ...Object.values(measurement.polyphonyStatisticsAfterRender),
      ...Object.values(measurement.polyphonyStatisticsAfterSchedule),
      ...Object.values(measurement.runtimeStatisticsAfterDispose),
      ...Object.values(measurement.runtimeStatisticsAfterRender),
    ])
    .filter((value): value is number => value !== null && typeof value === 'number')
}

export async function runAudioQualityAq3BrowserReport(): Promise<AudioQualityAq3BrowserReport> {
  const [stress, projectRuntime] = await Promise.all([
    renderPolyphonyScenario(
      'ten-thousand-plan-stress',
      createAudioQualityAq3StressPlans(),
      AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRetirementVoiceCount,
      AUDIO_QUALITY_V1A_RENDER_POLICY.maximumInstrumentSoundingVoiceCount,
    ),
    renderPolyphonyScenario(
      'project-runtime-limit',
      createAudioQualityAq3ProjectLimitPlans(),
      1,
      AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRuntimeSoundingVoiceCount,
    ),
  ])
  const measurements = Object.freeze([stress, projectRuntime])
  return Object.freeze({
    checks: Object.freeze({
      allMeasurementsFinite: collectFiniteValues(measurements).every(Number.isFinite),
      noClippedFrames: measurements.every(({ clippedFrameCount }) => clippedFrameCount === 0),
      projectRuntimeBudgetExact:
        projectRuntime.planCount === AUDIO_QUALITY_AQ3_PROJECT_PLAN_COUNT &&
        projectRuntime.scheduledPlanCount === AUDIO_QUALITY_AQ3_PROJECT_PLAN_COUNT &&
        projectRuntime.droppedPlanCount === 0 &&
        projectRuntime.polyphonyStatisticsAfterSchedule.soundingVoiceCount ===
          AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRuntimeSoundingVoiceCount &&
        projectRuntime.polyphonyStatisticsAfterSchedule.retirementVoiceCount === 1 &&
        projectRuntime.polyphonyStatisticsAfterSchedule.voiceStealCount === 1,
      resourcesReleasedAfterDispose: measurements.every(
        ({ polyphonyStatisticsAfterDispose, runtimeStatisticsAfterDispose }) =>
          hasZeroPolyphonyOccupancy(polyphonyStatisticsAfterDispose) &&
          isZeroRuntimeStatistics(runtimeStatisticsAfterDispose),
      ),
      resourcesReleasedAfterRender: measurements.every(
        ({ polyphonyStatisticsAfterRender, runtimeStatisticsAfterRender }) =>
          hasZeroPolyphonyOccupancy(polyphonyStatisticsAfterRender) &&
          isZeroRuntimeStatistics(runtimeStatisticsAfterRender),
      ),
      retirementFastReleaseAtOrBelowTolerance: measurements.every(
        ({ retirementFastReleaseMaximumAbsoluteError }) =>
          retirementFastReleaseMaximumAbsoluteError <=
          AUDIO_QUALITY_AQ3_GATE_POLICY.retirementErrorToleranceFullScale,
      ),
      retirementTailsBelowMinus90Dbfs: measurements.every(
        ({ retirementChannelTailPeakDbfs }) =>
          retirementChannelTailPeakDbfs === null ||
          retirementChannelTailPeakDbfs < AUDIO_QUALITY_AQ3_GATE_POLICY.tailThresholdDbfs,
      ),
      soundingLevelsAtOrBelowTolerance: measurements.every(
        ({ soundingChannelLevelError }) =>
          soundingChannelLevelError <= AUDIO_QUALITY_AQ3_GATE_POLICY.levelErrorToleranceFullScale,
      ),
      stressBudgetExact:
        stress.planCount === AUDIO_QUALITY_AQ3_STRESS_PLAN_COUNT &&
        stress.scheduledPlanCount ===
          AUDIO_QUALITY_V1A_RENDER_POLICY.maximumInstrumentSoundingVoiceCount +
            AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRetirementVoiceCount &&
        stress.droppedPlanCount ===
          AUDIO_QUALITY_AQ3_STRESS_PLAN_COUNT - stress.scheduledPlanCount &&
        stress.polyphonyStatisticsAfterSchedule.soundingVoiceCount ===
          AUDIO_QUALITY_V1A_RENDER_POLICY.maximumInstrumentSoundingVoiceCount &&
        stress.polyphonyStatisticsAfterSchedule.retirementVoiceCount ===
          AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRetirementVoiceCount &&
        stress.polyphonyStatisticsAfterSchedule.voiceStealCount ===
          AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRetirementVoiceCount &&
        stress.polyphonyStatisticsAfterSchedule.polyphonyDropCount === stress.droppedPlanCount,
      tailsBelowMinus90Dbfs: measurements.every(
        ({ tailPeakDbfs }) =>
          tailPeakDbfs === null || tailPeakDbfs < AUDIO_QUALITY_AQ3_GATE_POLICY.tailThresholdDbfs,
      ),
    }),
    gatePolicy: AUDIO_QUALITY_AQ3_GATE_POLICY,
    measurements,
  })
}
