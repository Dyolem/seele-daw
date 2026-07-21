import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DomainValueError,
  TEMPO_BPM_MAX,
  TEMPO_BPM_MIN,
  TIME_SIGNATURE_DENOMINATORS,
  TIME_SIGNATURE_NUMERATOR_MAX,
  TIME_SIGNATURE_NUMERATOR_MIN,
  ZERO_TICK,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureEventId,
  parseTimeSignatureNumerator,
  type TempoBpm,
  type TempoEventRecord,
  type TimeSignatureDenominator,
  type TimeSignatureEventRecord,
  type TimeSignatureNumerator,
} from '#internal/index'

describe('TempoBpm', () => {
  it('accepts inclusive boundaries and fractional BPM values', () => {
    expect(parseTempoBpm(TEMPO_BPM_MIN)).toBe(20)
    expect(parseTempoBpm(120.5)).toBe(120.5)
    expect(parseTempoBpm(TEMPO_BPM_MAX)).toBe(400)
    expectTypeOf(parseTempoBpm(120)).toEqualTypeOf<TempoBpm>()
  })

  it.each([
    TEMPO_BPM_MIN - 0.01,
    TEMPO_BPM_MAX + 0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '120',
  ])('rejects the invalid BPM value %s', (value) => {
    expect(() => parseTempoBpm(value)).toThrow(DomainValueError)
  })
})

describe('Time Signature values', () => {
  it('accepts inclusive numerator boundaries', () => {
    expect(parseTimeSignatureNumerator(TIME_SIGNATURE_NUMERATOR_MIN)).toBe(1)
    expect(parseTimeSignatureNumerator(TIME_SIGNATURE_NUMERATOR_MAX)).toBe(32)
    expectTypeOf(parseTimeSignatureNumerator(4)).toEqualTypeOf<TimeSignatureNumerator>()
  })

  it.each([0, 33, -1, 4.5, Number.NaN, '4'])('rejects the invalid numerator %s', (value) => {
    expect(() => parseTimeSignatureNumerator(value)).toThrow(DomainValueError)
  })

  it('accepts every supported denominator', () => {
    for (const denominator of TIME_SIGNATURE_DENOMINATORS) {
      expect(parseTimeSignatureDenominator(denominator)).toBe(denominator)
    }

    expectTypeOf(parseTimeSignatureDenominator(4)).toEqualTypeOf<TimeSignatureDenominator>()
  })

  it.each([0, 3, 6, 64, 4.5, Number.NaN, '4'])(
    'rejects the unsupported denominator %s',
    (value) => {
      expect(() => parseTimeSignatureDenominator(value)).toThrow(DomainValueError)
    },
  )
})

describe('TempoEventRecord', () => {
  it('creates a fresh event at Tick 0', () => {
    const input = {
      id: parseTempoEventId('tempo-1'),
      tick: ZERO_TICK,
      bpm: parseTempoBpm(120),
    }

    const event = createTempoEventRecord(input)

    expect(event).not.toBe(input)
    expect(event).toEqual(input)
    expectTypeOf(event).toEqualTypeOf<TempoEventRecord>()
  })

  it('allows a locally valid event after Tick 0', () => {
    const event = createTempoEventRecord({
      id: parseTempoEventId('tempo-2'),
      tick: parseTick(960),
      bpm: parseTempoBpm(128),
    })

    expect(event.tick).toBe(960)
  })

  it('revalidates its ID, Tick, and BPM at runtime', () => {
    expect(() =>
      createTempoEventRecord({
        id: '' as never,
        tick: parseTick(0),
        bpm: parseTempoBpm(120),
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createTempoEventRecord({
        id: parseTempoEventId('tempo-1'),
        tick: -1 as never,
        bpm: parseTempoBpm(120),
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createTempoEventRecord({
        id: parseTempoEventId('tempo-1'),
        tick: ZERO_TICK,
        bpm: 401 as never,
      }),
    ).toThrow(DomainValueError)
  })

  it('defers same-Tick uniqueness to cross-entity validation', () => {
    const tick = parseTick(960)
    const first = createTempoEventRecord({
      id: parseTempoEventId('tempo-1'),
      tick,
      bpm: parseTempoBpm(120),
    })
    const second = createTempoEventRecord({
      id: parseTempoEventId('tempo-2'),
      tick,
      bpm: parseTempoBpm(140),
    })

    expect(first.tick).toBe(second.tick)
  })
})

describe('TimeSignatureEventRecord', () => {
  it('creates a fresh event at Tick 0', () => {
    const input = {
      id: parseTimeSignatureEventId('time-signature-1'),
      tick: ZERO_TICK,
      numerator: parseTimeSignatureNumerator(4),
      denominator: parseTimeSignatureDenominator(4),
    }

    const event = createTimeSignatureEventRecord(input)

    expect(event).not.toBe(input)
    expect(event).toEqual(input)
    expectTypeOf(event).toEqualTypeOf<TimeSignatureEventRecord>()
  })

  it('allows a locally valid event after Tick 0', () => {
    const event = createTimeSignatureEventRecord({
      id: parseTimeSignatureEventId('time-signature-2'),
      tick: parseTick(3840),
      numerator: parseTimeSignatureNumerator(3),
      denominator: parseTimeSignatureDenominator(4),
    })

    expect(event.tick).toBe(3840)
  })

  it('revalidates its ID, Tick, numerator, and denominator at runtime', () => {
    expect(() =>
      createTimeSignatureEventRecord({
        id: '' as never,
        tick: ZERO_TICK,
        numerator: parseTimeSignatureNumerator(4),
        denominator: parseTimeSignatureDenominator(4),
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createTimeSignatureEventRecord({
        id: parseTimeSignatureEventId('time-signature-1'),
        tick: -1 as never,
        numerator: parseTimeSignatureNumerator(4),
        denominator: parseTimeSignatureDenominator(4),
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createTimeSignatureEventRecord({
        id: parseTimeSignatureEventId('time-signature-1'),
        tick: ZERO_TICK,
        numerator: 0 as never,
        denominator: parseTimeSignatureDenominator(4),
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createTimeSignatureEventRecord({
        id: parseTimeSignatureEventId('time-signature-1'),
        tick: ZERO_TICK,
        numerator: parseTimeSignatureNumerator(4),
        denominator: 3 as never,
      }),
    ).toThrow(DomainValueError)
  })

  it('defers same-Tick uniqueness to cross-entity validation', () => {
    const tick = parseTick(3840)
    const first = createTimeSignatureEventRecord({
      id: parseTimeSignatureEventId('time-signature-1'),
      tick,
      numerator: parseTimeSignatureNumerator(3),
      denominator: parseTimeSignatureDenominator(4),
    })
    const second = createTimeSignatureEventRecord({
      id: parseTimeSignatureEventId('time-signature-2'),
      tick,
      numerator: parseTimeSignatureNumerator(7),
      denominator: parseTimeSignatureDenominator(8),
    })

    expect(first.tick).toBe(second.tick)
  })
})
