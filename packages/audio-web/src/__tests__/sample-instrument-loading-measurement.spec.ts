import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import {
  SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
  SAMPLE_INSTRUMENT_MANIFEST_VERSION,
} from '#internal/sample-instrument/sample-instrument-manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/sample-instrument-manifest-validator'
import {
  SampleInstrumentLoadingMeasurementError,
  estimateSampleInstrumentLoading,
  measureSampleInstrumentPitchForAudition,
  type SampleInstrumentResourceMeasurement,
} from '#internal/sample-instrument/sample-instrument-loading-measurement'

const RESOURCES: readonly SampleInstrumentResourceMeasurement[] = Object.freeze([
  Object.freeze({
    channelCount: 2,
    encodedByteLength: 1_000,
    frameCount: 44_100,
    key: 'samples/low.wav',
    sampleRateHz: 44_100,
  }),
  Object.freeze({
    channelCount: 1,
    encodedByteLength: 2_000,
    frameCount: 88_200,
    key: 'samples/high.wav',
    sampleRateHz: 44_100,
  }),
])

function createManifest() {
  const zone = (
    zoneId: string,
    resourceKey: string,
    minimumPitch: number,
    maximumPitch: number,
    rootMidiPitch: number,
  ) => ({
    amplitudeEnvelope: {
      attack: { curve: null, durationSecond: 0 },
      release: { curve: null, durationSecond: 0.1 },
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
  })

  return parseSampleInstrumentManifestV1({
    displayName: 'Fixture',
    schema: SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
    schemaVersion: SAMPLE_INSTRUMENT_MANIFEST_VERSION,
    soundbankId: parseSoundbankId('fixture'),
    zones: [
      zone('low', 'samples/low.wav', 48, 59, 48),
      zone('high', 'samples/high.wav', 60, 72, 60),
    ],
  })
}

describe('Sample Instrument loading measurement', () => {
  it('estimates unique encoded and decoded resources for full and pitch-window loads', () => {
    const manifest = createManifest()

    expect(estimateSampleInstrumentLoading(manifest, RESOURCES)).toEqual({
      decodedFloat32ByteLength: 705_600,
      encodedByteLength: 3_000,
      maximumSourceDurationSecond: 2,
      minimumSourceDurationSecond: 1,
      resourceCount: 2,
      resourceKeys: ['samples/high.wav', 'samples/low.wav'],
    })
    expect(estimateSampleInstrumentLoading(manifest, RESOURCES, [48, 52, 48])).toEqual({
      decodedFloat32ByteLength: 352_800,
      encodedByteLength: 1_000,
      maximumSourceDurationSecond: 1,
      minimumSourceDurationSecond: 1,
      resourceCount: 1,
      resourceKeys: ['samples/low.wav'],
    })
  })

  it('measures transposed natural duration without inventing a loop', () => {
    const measurement = measureSampleInstrumentPitchForAudition(createManifest(), RESOURCES, 72)

    expect(measurement.resourceKey).toBe('samples/high.wav')
    expect(measurement.playbackRate).toBe(2)
    expect(measurement.effectiveNaturalEndSecond).toBe(1)
  })

  it.each([
    {
      code: 'unsupported-pitch',
      run: () => estimateSampleInstrumentLoading(createManifest(), RESOURCES, [47]),
    },
    {
      code: 'missing-resource',
      run: () => estimateSampleInstrumentLoading(createManifest(), RESOURCES.slice(0, 1)),
    },
    {
      code: 'duplicate-resource',
      run: () => estimateSampleInstrumentLoading(createManifest(), [...RESOURCES, RESOURCES[0]!]),
    },
  ] as const)('rejects $code rather than under-reporting the load', ({ code, run }) => {
    expect(run).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentLoadingMeasurementError>>({ code }),
    )
  })
})
