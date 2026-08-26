import { renderAudioQualityAq2EnvelopeMeasurements } from '#internal/development/audio-quality-aq0/aq2-envelope-report'
import { renderAudioQualityAq2LoopTriggerMeasurements } from '#internal/development/audio-quality-aq0/aq2-loop-trigger-report'
import {
  AUDIO_QUALITY_AQ2_GATE_POLICY,
  type AudioQualityAq2BrowserReport,
  type AudioQualityAq2EnvelopeMeasurement,
  type AudioQualityAq2LoopMeasurement,
  type AudioQualityAq2MutexMeasurement,
  type AudioQualityAq2OneShotMeasurement,
  type AudioQualityAq2RuntimeMeasurement,
} from '#internal/development/audio-quality-aq0/aq2-report-contract'
import {
  AUDIO_QUALITY_AQ2_CENTERED_CONSTANT_LEVEL,
  AUDIO_QUALITY_AQ2_HARD_PANNED_CONSTANT_LEVEL,
  isZeroAudioQualityAq2Statistics,
} from '#internal/development/audio-quality-aq0/aq2-report-support'

export type {
  AudioQualityAq2BrowserReport,
  AudioQualityAq2EnvelopeMeasurement,
  AudioQualityAq2LoopMeasurement,
  AudioQualityAq2MutexMeasurement,
  AudioQualityAq2OneShotMeasurement,
} from '#internal/development/audio-quality-aq0/aq2-report-contract'

function collectFiniteValues(
  envelopeMeasurements: readonly AudioQualityAq2EnvelopeMeasurement[],
  loopMeasurements: readonly AudioQualityAq2LoopMeasurement[],
  oneShotMeasurement: AudioQualityAq2OneShotMeasurement,
  mutexMeasurement: AudioQualityAq2MutexMeasurement,
): readonly number[] {
  const runtimeMeasurements: readonly AudioQualityAq2RuntimeMeasurement[] = [
    ...envelopeMeasurements,
    ...loopMeasurements,
    oneShotMeasurement,
    mutexMeasurement,
  ]
  return [
    ...envelopeMeasurements.map(({ maximumAbsoluteError }) => maximumAbsoluteError),
    ...loopMeasurements.flatMap(({ maximumSeamError, steadyPeakLinear, transitionCount }) => [
      maximumSeamError,
      steadyPeakLinear,
      transitionCount,
    ]),
    oneShotMeasurement.levelAfterNoteOffPeakLinear,
    mutexMeasurement.newVoiceChannelPeakLinear,
    mutexMeasurement.oldVoiceChannelTailPeakDbfs,
    mutexMeasurement.oldVoiceChannelTailPeakLinear,
    mutexMeasurement.oldVoiceFastReleaseMaximumAbsoluteError,
    ...runtimeMeasurements.flatMap((measurement) => [
      measurement.tailPeakDbfs,
      measurement.tailPeakLinear,
      ...Object.values(measurement.runtimeStatisticsAfterDispose),
      ...Object.values(measurement.runtimeStatisticsAfterRender),
    ]),
  ].filter((value): value is number => value !== null && typeof value === 'number')
}

export async function runAudioQualityAq2BrowserReport(): Promise<AudioQualityAq2BrowserReport> {
  const [envelopeMeasurements, loopTriggerMeasurements] = await Promise.all([
    renderAudioQualityAq2EnvelopeMeasurements(),
    renderAudioQualityAq2LoopTriggerMeasurements(),
  ])
  const { loopMeasurements, mutexMeasurement, oneShotMeasurement } = loopTriggerMeasurements
  const runtimeMeasurements: readonly AudioQualityAq2RuntimeMeasurement[] = [
    ...envelopeMeasurements,
    ...loopMeasurements,
    oneShotMeasurement,
    mutexMeasurement,
  ]
  return Object.freeze({
    checks: Object.freeze({
      allMeasurementsFinite: collectFiniteValues(
        envelopeMeasurements,
        loopMeasurements,
        oneShotMeasurement,
        mutexMeasurement,
      ).every(Number.isFinite),
      envelopeErrorsAtOrBelowTolerance: envelopeMeasurements.every(
        ({ maximumAbsoluteError }) =>
          maximumAbsoluteError <= AUDIO_QUALITY_AQ2_GATE_POLICY.envelopeErrorToleranceFullScale,
      ),
      loopSeamsAtOrBelowTolerance: loopMeasurements.every(
        ({ maximumSeamError }) =>
          maximumSeamError <= AUDIO_QUALITY_AQ2_GATE_POLICY.loopSeamErrorToleranceFullScale,
      ),
      loopSignalsAudible: loopMeasurements.every(
        ({ steadyPeakLinear }) =>
          steadyPeakLinear >= AUDIO_QUALITY_AQ2_CENTERED_CONSTANT_LEVEL * 0.9,
      ),
      mutexFastReleaseAtOrBelowTolerance:
        mutexMeasurement.oldVoiceFastReleaseMaximumAbsoluteError <=
          AUDIO_QUALITY_AQ2_GATE_POLICY.envelopeErrorToleranceFullScale &&
        (mutexMeasurement.oldVoiceChannelTailPeakDbfs === null ||
          mutexMeasurement.oldVoiceChannelTailPeakDbfs <
            AUDIO_QUALITY_AQ2_GATE_POLICY.tailThresholdDbfs),
      mutexRoutesNewVoiceAfterChoke:
        mutexMeasurement.newVoiceChannelPeakLinear >=
        AUDIO_QUALITY_AQ2_HARD_PANNED_CONSTANT_LEVEL * 0.9,
      oneShotContinuesAfterNoteOff:
        oneShotMeasurement.levelAfterNoteOffPeakLinear >=
        AUDIO_QUALITY_AQ2_CENTERED_CONSTANT_LEVEL * 0.9,
      resourcesReleasedAfterDispose: runtimeMeasurements.every((measurement) =>
        isZeroAudioQualityAq2Statistics(measurement.runtimeStatisticsAfterDispose),
      ),
      resourcesReleasedAfterRender: runtimeMeasurements.every((measurement) =>
        isZeroAudioQualityAq2Statistics(measurement.runtimeStatisticsAfterRender),
      ),
      tailsBelowMinus90Dbfs: runtimeMeasurements.every(
        ({ tailPeakDbfs }) =>
          tailPeakDbfs === null || tailPeakDbfs < AUDIO_QUALITY_AQ2_GATE_POLICY.tailThresholdDbfs,
      ),
    }),
    envelopeMeasurements,
    gatePolicy: AUDIO_QUALITY_AQ2_GATE_POLICY,
    loopMeasurements,
    mutexMeasurement,
    oneShotMeasurement,
  })
}
