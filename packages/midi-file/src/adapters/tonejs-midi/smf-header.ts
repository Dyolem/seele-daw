import { MidiFileCodecError } from '#internal/errors/midi-file-codec-error'
import type { MidiFileFormat } from '#internal/contract/midi-file-document'

const MINIMUM_HEADER_BYTES = 14
const STANDARD_HEADER_LENGTH = 6
const SMPTE_DIVISION_FLAG = 0x8000

export interface SupportedSmfHeader {
  readonly format: MidiFileFormat
  readonly ppq: number
}

export function readSupportedSmfHeader(bytes: Uint8Array): SupportedSmfHeader {
  if (bytes.byteLength < MINIMUM_HEADER_BYTES || !hasMidiHeaderSignature(bytes)) {
    throw new MidiFileCodecError(
      'invalid-midi-file',
      'The input does not contain a complete Standard MIDI File header.',
      { operation: 'decode' },
    )
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = view.getUint32(4)
  if (headerLength < STANDARD_HEADER_LENGTH || bytes.byteLength < 8 + headerLength) {
    throw new MidiFileCodecError(
      'invalid-midi-file',
      'The Standard MIDI File header has an invalid length.',
      { operation: 'decode' },
    )
  }

  const format = view.getUint16(8)
  if (format !== 0 && format !== 1) {
    throw new MidiFileCodecError(
      'unsupported-midi-format',
      `Standard MIDI File format ${format} is not supported.`,
      { operation: 'decode', format },
    )
  }

  const division = view.getUint16(12)
  if ((division & SMPTE_DIVISION_FLAG) !== 0) {
    throw new MidiFileCodecError(
      'unsupported-time-division',
      'SMPTE time division is not supported; a PPQ time division is required.',
      { operation: 'decode', division },
    )
  }
  if (division === 0) {
    throw new MidiFileCodecError(
      'invalid-midi-file',
      'The Standard MIDI File PPQ value must be greater than zero.',
      { operation: 'decode', division },
    )
  }

  return { format, ppq: division }
}

function hasMidiHeaderSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64
}
