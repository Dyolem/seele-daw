export const AUDIO_QUALITY_V1A_RENDER_POLICY = Object.freeze({
  defaultFastReleaseSecond: 0.006,
  envelopeCurveSegmentCount: 32,
  id: 'seele.audio-quality-foundation-v1a-aq2',
  outputCalibrationDb: -12,
  outputCalibrationGain: 10 ** (-12 / 20),
  sourceStopSafetySecond: 0.001,
  velocityExponent: 2,
  velocityFloorDb: -36,
  velocityFloorGain: 10 ** (-36 / 20),
} as const)

/** Maps the persisted MIDI Velocity fact to the V1A Sample Voice amplitude policy. */
export function calculateAudioQualityV1aVelocityGain(velocity: number): number {
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
    throw new TypeError('MIDI Velocity must be an integer from 1 through 127')
  }
  const normalizedVelocity = velocity / 127
  const { velocityExponent, velocityFloorGain } = AUDIO_QUALITY_V1A_RENDER_POLICY
  return velocityFloorGain + (1 - velocityFloorGain) * normalizedVelocity ** velocityExponent
}
