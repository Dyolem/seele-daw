export const AUDIO_QUALITY_V1A_RENDER_POLICY = Object.freeze({
  defaultFastReleaseSecond: 0.006,
  envelopeCurveSegmentCount: 32,
  id: 'seele.audio-quality-foundation-v1a-aq3',
  maximumInstrumentSoundingVoiceCount: 64,
  maximumRetirementVoiceCount: 16,
  maximumRuntimeSoundingVoiceCount: 128,
  outputCalibrationDb: -12,
  outputCalibrationGain: 10 ** (-12 / 20),
  sourceStopSafetySecond: 0.001,
  velocityExponent: 2,
  velocityFloorDb: -36,
  velocityFloorGain: 10 ** (-36 / 20),
} as const)

export const AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY = Object.freeze({
  foundationPolicyId: AUDIO_QUALITY_V1A_RENDER_POLICY.id,
  id: 'seele.audio-quality-expression-v1-eq1',
  voiceStealLifecyclePriority: Object.freeze({
    'key-held': 2,
    'key-released': 1,
    'release-started': 0,
  }),
} as const)

export type AudioQualityExpressionVoiceLifecycle =
  keyof typeof AUDIO_QUALITY_EXPRESSION_V1_RENDER_POLICY.voiceStealLifecyclePriority

/** Maps the persisted MIDI Velocity fact to the V1A Sample Voice amplitude policy. */
export function calculateAudioQualityV1aVelocityGain(velocity: number): number {
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
    throw new TypeError('MIDI Velocity must be an integer from 1 through 127')
  }
  const normalizedVelocity = velocity / 127
  const { velocityExponent, velocityFloorGain } = AUDIO_QUALITY_V1A_RENDER_POLICY
  return velocityFloorGain + (1 - velocityFloorGain) * normalizedVelocity ** velocityExponent
}
