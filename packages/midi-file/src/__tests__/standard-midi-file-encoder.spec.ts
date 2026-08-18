import { describe, expect, it } from 'vitest'
import type { MidiFileDocument } from '#internal/contract/midi-file-document'
import { MidiFileCodecError } from '#internal/errors/midi-file-codec-error'
import { ToneJsMidiFileDecoder } from '#internal/adapters/tonejs-midi/tonejs-midi-file-decoder'
import { StandardMidiFileEncoder } from '#internal/adapters/midi-file-js/standard-midi-file-encoder'
import { parseMidi } from 'midi-file'

const DOCUMENT: MidiFileDocument = {
  format: 1,
  name: 'Round Trip',
  ppq: 960,
  tempos: [{ tick: 0, bpm: 120 }],
  timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
  keySignatures: [{ tick: 0, key: 'C', scale: 'major' }],
  textEvents: [{ tick: 480, kind: 'marker', text: 'Middle' }],
  tracks: [
    {
      name: 'Keys',
      channel: 2,
      programNumber: 4,
      endTick: 960,
      notes: [
        {
          tick: 0,
          durationTicks: 960,
          pitch: 67,
          velocity: 101,
          releaseVelocity: 23,
        },
      ],
      controlChanges: [{ tick: 240, controller: 64, value: 127 }],
      pitchBends: [{ tick: 480, value: -4096 }],
    },
  ],
}

describe('StandardMidiFileEncoder', () => {
  it('encodes the supported neutral document as type 1 while preserving tick-domain values', () => {
    const bytes = new StandardMidiFileEncoder().encode(DOCUMENT)
    const decoded = new ToneJsMidiFileDecoder().decode(bytes)

    expect(Array.from(bytes.slice(8, 10))).toEqual([0, 1])
    expect(decoded).toEqual(DOCUMENT)
  })

  it('orders a note off before a different note on at the same tick', () => {
    const bytes = new StandardMidiFileEncoder().encode({
      ...DOCUMENT,
      tracks: [
        {
          ...DOCUMENT.tracks[0]!,
          notes: [
            { tick: 0, durationTicks: 480, pitch: 60, velocity: 100, releaseVelocity: 0 },
            { tick: 480, durationTicks: 480, pitch: 62, velocity: 100, releaseVelocity: 0 },
          ],
        },
      ],
    })

    let absoluteTick = 0
    const boundaryNoteEventTypes = parseMidi(bytes)
      .tracks[1]!.flatMap((event) => {
        absoluteTick += event.deltaTime
        return absoluteTick === 480 ? [event.type] : []
      })
      .filter((type) => type === 'noteOff' || type === 'noteOn')
    expect(boundaryNoteEventTypes).toEqual(['noteOff', 'noteOn'])
  })

  it('rejects type 0 output because the V1 encoder emits type 1', () => {
    expect(() => new StandardMidiFileEncoder().encode({ ...DOCUMENT, format: 0 })).toThrowError(
      expect.objectContaining<Partial<MidiFileCodecError>>({
        code: 'unsupported-midi-format',
        details: { operation: 'encode', format: 0 },
      }),
    )
  })

  it('rejects invalid MIDI ranges before invoking the third-party writer', () => {
    const invalidDocument: MidiFileDocument = {
      ...DOCUMENT,
      tracks: [{ ...DOCUMENT.tracks[0]!, channel: 16 }],
    }

    expect(() => new StandardMidiFileEncoder().encode(invalidDocument)).toThrowError(
      expect.objectContaining<Partial<MidiFileCodecError>>({
        code: 'invalid-midi-document',
        details: { operation: 'encode' },
      }),
    )
  })

  it('rejects an event gap that cannot be encoded as a four-byte SMF delta', () => {
    const tooLargeDelta = 0x10000000
    const invalidDocument: MidiFileDocument = {
      ...DOCUMENT,
      tracks: [
        {
          ...DOCUMENT.tracks[0]!,
          endTick: tooLargeDelta + 1,
          notes: [
            {
              tick: tooLargeDelta,
              durationTicks: 1,
              pitch: 60,
              velocity: 100,
              releaseVelocity: 0,
            },
          ],
          controlChanges: [],
          pitchBends: [],
        },
      ],
    }

    expect(() => new StandardMidiFileEncoder().encode(invalidDocument)).toThrowError(
      expect.objectContaining<Partial<MidiFileCodecError>>({ code: 'invalid-midi-document' }),
    )
  })

  it('rejects text that the current byte-oriented SMF writer would corrupt', () => {
    expect(() =>
      new StandardMidiFileEncoder().encode({ ...DOCUMENT, name: '未编码项目' }),
    ).toThrowError(
      expect.objectContaining<Partial<MidiFileCodecError>>({ code: 'invalid-midi-document' }),
    )
  })
})
