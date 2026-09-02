import { describe, expect, it } from 'vitest'

import {
  AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_PITCH,
  AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND,
  AUDIO_QUALITY_EXPRESSION_EQ2_STRESS_VOICE_COUNT,
  createAudioQualityExpressionEq2Plan,
  createAudioQualityExpressionEq2RetriggerPlans,
  createAudioQualityExpressionEq2StressPlans,
} from '#internal/development/audio-quality-aq0/expression-eq2-fixture'

describe('Expression Quality EQ2 browser fixture', () => {
  it('keeps authored key release distinct from the pedal-derived final release', () => {
    const plan = createAudioQualityExpressionEq2Plan({
      occurrenceKey: 'expression-eq2-contract',
      pitch: AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.sustainLoop,
    })

    expect(plan.keyReleasePlaybackClockSecond).toBeLessThan(plan.releasePlaybackClockSecond)
    expect(plan.releasePlaybackClockSecond).toBe(AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND)
    expect(plan.pan).toBe(-1)
  })

  it('freezes a sub-limit coherent pedal stress without triggering the allocator', () => {
    const plans = createAudioQualityExpressionEq2StressPlans()

    expect(plans).toHaveLength(AUDIO_QUALITY_EXPRESSION_EQ2_STRESS_VOICE_COUNT)
    expect(new Set(plans.map(({ occurrenceKey }) => occurrenceKey)).size).toBe(plans.length)
    expect(new Set(plans.map(({ pitch }) => pitch))).toEqual(
      new Set([AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.noLoop]),
    )
    expect(
      plans.every(
        ({ releasePlaybackClockSecond }) =>
          releasePlaybackClockSecond === AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
      ),
    ).toBe(true)
  })

  it('uses independent same-pitch occurrences while the first Voice is pedal-held', () => {
    const plans = createAudioQualityExpressionEq2RetriggerPlans()
    const [first, second] = plans

    expect(plans).toHaveLength(2)
    expect(first?.pitch).toBe(second?.pitch)
    expect(first?.occurrenceKey).not.toBe(second?.occurrenceKey)
    expect(first?.keyReleasePlaybackClockSecond).toBeLessThan(second?.startPlaybackClockSecond ?? 0)
    expect(second?.startPlaybackClockSecond).toBe(AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND)
    expect(
      plans.every(
        ({ releasePlaybackClockSecond }) =>
          releasePlaybackClockSecond === AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
      ),
    ).toBe(true)
  })
})
