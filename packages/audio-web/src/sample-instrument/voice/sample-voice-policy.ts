/**
 * How sample voices turn velocity into gain, calibrate the output, release, and share the
 * polyphony limits. These values are the audible contract the AQ0 report measures.
 */
export const SAMPLE_VOICE_POLICY = Object.freeze({
  defaultFastReleaseSecond: 0.006,
  envelopeCurveSegmentCount: 32,
  maximumInstrumentSoundingVoiceCount: 64,
  maximumRetirementVoiceCount: 16,
  maximumRuntimeSoundingVoiceCount: 128,
  outputCalibrationDb: -12,
  outputCalibrationGain: 10 ** (-12 / 20),
  sourceStopSafetySecond: 0.001,
  /** Lower is stolen first: a voice already releasing, then one only the pedal holds. */
  stealPriorityByLifecycle: Object.freeze({
    'key-held': 2,
    'key-released': 1,
    'release-started': 0,
  }),
  velocityExponent: 2,
  velocityFloorDb: -36,
  velocityFloorGain: 10 ** (-36 / 20),
} as const)

export type SampleVoiceLifecycle = keyof typeof SAMPLE_VOICE_POLICY.stealPriorityByLifecycle

/** Maps a MIDI Velocity (1–127) to voice amplitude: squared, above a -36 dB floor. */
export function velocityGain(velocity: number): number {
  const normalizedVelocity = velocity / 127
  const { velocityExponent, velocityFloorGain } = SAMPLE_VOICE_POLICY
  return velocityFloorGain + (1 - velocityFloorGain) * normalizedVelocity ** velocityExponent
}
