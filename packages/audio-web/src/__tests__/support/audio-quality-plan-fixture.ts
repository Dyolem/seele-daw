import { parseSoundbankId, type ScheduledSampleVoicePlan } from '@seele-daw/playback'

export const AUDIO_QUALITY_FIXTURE_SOUNDBANK_ID = parseSoundbankId('audio-quality-aq0-fixture')
export const AUDIO_QUALITY_VELOCITY_VECTOR = Object.freeze([1, 32, 64, 96, 127] as const)
export const AUDIO_QUALITY_NOTE_LENGTH_VECTOR_SECOND = Object.freeze([0.08, 0.25, 1, 4] as const)
export const AUDIO_QUALITY_TRIAD_PITCH_VECTOR = Object.freeze([60, 64, 67] as const)
export const AUDIO_QUALITY_DENSE_CHORD_PITCH_VECTOR = Object.freeze([
  48, 52, 55, 59, 62, 65, 67, 71, 74, 77,
] as const)

export type AudioQualityVoicePlanScenarioId =
  | 'dense-chord'
  | 'note-length'
  | 'retrigger'
  | 'triad'
  | 'trigger-and-loop'
  | 'velocity-response'

export interface AudioQualityVoicePlanScenario {
  readonly id: AudioQualityVoicePlanScenarioId
  readonly plans: readonly ScheduledSampleVoicePlan[]
}

export interface CreateAudioQualityVoicePlanOptions {
  readonly durationSecond?: number
  readonly occurrenceKey: string
  readonly pitch?: number
  readonly startSecond?: number
  readonly velocity?: number
}

export function createAudioQualityVoicePlan(
  options: CreateAudioQualityVoicePlanOptions,
): ScheduledSampleVoicePlan {
  const startSecond = options.startSecond ?? 1
  const durationSecond = options.durationSecond ?? 0.25
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: 'audio-quality-fixture-device',
    kind: 'sample-voice',
    keyReleasePlaybackClockSecond: startSecond + durationSecond,
    masterGain: 1,
    occurrenceKey: options.occurrenceKey,
    pan: 0,
    pitch: options.pitch ?? 60,
    releasePlaybackClockSecond: startSecond + durationSecond,
    soundbankId: AUDIO_QUALITY_FIXTURE_SOUNDBANK_ID,
    startPlaybackClockSecond: startSecond,
    timing: 'on-time',
    trackGain: 1,
    trackId: 'audio-quality-fixture-track',
    velocity: options.velocity ?? 96,
  }) as unknown as ScheduledSampleVoicePlan
}

function freezeScenario(
  id: AudioQualityVoicePlanScenarioId,
  plans: readonly ScheduledSampleVoicePlan[],
): AudioQualityVoicePlanScenario {
  return Object.freeze({ id, plans: Object.freeze([...plans]) })
}

export function createAudioQualityVoicePlanScenarios(): readonly AudioQualityVoicePlanScenario[] {
  const velocityResponse = AUDIO_QUALITY_VELOCITY_VECTOR.map((velocity, index) =>
    createAudioQualityVoicePlan({
      occurrenceKey: `velocity-${velocity}`,
      startSecond: 1 + index * 0.5,
      velocity,
    }),
  )
  const noteLength = AUDIO_QUALITY_NOTE_LENGTH_VECTOR_SECOND.map((durationSecond, index) =>
    createAudioQualityVoicePlan({
      durationSecond,
      occurrenceKey: `duration-${String(durationSecond).replace('.', '-')}`,
      startSecond: 5 + index * 5,
    }),
  )
  const triad = AUDIO_QUALITY_TRIAD_PITCH_VECTOR.map((pitch) =>
    createAudioQualityVoicePlan({ occurrenceKey: `triad-${pitch}`, pitch, startSecond: 30 }),
  )
  const denseChord = AUDIO_QUALITY_DENSE_CHORD_PITCH_VECTOR.map((pitch) =>
    createAudioQualityVoicePlan({ occurrenceKey: `dense-${pitch}`, pitch, startSecond: 35 }),
  )
  const retrigger = Array.from({ length: 5 }, (_, index) =>
    createAudioQualityVoicePlan({
      occurrenceKey: `retrigger-${index + 1}`,
      startSecond: 40 + index * 0.04,
    }),
  )
  const triggerAndLoop = [
    createAudioQualityVoicePlan({ occurrenceKey: 'loop-none', pitch: 60, startSecond: 45 }),
    createAudioQualityVoicePlan({ occurrenceKey: 'loop-continuous', pitch: 61, startSecond: 46 }),
    createAudioQualityVoicePlan({ occurrenceKey: 'loop-sustain', pitch: 62, startSecond: 47 }),
    createAudioQualityVoicePlan({ occurrenceKey: 'one-shot', pitch: 63, startSecond: 48 }),
    createAudioQualityVoicePlan({ occurrenceKey: 'mutex-old', pitch: 64, startSecond: 49 }),
    createAudioQualityVoicePlan({ occurrenceKey: 'mutex-new', pitch: 65, startSecond: 49.1 }),
  ]

  return Object.freeze([
    freezeScenario('velocity-response', velocityResponse),
    freezeScenario('note-length', noteLength),
    freezeScenario('triad', triad),
    freezeScenario('dense-chord', denseChord),
    freezeScenario('retrigger', retrigger),
    freezeScenario('trigger-and-loop', triggerAndLoop),
  ])
}
