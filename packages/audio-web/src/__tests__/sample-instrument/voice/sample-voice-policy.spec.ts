import { describe, expect, it } from 'vitest'

import {
  SAMPLE_VOICE_POLICY,
  velocityGain,
} from '#internal/sample-instrument/voice/sample-voice-policy'

describe('sample voice policy', () => {
  it('fixes the gain, envelope, polyphony and voice-stealing values', () => {
    expect(SAMPLE_VOICE_POLICY).toEqual({
      defaultFastReleaseSecond: 0.006,
      envelopeCurveSegmentCount: 32,
      maximumInstrumentSoundingVoiceCount: 64,
      maximumRetirementVoiceCount: 16,
      maximumRuntimeSoundingVoiceCount: 128,
      outputCalibrationDb: -12,
      outputCalibrationGain: 0.251188643150958,
      sourceStopSafetySecond: 0.001,
      stealPriorityByLifecycle: {
        'key-held': 2,
        'key-released': 1,
        'release-started': 0,
      },
      velocityExponent: 2,
      velocityFloorDb: -36,
      velocityFloorGain: 0.015848931924611134,
    })
    expect(Object.isFrozen(SAMPLE_VOICE_POLICY)).toBe(true)
    expect(Object.isFrozen(SAMPLE_VOICE_POLICY.stealPriorityByLifecycle)).toBe(true)
  })

  it.each([
    [1, 0.015909949412866786, -35.96662402460167],
    [32, 0.07833083989839737, -22.121344334644164],
    [64, 0.26577656381975606, -11.50966635593953],
    [96, 0.5781861036886872, -4.7586470102718],
    [127, 1, 0],
  ] as const)('maps Velocity %i to its amplitude anchor', (velocity, gain, db) => {
    const actualGain = velocityGain(velocity)

    expect(actualGain).toBeCloseTo(gain, 14)
    expect(20 * Math.log10(actualGain)).toBeCloseTo(db, 10)
  })

  it('is strictly monotonic across the complete MIDI Velocity domain', () => {
    let previous = 0
    for (let velocity = 1; velocity <= 127; velocity += 1) {
      const gain = velocityGain(velocity)
      expect(gain).toBeGreaterThan(previous)
      expect(gain).toBeLessThanOrEqual(1)
      previous = gain
    }
  })
})
