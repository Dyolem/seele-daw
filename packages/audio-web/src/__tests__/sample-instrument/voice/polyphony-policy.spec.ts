import { describe, expect, it } from 'vitest'

import {
  selectSampleInstrumentVoiceStealCandidate,
  type SampleInstrumentVoiceStealCandidate,
} from '#internal/sample-instrument/voice/polyphony-policy'

function candidate(
  value: string,
  overrides: Partial<SampleInstrumentVoiceStealCandidate<string>> = {},
): SampleInstrumentVoiceStealCandidate<string> {
  return Object.freeze({
    effectiveGain: 1,
    lifecycle: 'key-held',
    stableToken: value,
    startTime: 1,
    value,
    ...overrides,
  })
}

describe('Sample Instrument Voice polyphony policy', () => {
  it('prefers release-started, then key-released Voices before gain', () => {
    expect(
      selectSampleInstrumentVoiceStealCandidate([
        candidate('quiet', { effectiveGain: 0.01, startTime: 0 }),
        candidate('releasing', {
          effectiveGain: 1,
          lifecycle: 'release-started',
          stableToken: 'z',
          startTime: 2,
        }),
      ]),
    ).toBe('releasing')
    expect(
      selectSampleInstrumentVoiceStealCandidate([
        candidate('quiet-key-held', { effectiveGain: 0.01 }),
        candidate('loud-key-released', {
          effectiveGain: 1,
          lifecycle: 'key-released',
        }),
      ]),
    ).toBe('loud-key-released')
  })

  it('then prefers lower effective gain', () => {
    expect(
      selectSampleInstrumentVoiceStealCandidate([
        candidate('loud', { effectiveGain: 0.8 }),
        candidate('quiet', { effectiveGain: 0.2 }),
      ]),
    ).toBe('quiet')
  })

  it('then prefers the earlier Voice start', () => {
    expect(
      selectSampleInstrumentVoiceStealCandidate([
        candidate('newer', { startTime: 2 }),
        candidate('older', { startTime: 1 }),
      ]),
    ).toBe('older')
  })

  it('finally uses the stable Voice Token and accepts an empty collection', () => {
    expect(
      selectSampleInstrumentVoiceStealCandidate([
        candidate('second', { stableToken: 'voice-b' }),
        candidate('first', { stableToken: 'voice-a' }),
      ]),
    ).toBe('first')
    expect(selectSampleInstrumentVoiceStealCandidate([])).toBeNull()
  })
})
