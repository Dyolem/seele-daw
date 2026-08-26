import { describe, expect, it } from 'vitest'

import {
  AUDIO_QUALITY_V1A_RENDER_POLICY,
  calculateAudioQualityV1aVelocityGain,
} from '#internal/audio-quality/render-policy'

describe('Audio Quality Foundation V1A render policy', () => {
  it('freezes the approved AQ1 Velocity and output calibration parameters', () => {
    expect(AUDIO_QUALITY_V1A_RENDER_POLICY).toEqual({
      id: 'seele.audio-quality-foundation-v1a-aq1',
      outputCalibrationDb: -12,
      outputCalibrationGain: 0.251188643150958,
      velocityExponent: 2,
      velocityFloorDb: -36,
      velocityFloorGain: 0.015848931924611134,
    })
    expect(Object.isFrozen(AUDIO_QUALITY_V1A_RENDER_POLICY)).toBe(true)
  })

  it.each([
    [1, 0.015909949412866786, -35.96662402460167],
    [32, 0.07833083989839737, -22.121344334644164],
    [64, 0.26577656381975606, -11.50966635593953],
    [96, 0.5781861036886872, -4.7586470102718],
    [127, 1, 0],
  ] as const)('maps Velocity %i to the approved amplitude anchor', (velocity, gain, db) => {
    const actualGain = calculateAudioQualityV1aVelocityGain(velocity)

    expect(actualGain).toBeCloseTo(gain, 14)
    expect(20 * Math.log10(actualGain)).toBeCloseTo(db, 10)
  })

  it('is strictly monotonic across the complete MIDI Velocity domain', () => {
    let previous = 0
    for (let velocity = 1; velocity <= 127; velocity += 1) {
      const gain = calculateAudioQualityV1aVelocityGain(velocity)
      expect(gain).toBeGreaterThan(previous)
      expect(gain).toBeLessThanOrEqual(1)
      previous = gain
    }
  })

  it.each([0, 1.5, 128, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid MIDI Velocity %s',
    (velocity) => {
      expect(() => calculateAudioQualityV1aVelocityGain(velocity)).toThrowError(TypeError)
    },
  )
})
