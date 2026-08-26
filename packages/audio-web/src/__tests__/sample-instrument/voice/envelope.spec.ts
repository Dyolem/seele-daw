import { describe, expect, it } from 'vitest'

import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import { FakeAudioParam } from '#internal/__tests__/support/fake-web-audio'
import {
  evaluateSampleInstrumentEnvelopeProgress,
  evaluateSampleInstrumentEnvelopeTransition,
  scheduleSampleInstrumentEnvelopeTransition,
} from '#internal/sample-instrument/voice/envelope'

describe('Sample Instrument envelope', () => {
  it('keeps null and zero shapes linear and clamps normalized time', () => {
    expect(evaluateSampleInstrumentEnvelopeProgress(-1, null)).toBe(0)
    expect(evaluateSampleInstrumentEnvelopeProgress(0.25, null)).toBe(0.25)
    expect(evaluateSampleInstrumentEnvelopeProgress(0.75, 0)).toBe(0.75)
    expect(evaluateSampleInstrumentEnvelopeProgress(2, 0)).toBe(1)
    expect(evaluateSampleInstrumentEnvelopeTransition(0.2, 1, 0.5, null)).toBeCloseTo(0.6)
  })

  it('front-loads negative shapes and defers positive shapes', () => {
    expect(evaluateSampleInstrumentEnvelopeProgress(0.5, -2)).toBeGreaterThan(0.5)
    expect(evaluateSampleInstrumentEnvelopeProgress(0.5, 2)).toBeLessThan(0.5)
    expect(evaluateSampleInstrumentEnvelopeProgress(0.5, -1_000)).toBeCloseTo(
      evaluateSampleInstrumentEnvelopeProgress(0.5, -10),
    )
    expect(evaluateSampleInstrumentEnvelopeProgress(0.5, 1_000)).toBeCloseTo(
      evaluateSampleInstrumentEnvelopeProgress(0.5, 10),
    )
    expect(evaluateSampleInstrumentEnvelopeProgress(0.25, -2)).toBeCloseTo(
      Math.expm1(-0.5) / Math.expm1(-2),
      14,
    )
    expect(evaluateSampleInstrumentEnvelopeProgress(0.75, 2)).toBeCloseTo(
      Math.expm1(1.5) / Math.expm1(2),
      14,
    )
  })

  it('uses native linear automation for a linear segment', () => {
    const parameter = new FakeAudioParam()

    const endValue = scheduleSampleInstrumentEnvelopeTransition(
      parameter as unknown as AudioParam,
      0,
      0.8,
      4,
      { curve: null, durationSecond: 2 },
    )

    expect(endValue).toBe(0.8)
    expect(parameter.events).toEqual([
      { kind: 'set', time: 4, value: 0 },
      { kind: 'linear-ramp', time: 6, value: 0.8 },
    ])
  })

  it('truncates a shaped segment without scheduling automation beyond the cutoff', () => {
    const parameter = new FakeAudioParam()

    const endValue = scheduleSampleInstrumentEnvelopeTransition(
      parameter as unknown as AudioParam,
      0,
      1,
      10,
      { curve: -2, durationSecond: 2 },
      0.5,
    )

    expect(endValue).toBeCloseTo(evaluateSampleInstrumentEnvelopeProgress(0.25, -2))
    expect(parameter.events.filter(({ kind }) => kind === 'linear-ramp')).toHaveLength(
      AUDIO_QUALITY_V1A_RENDER_POLICY.envelopeCurveSegmentCount / 4,
    )
    expect(parameter.events.at(-1)?.time).toBe(10.5)
    expect(parameter.events.every(({ time }) => time <= 10.5)).toBe(true)
  })

  it('sets zero-duration transitions immediately and treats a negative cutoff as zero', () => {
    const immediate = new FakeAudioParam()
    expect(
      scheduleSampleInstrumentEnvelopeTransition(immediate as unknown as AudioParam, 0, 1, 2, {
        curve: null,
        durationSecond: 0,
      }),
    ).toBe(1)
    expect(immediate.events).toEqual([
      { kind: 'set', time: 2, value: 0 },
      { kind: 'set', time: 2, value: 1 },
    ])

    const truncated = new FakeAudioParam()
    expect(
      scheduleSampleInstrumentEnvelopeTransition(
        truncated as unknown as AudioParam,
        0,
        1,
        2,
        { curve: null, durationSecond: 1 },
        -1,
      ),
    ).toBe(0)
    expect(truncated.events).toEqual([{ kind: 'set', time: 2, value: 0 }])
  })
})
