import { parseSoundbankId, type SoundbankId } from '@seele-daw/playback'

export const FIXTURE_SOUNDBANK_ID = parseSoundbankId('fixture-piano')

function writeFourCc(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export function createPcmWav(frameCount = 100): ArrayBuffer {
  const channelCount = 2
  const bitDepth = 16
  const sampleRateHz = 44_100
  const blockAlign = channelCount * (bitDepth / 8)
  const dataByteLength = frameCount * blockAlign
  const bytes = new ArrayBuffer(44 + dataByteLength)
  const view = new DataView(bytes)
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

function createZone(
  zoneId: string,
  resourceKey: string,
  minimumPitch: number,
  maximumPitch: number,
  rootMidiPitch: number,
) {
  return {
    amplitudeEnvelope: {
      attack: { curve: null, durationSecond: 0 },
      release: { curve: null, durationSecond: 0.133 },
    },
    exclusiveGroup: null,
    loop: { kind: 'none' },
    resource: { key: resourceKey, mediaType: 'audio/wav' },
    rootMidiPitch,
    selector: { kind: 'midi-range', maximumPitch, minimumPitch },
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId,
  }
}

export function createManifestData(soundbankId: SoundbankId = FIXTURE_SOUNDBANK_ID) {
  return {
    displayName: 'Fixture Piano',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId,
    zones: [
      createZone('fixture-low', 'samples/low.wav', 48, 59, 48),
      createZone('fixture-high', 'samples/high.wav', 60, 72, 60),
    ],
  }
}

export function createManifestResponse(soundbankId: SoundbankId = FIXTURE_SOUNDBANK_ID): Response {
  return Response.json(createManifestData(soundbankId))
}

export function createDecodedAudioBuffer(frameCount = 100): AudioBuffer {
  return Object.freeze({
    duration: frameCount / 44_100,
    length: frameCount,
    numberOfChannels: 2,
    sampleRate: 44_100,
  } as AudioBuffer)
}

export class FakeDecodeAudioContext {
  readonly decodeAudioData: BaseAudioContext['decodeAudioData']

  constructor(
    implementation: (audioData: ArrayBuffer) => Promise<AudioBuffer> = async () =>
      createDecodedAudioBuffer(),
  ) {
    this.decodeAudioData = implementation as BaseAudioContext['decodeAudioData']
  }
}
