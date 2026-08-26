import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import {
  AUDIO_QUALITY_AQ2_RENDER_DURATION_SECOND,
  AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE,
  AUDIO_QUALITY_AQ2_TAIL_WINDOW,
  createAudioQualityAq2PreparedResources,
} from '#internal/development/audio-quality-aq0/aq2-fixture'
import type { AudioQualityAq2RuntimeMeasurement } from '#internal/development/audio-quality-aq0/aq2-report-contract'
import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
} from '#internal/development/audio-quality-aq0/fixture'
import { measureAudioQualityAq0Channels } from '#internal/development/audio-quality-aq0/measurement'
import {
  renderAudioQualityPlans,
  type AudioQualityOfflineRenderOptions,
  type AudioQualityOfflineRenderResult,
} from '#internal/development/audio-quality-aq0/offline-render'
import type { SampleInstrumentVoiceRuntimeStatistics } from '#internal/sample-instrument/voice/voice-runtime'

export const AUDIO_QUALITY_AQ2_CENTERED_CONSTANT_LEVEL =
  AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE *
  AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain *
  Math.SQRT1_2

export const AUDIO_QUALITY_AQ2_HARD_PANNED_CONSTANT_LEVEL =
  AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE * AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain

export function isZeroAudioQualityAq2Statistics(
  statistics: SampleInstrumentVoiceRuntimeStatistics,
): boolean {
  return (
    statistics.activeVoiceCount === 0 &&
    statistics.connectedNodeCount === 0 &&
    statistics.endedListenerCount === 0 &&
    statistics.sourceNodeCount === 0
  )
}

export function withAudioQualityAq2RuntimeMeasurement(
  rendered: AudioQualityOfflineRenderResult,
): AudioQualityAq2RuntimeMeasurement {
  const tail = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ2_TAIL_WINDOW.fromSecond),
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ2_TAIL_WINDOW.toSecond),
  )
  return Object.freeze({
    runtimeStatisticsAfterDispose: rendered.runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender: rendered.runtimeStatisticsAfterRender,
    tailPeakDbfs: tail.peakDbfs,
    tailPeakLinear: tail.peakLinear,
  })
}

export function renderAudioQualityAq2(
  options: Omit<
    AudioQualityOfflineRenderOptions,
    'createPreparedResources' | 'renderDurationSecond'
  >,
): Promise<AudioQualityOfflineRenderResult> {
  return renderAudioQualityPlans({
    ...options,
    createPreparedResources: createAudioQualityAq2PreparedResources,
    renderDurationSecond: AUDIO_QUALITY_AQ2_RENDER_DURATION_SECOND,
  })
}

export function measureAudioQualityAq2MaximumEnvelopeError(
  rendered: AudioQualityOfflineRenderResult,
  fromSecond: number,
  toSecond: number,
  normalizedLevelAtSecond: (second: number) => number,
): number {
  // The transition starts from the held value on its boundary frame; compare scheduled ramp frames.
  const fromFrame = audioQualitySecondToFrame(fromSecond) + 1
  const toFrame = audioQualitySecondToFrame(toSecond)
  let maximumError = 0
  for (const channel of rendered.channels) {
    for (let frame = fromFrame; frame < toFrame; frame += 1) {
      maximumError = Math.max(
        maximumError,
        Math.abs(
          channel[frame]! -
            AUDIO_QUALITY_AQ2_CENTERED_CONSTANT_LEVEL *
              normalizedLevelAtSecond(frame / AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ),
        ),
      )
    }
  }
  return maximumError
}
