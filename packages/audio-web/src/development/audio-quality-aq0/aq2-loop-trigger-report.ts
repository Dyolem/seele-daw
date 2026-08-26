import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import {
  AUDIO_QUALITY_AQ2_CONTINUOUS_RELEASE_SECOND,
  AUDIO_QUALITY_AQ2_LOOP_END_SECOND,
  AUDIO_QUALITY_AQ2_LOOP_START_SECOND,
  AUDIO_QUALITY_AQ2_MUTEX_NEW_START_SECOND,
  AUDIO_QUALITY_AQ2_MUTEX_RELEASE_SECOND,
  AUDIO_QUALITY_AQ2_NOTE_START_SECOND,
  AUDIO_QUALITY_AQ2_ONE_SHOT_RELEASE_SECOND,
  AUDIO_QUALITY_AQ2_PITCH,
  AUDIO_QUALITY_AQ2_SUSTAIN_RELEASE_SECOND,
  createAudioQualityAq2Plan,
} from '#internal/development/audio-quality-aq0/aq2-fixture'
import {
  AUDIO_QUALITY_AQ2_GATE_POLICY,
  type AudioQualityAq2LoopMeasurement,
  type AudioQualityAq2MutexMeasurement,
  type AudioQualityAq2OneShotMeasurement,
} from '#internal/development/audio-quality-aq0/aq2-report-contract'
import {
  AUDIO_QUALITY_AQ2_HARD_PANNED_CONSTANT_LEVEL,
  renderAudioQualityAq2,
  withAudioQualityAq2RuntimeMeasurement,
} from '#internal/development/audio-quality-aq0/aq2-report-support'
import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
} from '#internal/development/audio-quality-aq0/fixture'
import {
  measureAudioQualityAq0Channel,
  measureAudioQualityAq0Channels,
} from '#internal/development/audio-quality-aq0/measurement'
import type { AudioQualityOfflineRenderResult } from '#internal/development/audio-quality-aq0/offline-render'

export interface AudioQualityAq2LoopTriggerMeasurements {
  readonly loopMeasurements: readonly AudioQualityAq2LoopMeasurement[]
  readonly mutexMeasurement: AudioQualityAq2MutexMeasurement
  readonly oneShotMeasurement: AudioQualityAq2OneShotMeasurement
}

function createLoopTransitionSeconds(releaseSecond: number): readonly number[] {
  const transitions: number[] = []
  const loopDurationSecond = AUDIO_QUALITY_AQ2_LOOP_END_SECOND - AUDIO_QUALITY_AQ2_LOOP_START_SECOND
  for (
    let second = AUDIO_QUALITY_AQ2_NOTE_START_SECOND + AUDIO_QUALITY_AQ2_LOOP_END_SECOND;
    second <= releaseSecond + 1e-9;
    second += loopDurationSecond
  ) {
    transitions.push(second)
  }
  return Object.freeze(transitions)
}

function measureMaximumLoopSeamError(
  rendered: AudioQualityOfflineRenderResult,
  transitionSeconds: readonly number[],
): number {
  // A first-pass loop-start neighborhood is the deterministic reference for every later wrap.
  const referenceFrame = audioQualitySecondToFrame(
    AUDIO_QUALITY_AQ2_NOTE_START_SECOND + AUDIO_QUALITY_AQ2_LOOP_START_SECOND,
  )
  let maximumError = 0
  for (const channel of rendered.channels) {
    for (const transitionSecond of transitionSeconds) {
      const transitionFrame = audioQualitySecondToFrame(transitionSecond)
      for (let offset = -2; offset <= 2; offset += 1) {
        maximumError = Math.max(
          maximumError,
          Math.abs(channel[transitionFrame + offset]! - channel[referenceFrame + offset]!),
        )
      }
    }
  }
  return maximumError
}

async function renderLoop(
  id: AudioQualityAq2LoopMeasurement['id'],
  pitch: number,
  releaseSecond: number,
): Promise<AudioQualityAq2LoopMeasurement> {
  const rendered = await renderAudioQualityAq2({
    plans: [createAudioQualityAq2Plan({ occurrenceKey: `aq2-${id}`, pitch, releaseSecond })],
  })
  const transitionSeconds = createLoopTransitionSeconds(releaseSecond)
  const steady = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ2_NOTE_START_SECOND + 0.05),
    audioQualitySecondToFrame(releaseSecond - 0.01),
  )
  return Object.freeze({
    ...withAudioQualityAq2RuntimeMeasurement(rendered),
    id,
    maximumSeamError: measureMaximumLoopSeamError(rendered, transitionSeconds),
    steadyPeakLinear: steady.peakLinear,
    transitionCount: transitionSeconds.length,
  })
}

async function renderOneShot(): Promise<AudioQualityAq2OneShotMeasurement> {
  const rendered = await renderAudioQualityAq2({
    plans: [
      createAudioQualityAq2Plan({
        occurrenceKey: 'aq2-one-shot',
        pitch: AUDIO_QUALITY_AQ2_PITCH.oneShot,
        releaseSecond: AUDIO_QUALITY_AQ2_ONE_SHOT_RELEASE_SECOND,
      }),
    ],
  })
  const afterNoteOff = measureAudioQualityAq0Channels(
    rendered.channels,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ2_ONE_SHOT_RELEASE_SECOND + 0.02),
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ2_ONE_SHOT_RELEASE_SECOND + 0.06),
  )
  return Object.freeze({
    ...withAudioQualityAq2RuntimeMeasurement(rendered),
    levelAfterNoteOffPeakLinear: afterNoteOff.peakLinear,
  })
}

async function renderMutex(): Promise<AudioQualityAq2MutexMeasurement> {
  const rendered = await renderAudioQualityAq2({
    plans: [
      createAudioQualityAq2Plan({
        occurrenceKey: 'aq2-mutex-old',
        pan: -1,
        pitch: AUDIO_QUALITY_AQ2_PITCH.mutexOld,
        releaseSecond: AUDIO_QUALITY_AQ2_MUTEX_RELEASE_SECOND,
      }),
      createAudioQualityAq2Plan({
        occurrenceKey: 'aq2-mutex-new',
        pan: 1,
        pitch: AUDIO_QUALITY_AQ2_PITCH.mutexNew,
        releaseSecond: AUDIO_QUALITY_AQ2_MUTEX_RELEASE_SECOND,
        startSecond: AUDIO_QUALITY_AQ2_MUTEX_NEW_START_SECOND,
      }),
    ],
  })
  const left = rendered.channels[0]!
  const right = rendered.channels[1]!
  const releaseEndSecond =
    AUDIO_QUALITY_AQ2_MUTEX_NEW_START_SECOND +
    AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
  let oldVoiceFastReleaseMaximumAbsoluteError = 0
  for (
    let frame = audioQualitySecondToFrame(AUDIO_QUALITY_AQ2_MUTEX_NEW_START_SECOND) + 1;
    frame < audioQualitySecondToFrame(releaseEndSecond);
    frame += 1
  ) {
    const progress =
      (frame / AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ - AUDIO_QUALITY_AQ2_MUTEX_NEW_START_SECOND) /
      AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
    oldVoiceFastReleaseMaximumAbsoluteError = Math.max(
      oldVoiceFastReleaseMaximumAbsoluteError,
      Math.abs(left[frame]! - AUDIO_QUALITY_AQ2_HARD_PANNED_CONSTANT_LEVEL * (1 - progress)),
    )
  }
  const postReleaseStartSecond =
    releaseEndSecond +
    AUDIO_QUALITY_AQ2_GATE_POLICY.renderQuantumFrameCount / AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ
  const oldVoiceTail = measureAudioQualityAq0Channel(
    left,
    audioQualitySecondToFrame(postReleaseStartSecond),
    audioQualitySecondToFrame(postReleaseStartSecond + 0.02),
  )
  const newVoice = measureAudioQualityAq0Channel(
    right,
    audioQualitySecondToFrame(postReleaseStartSecond),
    audioQualitySecondToFrame(postReleaseStartSecond + 0.02),
  )
  return Object.freeze({
    ...withAudioQualityAq2RuntimeMeasurement(rendered),
    newVoiceChannelPeakLinear: newVoice.peakLinear,
    oldVoiceChannelTailPeakDbfs: oldVoiceTail.peakDbfs,
    oldVoiceChannelTailPeakLinear: oldVoiceTail.peakLinear,
    oldVoiceFastReleaseMaximumAbsoluteError,
  })
}

export async function renderAudioQualityAq2LoopTriggerMeasurements(): Promise<AudioQualityAq2LoopTriggerMeasurements> {
  const [continuousLoop, sustainLoop, oneShotMeasurement, mutexMeasurement] = await Promise.all([
    renderLoop(
      'continuous-loop',
      AUDIO_QUALITY_AQ2_PITCH.continuousLoop,
      AUDIO_QUALITY_AQ2_CONTINUOUS_RELEASE_SECOND,
    ),
    renderLoop(
      'sustain-loop',
      AUDIO_QUALITY_AQ2_PITCH.sustainLoop,
      AUDIO_QUALITY_AQ2_SUSTAIN_RELEASE_SECOND,
    ),
    renderOneShot(),
    renderMutex(),
  ])
  return Object.freeze({
    loopMeasurements: Object.freeze([continuousLoop, sustainLoop]),
    mutexMeasurement,
    oneShotMeasurement,
  })
}
