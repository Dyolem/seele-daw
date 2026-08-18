import { describe, expect, it } from 'vitest'
import { MidiFileCodecError, ToneJsMidiFileDecoder } from '#internal/index'
import {
  createSmfFixture,
  RUNNING_STATUS_NOTE_OFF_FIXTURE,
  TYPE_ONE_MUSICAL_FIXTURE,
  TYPE_ZERO_MULTI_CHANNEL_FIXTURE,
} from '#internal/__tests__/fixtures/standard-midi-file-fixtures'

describe('ToneJsMidiFileDecoder', () => {
  it('projects supported type 1 musical data without exposing Tone.js objects', () => {
    const document = new ToneJsMidiFileDecoder().decode(TYPE_ONE_MUSICAL_FIXTURE)

    expect(document).toEqual({
      format: 1,
      name: 'Song',
      ppq: 480,
      tempos: [{ tick: 0, bpm: 120 }],
      timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
      keySignatures: [{ tick: 0, key: 'C', scale: 'major' }],
      textEvents: [{ tick: 0, kind: 'marker', text: 'Verse' }],
      tracks: [
        {
          name: 'Piano',
          channel: 0,
          programNumber: 0,
          endTick: 480,
          notes: [
            {
              tick: 0,
              durationTicks: 480,
              pitch: 60,
              velocity: 100,
              releaseVelocity: 64,
            },
          ],
          controlChanges: [{ tick: 0, controller: 64, value: 127 }],
          pitchBends: [{ tick: 0, value: 4096 }],
        },
      ],
    })
    expect(document.tracks[0]?.constructor).toBe(Object)
  })

  it('reports normalized tracks when a type 0 source uses multiple channels and programs', () => {
    const document = new ToneJsMidiFileDecoder().decode(TYPE_ZERO_MULTI_CHANNEL_FIXTURE)

    expect(document.format).toBe(0)
    expect(document.ppq).toBe(120)
    expect(
      document.tracks.map((track) => ({
        channel: track.channel,
        programNumber: track.programNumber,
        notes: track.notes,
      })),
    ).toEqual([
      {
        channel: 0,
        programNumber: 0,
        notes: [
          {
            tick: 0,
            durationTicks: 120,
            pitch: 60,
            velocity: 100,
            releaseVelocity: 0,
          },
        ],
      },
      {
        channel: 1,
        programNumber: 40,
        notes: [
          {
            tick: 120,
            durationTicks: 120,
            pitch: 65,
            velocity: 90,
            releaseVelocity: 0,
          },
        ],
      },
    ])
  })

  it('inherits running-status and note-on velocity zero compatibility from the parser', () => {
    const document = new ToneJsMidiFileDecoder().decode(RUNNING_STATUS_NOTE_OFF_FIXTURE)

    expect(document.tracks[0]?.notes).toEqual([
      {
        tick: 0,
        durationTicks: 120,
        pitch: 60,
        velocity: 100,
        releaseVelocity: 0,
      },
    ])
  })

  it.each([
    {
      label: 'format 2',
      bytes: createSmfFixture(2, 480, [[0x00, 0xff, 0x2f, 0x00]]),
      code: 'unsupported-midi-format',
    },
    {
      label: 'SMPTE division',
      bytes: createSmfFixture(1, 0xe728, [[0x00, 0xff, 0x2f, 0x00]]),
      code: 'unsupported-time-division',
    },
    {
      label: 'missing header',
      bytes: new Uint8Array([0x00, 0x01]),
      code: 'invalid-midi-file',
    },
  ] as const)('rejects $label with a stable error code', ({ bytes, code }) => {
    expect(() => new ToneJsMidiFileDecoder().decode(bytes)).toThrowError(
      expect.objectContaining<Partial<MidiFileCodecError>>({ code }),
    )
  })

  it('translates third-party parse failures without leaking their error shape', () => {
    const invalidRunningStatus = createSmfFixture(1, 480, [[0x00, 0x40]])

    expect(() => new ToneJsMidiFileDecoder().decode(invalidRunningStatus)).toThrowError(
      expect.objectContaining<Partial<MidiFileCodecError>>({
        code: 'decode-failed',
        details: { operation: 'decode', format: 1 },
      }),
    )
  })
})
