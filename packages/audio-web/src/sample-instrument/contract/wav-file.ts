const RIFF_HEADER_BYTE_LENGTH = 12
const CHUNK_HEADER_BYTE_LENGTH = 8
const MINIMUM_FORMAT_CHUNK_BYTE_LENGTH = 16
const PCM_FORMAT_CODE = 1
const IEEE_FLOAT_FORMAT_CODE = 3

export interface SupportedWavMetadata {
  readonly audioFormat: 'ieee-float' | 'pcm'
  readonly bitDepth: number
  readonly channelCount: number
  readonly dataByteLength: number
  readonly durationSecond: number
  readonly frameCount: number
  readonly sampleRateHz: number
}

export type SupportedWavFileErrorCode = 'invalid-wav' | 'unsupported-wav-format'

export class SupportedWavFileError extends TypeError {
  readonly code: SupportedWavFileErrorCode
  readonly detail: string

  constructor(code: SupportedWavFileErrorCode, message: string) {
    super(message)
    this.name = 'SupportedWavFileError'
    this.code = code
    this.detail = message
  }
}

function fail(code: SupportedWavFileErrorCode, message: string): never {
  throw new SupportedWavFileError(code, message)
}

function readFourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

interface WavFormatChunk {
  readonly audioFormat: 'ieee-float' | 'pcm'
  readonly bitDepth: number
  readonly blockAlign: number
  readonly byteRate: number
  readonly channelCount: number
  readonly sampleRateHz: number
}

function parseFormatChunk(view: DataView, offset: number, byteLength: number): WavFormatChunk {
  if (byteLength < MINIMUM_FORMAT_CHUNK_BYTE_LENGTH) {
    fail('invalid-wav', 'WAV fmt chunk is too short')
  }

  const formatCode = view.getUint16(offset, true)
  let audioFormat: WavFormatChunk['audioFormat']
  if (formatCode === PCM_FORMAT_CODE) audioFormat = 'pcm'
  else if (formatCode === IEEE_FLOAT_FORMAT_CODE) audioFormat = 'ieee-float'
  else {
    fail('unsupported-wav-format', `unsupported WAV format code ${formatCode}`)
  }

  const channelCount = view.getUint16(offset + 2, true)
  const sampleRateHz = view.getUint32(offset + 4, true)
  const byteRate = view.getUint32(offset + 8, true)
  const blockAlign = view.getUint16(offset + 12, true)
  const bitDepth = view.getUint16(offset + 14, true)
  if (
    channelCount < 1 ||
    channelCount > 8 ||
    sampleRateHz < 1 ||
    sampleRateHz > 384_000 ||
    bitDepth < 8 ||
    bitDepth > 64 ||
    bitDepth % 8 !== 0
  ) {
    fail('unsupported-wav-format', 'WAV channel, sample-rate, or bit-depth is unsupported')
  }

  const expectedBlockAlign = channelCount * (bitDepth / 8)
  if (blockAlign !== expectedBlockAlign || byteRate !== sampleRateHz * blockAlign) {
    fail('invalid-wav', 'WAV fmt byte-rate or block alignment is inconsistent')
  }

  return Object.freeze({
    audioFormat,
    bitDepth,
    blockAlign,
    byteRate,
    channelCount,
    sampleRateHz,
  })
}

/** Reads the deterministic PCM/float subset accepted by the local Soundbank preparation tool. */
export function parseSupportedWavMetadata(bytes: Uint8Array): SupportedWavMetadata {
  if (bytes.byteLength < RIFF_HEADER_BYTE_LENGTH) {
    fail('invalid-wav', 'WAV input is shorter than a RIFF header')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readFourCc(view, 0) !== 'RIFF' || readFourCc(view, 8) !== 'WAVE') {
    fail('invalid-wav', 'WAV input is not a RIFF WAVE container')
  }
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) {
    fail('invalid-wav', 'RIFF byte length does not match the input')
  }

  let format: WavFormatChunk | null = null
  let dataByteLength: number | null = null
  let offset = RIFF_HEADER_BYTE_LENGTH
  while (offset < bytes.byteLength) {
    if (offset + CHUNK_HEADER_BYTE_LENGTH > bytes.byteLength) {
      fail('invalid-wav', 'WAV ends inside a chunk header')
    }
    const chunkId = readFourCc(view, offset)
    const chunkByteLength = view.getUint32(offset + 4, true)
    const dataOffset = offset + CHUNK_HEADER_BYTE_LENGTH
    const dataEnd = dataOffset + chunkByteLength
    const paddedEnd = dataEnd + (chunkByteLength % 2)
    if (!Number.isSafeInteger(paddedEnd) || paddedEnd > bytes.byteLength) {
      fail('invalid-wav', `WAV ${chunkId} chunk exceeds the input`)
    }

    if (chunkId === 'fmt ') {
      if (format !== null) fail('invalid-wav', 'WAV contains duplicate fmt chunks')
      format = parseFormatChunk(view, dataOffset, chunkByteLength)
    } else if (chunkId === 'data') {
      if (dataByteLength !== null) fail('invalid-wav', 'WAV contains duplicate data chunks')
      dataByteLength = chunkByteLength
    }
    offset = paddedEnd
  }

  if (format === null || dataByteLength === null) {
    fail('invalid-wav', 'WAV requires exactly one fmt chunk and one data chunk')
  }
  if (dataByteLength % format.blockAlign !== 0) {
    fail('invalid-wav', 'WAV data byte length is not frame-aligned')
  }

  const frameCount = dataByteLength / format.blockAlign
  return Object.freeze({
    audioFormat: format.audioFormat,
    bitDepth: format.bitDepth,
    channelCount: format.channelCount,
    dataByteLength,
    durationSecond: frameCount / format.sampleRateHz,
    frameCount,
    sampleRateHz: format.sampleRateHz,
  })
}
