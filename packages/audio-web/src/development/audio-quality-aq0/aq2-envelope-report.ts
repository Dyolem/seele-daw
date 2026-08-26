import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import {
  AUDIO_QUALITY_AQ2_FAST_RELEASE_START_SECOND,
  AUDIO_QUALITY_AQ2_MUTEX_RELEASE_SECOND,
  AUDIO_QUALITY_AQ2_NORMAL_RELEASE_SECOND,
  AUDIO_QUALITY_AQ2_NOTE_START_SECOND,
  AUDIO_QUALITY_AQ2_PITCH,
  AUDIO_QUALITY_AQ2_SHAPED_ATTACK_SECOND,
  AUDIO_QUALITY_AQ2_SHORT_ATTACK_SECOND,
  AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND,
  AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND,
  createAudioQualityAq2Plan,
} from '#internal/development/audio-quality-aq0/aq2-fixture'
import type { AudioQualityAq2EnvelopeMeasurement } from '#internal/development/audio-quality-aq0/aq2-report-contract'
import {
  measureAudioQualityAq2MaximumEnvelopeError,
  renderAudioQualityAq2,
  withAudioQualityAq2RuntimeMeasurement,
} from '#internal/development/audio-quality-aq0/aq2-report-support'
import { evaluateSampleInstrumentEnvelopeProgress } from '#internal/sample-instrument/voice/envelope'

async function renderShapedEnvelope(): Promise<AudioQualityAq2EnvelopeMeasurement> {
  const releaseEndSecond =
    AUDIO_QUALITY_AQ2_NORMAL_RELEASE_SECOND + AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND
  const rendered = await renderAudioQualityAq2({
    plans: [
      createAudioQualityAq2Plan({
        occurrenceKey: 'aq2-shaped-envelope',
        pitch: AUDIO_QUALITY_AQ2_PITCH.shapedEnvelope,
        releaseSecond: AUDIO_QUALITY_AQ2_NORMAL_RELEASE_SECOND,
      }),
    ],
  })
  const normalizedLevelAtSecond = (second: number): number => {
    const attackElapsed = second - AUDIO_QUALITY_AQ2_NOTE_START_SECOND
    if (attackElapsed < AUDIO_QUALITY_AQ2_SHAPED_ATTACK_SECOND) {
      return evaluateSampleInstrumentEnvelopeProgress(
        attackElapsed / AUDIO_QUALITY_AQ2_SHAPED_ATTACK_SECOND,
        -2,
      )
    }
    if (second < AUDIO_QUALITY_AQ2_NORMAL_RELEASE_SECOND) return 1
    return (
      1 -
      evaluateSampleInstrumentEnvelopeProgress(
        (second - AUDIO_QUALITY_AQ2_NORMAL_RELEASE_SECOND) / AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND,
        2,
      )
    )
  }
  return Object.freeze({
    ...withAudioQualityAq2RuntimeMeasurement(rendered),
    id: 'shaped-envelope',
    maximumAbsoluteError: measureAudioQualityAq2MaximumEnvelopeError(
      rendered,
      AUDIO_QUALITY_AQ2_NOTE_START_SECOND,
      releaseEndSecond,
      normalizedLevelAtSecond,
    ),
  })
}

async function renderShortNote(): Promise<AudioQualityAq2EnvelopeMeasurement> {
  const releaseEndSecond =
    AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND + AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND
  const attackLevelAtRelease = evaluateSampleInstrumentEnvelopeProgress(
    (AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND - AUDIO_QUALITY_AQ2_NOTE_START_SECOND) /
      AUDIO_QUALITY_AQ2_SHORT_ATTACK_SECOND,
    -2,
  )
  const rendered = await renderAudioQualityAq2({
    plans: [
      createAudioQualityAq2Plan({
        occurrenceKey: 'aq2-short-note',
        pitch: AUDIO_QUALITY_AQ2_PITCH.shortNote,
        releaseSecond: AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND,
      }),
    ],
  })
  const normalizedLevelAtSecond = (second: number): number => {
    if (second < AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND) {
      return evaluateSampleInstrumentEnvelopeProgress(
        (second - AUDIO_QUALITY_AQ2_NOTE_START_SECOND) / AUDIO_QUALITY_AQ2_SHORT_ATTACK_SECOND,
        -2,
      )
    }
    return (
      attackLevelAtRelease *
      (1 -
        evaluateSampleInstrumentEnvelopeProgress(
          (second - AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND) /
            AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND,
          2,
        ))
    )
  }
  return Object.freeze({
    ...withAudioQualityAq2RuntimeMeasurement(rendered),
    id: 'short-note',
    maximumAbsoluteError: measureAudioQualityAq2MaximumEnvelopeError(
      rendered,
      AUDIO_QUALITY_AQ2_NOTE_START_SECOND,
      releaseEndSecond,
      normalizedLevelAtSecond,
    ),
  })
}

async function renderFastRelease(): Promise<AudioQualityAq2EnvelopeMeasurement> {
  const releaseEndSecond =
    AUDIO_QUALITY_AQ2_FAST_RELEASE_START_SECOND +
    AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
  const rendered = await renderAudioQualityAq2({
    onScheduled: (runtime, results) => {
      const token = results[0]?.token
      if (token === null || token === undefined) {
        throw new TypeError('AQ2 fast Voice is unavailable')
      }
      runtime.cancel(token, AUDIO_QUALITY_AQ2_FAST_RELEASE_START_SECOND)
    },
    plans: [
      createAudioQualityAq2Plan({
        occurrenceKey: 'aq2-fast-release',
        pitch: AUDIO_QUALITY_AQ2_PITCH.fastRelease,
        releaseSecond: AUDIO_QUALITY_AQ2_MUTEX_RELEASE_SECOND,
      }),
    ],
  })
  const normalizedLevelAtSecond = (second: number): number =>
    second < AUDIO_QUALITY_AQ2_FAST_RELEASE_START_SECOND
      ? 1
      : 1 -
        (second - AUDIO_QUALITY_AQ2_FAST_RELEASE_START_SECOND) /
          AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
  return Object.freeze({
    ...withAudioQualityAq2RuntimeMeasurement(rendered),
    id: 'fast-release',
    maximumAbsoluteError: measureAudioQualityAq2MaximumEnvelopeError(
      rendered,
      AUDIO_QUALITY_AQ2_NOTE_START_SECOND,
      releaseEndSecond,
      normalizedLevelAtSecond,
    ),
  })
}

export async function renderAudioQualityAq2EnvelopeMeasurements(): Promise<
  readonly AudioQualityAq2EnvelopeMeasurement[]
> {
  return Object.freeze(
    await Promise.all([renderShapedEnvelope(), renderShortNote(), renderFastRelease()]),
  )
}
