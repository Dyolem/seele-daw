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
    throw new Error('The input does not contain a complete Standard MIDI File header.')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = view.getUint32(4)
  if (headerLength < STANDARD_HEADER_LENGTH || bytes.byteLength < 8 + headerLength) {
    throw new Error('The Standard MIDI File header has an invalid length.')
  }

  const format = view.getUint16(8)
  if (format !== 0 && format !== 1) {
    throw new Error(`Standard MIDI File format ${format} is not supported.`)
  }

  const division = view.getUint16(12)
  if ((division & SMPTE_DIVISION_FLAG) !== 0) {
    throw new Error('SMPTE time division is not supported; a PPQ time division is required.')
  }
  if (division === 0) {
    throw new Error('The Standard MIDI File PPQ value must be greater than zero.')
  }

  return { format, ppq: division }
}

function hasMidiHeaderSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64
}
