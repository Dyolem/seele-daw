function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0))
}

function uint16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff]
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function trackChunk(events: readonly number[]): number[] {
  return [...ascii('MTrk'), ...uint32(events.length), ...events]
}

export function createSmfFixture(
  format: number,
  division: number,
  tracks: readonly (readonly number[])[],
): Uint8Array {
  return new Uint8Array([
    ...ascii('MThd'),
    ...uint32(6),
    ...uint16(format),
    ...uint16(tracks.length),
    ...uint16(division),
    ...tracks.flatMap(trackChunk),
  ])
}

const END_OF_TRACK = [0x00, 0xff, 0x2f, 0x00]

function systemExclusiveEvent(status: 0xf0 | 0xf7, data: readonly number[]): number[] {
  if (data.length > 0x7f) throw new TypeError('Test SysEx helper only supports one-byte lengths')
  return [0x00, status, data.length, ...data]
}

export const TYPE_ONE_MUSICAL_FIXTURE = createSmfFixture(1, 480, [
  [
    0x00,
    0xff,
    0x03,
    0x04,
    ...ascii('Song'),
    0x00,
    0xff,
    0x51,
    0x03,
    0x07,
    0xa1,
    0x20,
    0x00,
    0xff,
    0x58,
    0x04,
    0x04,
    0x02,
    0x18,
    0x08,
    0x00,
    0xff,
    0x59,
    0x02,
    0x00,
    0x00,
    0x00,
    0xff,
    0x06,
    0x05,
    ...ascii('Verse'),
    ...END_OF_TRACK,
  ],
  [
    0x00,
    0xff,
    0x03,
    0x05,
    ...ascii('Piano'),
    0x00,
    0xc0,
    0x00,
    0x00,
    0xb0,
    0x40,
    0x7f,
    0x00,
    0xe0,
    0x00,
    0x60,
    0x00,
    0x90,
    0x3c,
    0x64,
    0x83,
    0x60,
    0x80,
    0x3c,
    0x40,
    ...END_OF_TRACK,
  ],
])

export const TYPE_ZERO_MULTI_CHANNEL_FIXTURE = createSmfFixture(0, 120, [
  [
    0x00,
    0xc0,
    0x00,
    0x00,
    0x90,
    0x3c,
    0x64,
    0x78,
    0x80,
    0x3c,
    0x00,
    0x00,
    0xc1,
    0x28,
    0x00,
    0x91,
    0x41,
    0x5a,
    0x78,
    0x81,
    0x41,
    0x00,
    ...END_OF_TRACK,
  ],
])

export const TYPE_ZERO_MID_TRACK_PROGRAM_CHANGE_FIXTURE = createSmfFixture(0, 120, [
  [
    0x00,
    0xc0,
    0x00,
    0x00,
    0x90,
    0x3c,
    0x64,
    0x78,
    0x80,
    0x3c,
    0x00,
    0x00,
    0xc0,
    0x28,
    0x00,
    0x90,
    0x41,
    0x5a,
    0x78,
    0x80,
    0x41,
    0x00,
    ...END_OF_TRACK,
  ],
])

export const RUNNING_STATUS_NOTE_OFF_FIXTURE = createSmfFixture(0, 120, [
  [0x00, 0x90, 0x3c, 0x64, 0x78, 0x3c, 0x00, ...END_OF_TRACK],
])

export const TYPE_ONE_MODE_DECLARATIONS_FIXTURE = createSmfFixture(1, 480, [
  [
    ...systemExclusiveEvent(0xf0, [0x7e, 0x7f, 0x09, 0x01, 0xf7]),
    ...systemExclusiveEvent(0xf0, [0x7e, 0x03, 0x09, 0x02, 0xf7]),
    ...systemExclusiveEvent(0xf0, [0x7e, 0x05, 0x09, 0x03, 0xf7]),
    ...systemExclusiveEvent(0xf0, [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]),
    ...systemExclusiveEvent(0xf0, [0x43, 0x1a, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]),
    ...systemExclusiveEvent(0xf0, [0x7d, 0x01, 0xf7]),
    ...END_OF_TRACK,
  ],
])

export const TYPE_ZERO_FRAGMENTED_GM_DECLARATION_FIXTURE = createSmfFixture(0, 120, [
  [
    0x78,
    0xf0,
    0x01,
    0x7e,
    ...systemExclusiveEvent(0xf7, [0x7f, 0x09]),
    ...systemExclusiveEvent(0xf7, [0x01, 0xf7]),
    ...END_OF_TRACK,
  ],
])
