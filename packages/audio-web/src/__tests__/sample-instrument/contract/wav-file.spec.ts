import { describe, expect, it } from 'vitest'

import {
  SupportedWavFileError,
  parseSupportedWavMetadata,
} from '#internal/sample-instrument/contract/wav-file'

function writeFourCc(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function createPcmWav(frameCount = 100): Uint8Array {
  const channelCount = 2
  const bitDepth = 16
  const sampleRateHz = 44_100
  const blockAlign = channelCount * (bitDepth / 8)
  const dataByteLength = frameCount * blockAlign
  const bytes = new Uint8Array(44 + dataByteLength)
  const view = new DataView(bytes.buffer)
  writeFourCc(view, 0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  writeFourCc(view, 8, 'WAVE')
  writeFourCc(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRateHz, true)
  view.setUint32(28, sampleRateHz * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeFourCc(view, 36, 'data')
  view.setUint32(40, dataByteLength, true)
  return bytes
}

describe('supported WAV file metadata', () => {
  it('parses frame, duration, channel, rate, and bit-depth from an offset view', () => {
    const wav = createPcmWav(441)
    const container = new Uint8Array(wav.byteLength + 8)
    container.set(wav, 4)

    expect(parseSupportedWavMetadata(container.subarray(4, -4))).toEqual({
      audioFormat: 'pcm',
      bitDepth: 16,
      channelCount: 2,
      dataByteLength: 1_764,
      durationSecond: 0.01,
      frameCount: 441,
      sampleRateHz: 44_100,
    })
  })

  it.each([
    {
      code: 'invalid-wav',
      mutate: (bytes: Uint8Array) => bytes.subarray(0, 10),
    },
    {
      code: 'invalid-wav',
      mutate: (bytes: Uint8Array) => {
        new DataView(bytes.buffer).setUint32(4, 12, true)
        return bytes
      },
    },
    {
      code: 'unsupported-wav-format',
      mutate: (bytes: Uint8Array) => {
        new DataView(bytes.buffer).setUint16(20, 17, true)
        return bytes
      },
    },
  ] as const)('rejects $code without guessing', ({ code, mutate }) => {
    expect(() => parseSupportedWavMetadata(mutate(createPcmWav()))).toThrowError(
      expect.objectContaining<Partial<SupportedWavFileError>>({ code }),
    )
  })
})
