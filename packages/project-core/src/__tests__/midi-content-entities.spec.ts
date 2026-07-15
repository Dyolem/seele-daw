import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DomainValueError,
  ZERO_TICK,
  addTicks,
  createMidiClipRecord,
  createMidiLoop,
  createMidiNoteRecord,
  createMidiSourceRecord,
  parseClipId,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseProjectColor,
  parseTick,
  parseTrackId,
  type MidiClipRecord,
  type MidiLoop,
  type MidiNoteRecord,
  type MidiSourceRecord,
} from '..'

describe('Tick arithmetic', () => {
  it('adds non-negative Tick values without losing the Tick brand', () => {
    const result = addTicks(parseTick(480), parseTick(480))

    expect(result).toBe(960)
    expectTypeOf(result).toEqualTypeOf<ReturnType<typeof parseTick>>()
  })

  it('rejects unsafe integer overflow', () => {
    expect(() => addTicks(parseTick(Number.MAX_SAFE_INTEGER), parseTick(1))).toThrow(
      DomainValueError,
    )
  })
})

describe('MidiNoteRecord', () => {
  it('creates a new readonly MIDI note record', () => {
    const input = {
      id: parseNoteId('note-1'),
      startTick: parseTick(120),
      durationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }

    const note = createMidiNoteRecord(input)

    expect(note).not.toBe(input)
    expect(note).toEqual(input)
    expectTypeOf(note).toEqualTypeOf<MidiNoteRecord>()
  })

  it('rejects zero duration and an unsafe note end', () => {
    const baseInput = {
      id: parseNoteId('note-1'),
      startTick: ZERO_TICK,
      durationTick: parsePositiveTick(1),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }

    expect(() => createMidiNoteRecord({ ...baseInput, durationTick: ZERO_TICK })).toThrow(
      DomainValueError,
    )
    expect(() =>
      createMidiNoteRecord({
        ...baseInput,
        startTick: parseTick(Number.MAX_SAFE_INTEGER),
      }),
    ).toThrow(DomainValueError)
  })
})

describe('MidiSourceRecord', () => {
  it('creates a source with a positive explicit length', () => {
    const source = createMidiSourceRecord({
      id: parseMidiSourceId('source-1'),
      lengthTick: parsePositiveTick(960),
    })

    expect(source).toEqual({ id: 'source-1', lengthTick: 960 })
    expectTypeOf(source).toEqualTypeOf<MidiSourceRecord>()
  })

  it('rejects an empty source length', () => {
    expect(() =>
      createMidiSourceRecord({
        id: parseMidiSourceId('source-1'),
        lengthTick: ZERO_TICK,
      }),
    ).toThrow(DomainValueError)
  })
})

describe('MidiLoop', () => {
  it('creates a new loop value with a safe source range', () => {
    const input = {
      sourceStartTick: parseTick(240),
      sourceSpanTick: parsePositiveTick(960),
    }

    const loop = createMidiLoop(input)

    expect(loop).not.toBe(input)
    expect(loop).toEqual(input)
    expectTypeOf(loop).toEqualTypeOf<MidiLoop>()
  })

  it('rejects zero span and unsafe loop end', () => {
    expect(() => createMidiLoop({ sourceStartTick: ZERO_TICK, sourceSpanTick: ZERO_TICK })).toThrow(
      DomainValueError,
    )
    expect(() =>
      createMidiLoop({
        sourceStartTick: parseTick(Number.MAX_SAFE_INTEGER),
        sourceSpanTick: parsePositiveTick(1),
      }),
    ).toThrow(DomainValueError)
  })
})

describe('MidiClipRecord', () => {
  const baseInput = {
    id: parseClipId('clip-1'),
    trackId: parseTrackId('track-1'),
    name: 'Verse',
    color: parseProjectColor('#a0b1c2'),
    muted: false,
    startTick: parseTick(960),
    spanTick: parsePositiveTick(1920),
    sourceId: parseMidiSourceId('source-1'),
    sourceOffsetTick: ZERO_TICK,
    loop: null,
  }

  it('creates a MIDI discriminant and a fresh record', () => {
    const clip = createMidiClipRecord(baseInput)

    expect(clip).not.toBe(baseInput)
    expect(clip).toEqual({ ...baseInput, color: '#A0B1C2', kind: 'midi' })
    expectTypeOf(clip).toEqualTypeOf<MidiClipRecord>()
  })

  it('copies the nested loop instead of retaining the input object', () => {
    const loop = createMidiLoop({
      sourceStartTick: parseTick(240),
      sourceSpanTick: parsePositiveTick(960),
    })
    const clip = createMidiClipRecord({
      ...baseInput,
      sourceOffsetTick: parseTick(480),
      loop,
    })

    expect(clip.loop).not.toBe(loop)
    expect(clip.loop).toEqual(loop)
  })

  it('requires a looped source offset to fall inside the loop range', () => {
    const loop = createMidiLoop({
      sourceStartTick: parseTick(240),
      sourceSpanTick: parsePositiveTick(960),
    })

    expect(() =>
      createMidiClipRecord({ ...baseInput, sourceOffsetTick: parseTick(239), loop }),
    ).toThrow(DomainValueError)
    expect(() =>
      createMidiClipRecord({ ...baseInput, sourceOffsetTick: parseTick(1200), loop }),
    ).toThrow(DomainValueError)
  })

  it('rejects unsafe timeline and non-loop source window ends', () => {
    expect(() =>
      createMidiClipRecord({
        ...baseInput,
        startTick: parseTick(Number.MAX_SAFE_INTEGER),
        spanTick: parsePositiveTick(1),
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createMidiClipRecord({
        ...baseInput,
        spanTick: parsePositiveTick(1),
        sourceOffsetTick: parseTick(Number.MAX_SAFE_INTEGER),
      }),
    ).toThrow(DomainValueError)
  })

  it('defers Track and Source existence and bounds to cross-entity validation', () => {
    const clip = createMidiClipRecord({
      ...baseInput,
      sourceOffsetTick: parseTick(10_000),
      spanTick: parsePositiveTick(960),
    })

    expect(clip.sourceOffsetTick).toBe(10_000)
  })
})
