import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DomainValueError,
  MAX_ENTITY_NAME_LENGTH,
  PROJECT_PPQ,
  ZERO_TICK,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseEntityName,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseParameterId,
  parsePositiveTick,
  parseProjectColor,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type ProjectColor,
  type Tick,
  type TrackId,
} from '..'

describe('opaque identifiers', () => {
  it('brands valid opaque strings without changing their runtime value', () => {
    const id = parseTrackId('track:550e8400-e29b-41d4-a716-446655440000')

    expect(id).toBe('track:550e8400-e29b-41d4-a716-446655440000')
    expectTypeOf(id).toEqualTypeOf<TrackId>()
  })

  it.each([
    parseProjectId,
    parseTrackId,
    parseClipId,
    parseMidiSourceId,
    parseNoteId,
    parseDeviceId,
    parseTempoEventId,
    parseTimeSignatureEventId,
    parseDeviceTypeId,
    parseParameterId,
  ])('uses the same validation boundary for every ID domain', (parseId) => {
    expect(parseId('opaque-id')).toBe('opaque-id')
    expect(() => parseId('')).toThrow(DomainValueError)
    expect(() => parseId(' padded-id ')).toThrow(DomainValueError)
    expect(() => parseId('invalid\u0000id')).toThrow(DomainValueError)
  })
})

describe('Tick', () => {
  it('uses the fixed project PPQ and accepts safe integer positions', () => {
    const tick = parseTick(Number.MAX_SAFE_INTEGER)

    expect(PROJECT_PPQ).toBe(960)
    expect(ZERO_TICK).toBe(0)
    expect(tick).toBe(Number.MAX_SAFE_INTEGER)
    expectTypeOf(tick).toEqualTypeOf<Tick>()
  })

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '960'])(
    'rejects an invalid Tick value: %s',
    (value) => {
      expect(() => parseTick(value)).toThrow(DomainValueError)
    },
  )

  it('requires positive Tick values for lengths and spans', () => {
    expect(parsePositiveTick(1)).toBe(1)
    expect(() => parsePositiveTick(0)).toThrow(DomainValueError)
  })
})

describe('MIDI scalar values', () => {
  it('accepts inclusive MIDI boundaries', () => {
    expect(parseMidiPitch(0)).toBe(0)
    expect(parseMidiPitch(127)).toBe(127)
    expect(parseMidiVelocity(1)).toBe(1)
    expect(parseMidiVelocity(127)).toBe(127)
    expect(parseMidiChannel(0)).toBe(0)
    expect(parseMidiChannel(15)).toBe(15)
  })

  it.each([
    () => parseMidiPitch(-1),
    () => parseMidiPitch(128),
    () => parseMidiPitch(60.5),
    () => parseMidiVelocity(0),
    () => parseMidiVelocity(128),
    () => parseMidiChannel(-1),
    () => parseMidiChannel(16),
  ])('rejects an out-of-domain MIDI value', (parseInvalidValue) => {
    expect(parseInvalidValue).toThrow(DomainValueError)
  })
})

describe('mix and presentation scalar values', () => {
  it('accepts the documented gain and pan boundaries', () => {
    expect(parseLinearGain(0)).toBe(0)
    expect(parseLinearGain(4)).toBe(4)
    expect(parseBipolarValue(-1)).toBe(-1)
    expect(parseBipolarValue(1)).toBe(1)
  })

  it.each([
    () => parseLinearGain(-0.01),
    () => parseLinearGain(4.01),
    () => parseLinearGain(Number.NaN),
    () => parseBipolarValue(-1.01),
    () => parseBipolarValue(1.01),
  ])('rejects an invalid finite-range value', (parseInvalidValue) => {
    expect(parseInvalidValue).toThrow(DomainValueError)
  })

  it('canonicalizes project colors to uppercase six-digit hex', () => {
    const color = parseProjectColor('#a0b1c2')

    expect(color).toBe('#A0B1C2')
    expectTypeOf(color).toEqualTypeOf<ProjectColor>()
    expect(() => parseProjectColor('#abc')).toThrow(DomainValueError)
    expect(() => parseProjectColor('rgb(1 2 3)')).toThrow(DomainValueError)
  })

  it('counts entity name length by Unicode code point and preserves valid input', () => {
    const maximumLengthName = '🎵'.repeat(MAX_ENTITY_NAME_LENGTH)

    expect(parseEntityName('  Lead  ')).toBe('  Lead  ')
    expect(parseEntityName(maximumLengthName)).toBe(maximumLengthName)
    expect(() => parseEntityName('   ')).toThrow(DomainValueError)
    expect(() => parseEntityName(`${maximumLengthName}🎵`)).toThrow(DomainValueError)
  })
})
