import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import {
  SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
  SAMPLE_INSTRUMENT_MANIFEST_VERSION,
  type SampleInstrumentManifestV1,
} from '#internal/sample-instrument/sample-instrument-manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/sample-instrument-manifest-validator'
import type { SupportedWavMetadata } from '#internal/sample-instrument/supported-wav-file'

import {
  LocalSampleInstrumentPreparationError,
  assertManifestPitchCoverage,
  assertManifestResourceDurations,
  constrainManifestToPitchRange,
} from '../prepare-local-sample-instrument'

function createManifest(): SampleInstrumentManifestV1 {
  const zone = (zoneId: string, minimumPitch: number, maximumPitch: number, key: string) => ({
    amplitudeEnvelope: {
      attack: { curve: null, durationSecond: 0 },
      release: { curve: null, durationSecond: 0.1 },
    },
    exclusiveGroup: null,
    loop: { kind: 'none' },
    resource: { key, mediaType: 'audio/wav' },
    rootMidiPitch: minimumPitch,
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
    zones: [zone('low', 20, 23, 'samples/low.wav'), zone('high', 24, 30, 'samples/high.wav')],
  })
}

function createWavMetadata(durationSecond: number): SupportedWavMetadata {
  return Object.freeze({
    audioFormat: 'pcm',
    bitDepth: 16,
    channelCount: 2,
    dataByteLength: 176_400 * durationSecond,
    durationSecond,
    frameCount: 44_100 * durationSecond,
    sampleRateHz: 44_100,
  })
}

describe('local Sample Instrument preparation', () => {
  it('constrains boundary selectors and verifies complete pitch coverage', () => {
    const manifest = constrainManifestToPitchRange(createManifest(), 21, 28)

    expect(manifest.zones.map(({ selector }) => selector)).toEqual([
      { kind: 'midi-range', maximumPitch: 23, minimumPitch: 21 },
      { kind: 'midi-range', maximumPitch: 28, minimumPitch: 24 },
    ])
    expect(() => assertManifestPitchCoverage(manifest, 21, 28)).not.toThrow()
  })

  it('checks every WAV reference, offset, loop, and unused resource', () => {
    const manifest = constrainManifestToPitchRange(createManifest(), 21, 28)
    const metadata = new Map([
      ['samples/low.wav', createWavMetadata(1)],
      ['samples/high.wav', createWavMetadata(1)],
    ])

    expect(() => assertManifestResourceDurations(manifest, metadata)).not.toThrow()
    metadata.set('samples/unused.wav', createWavMetadata(1))
    expect(() => assertManifestResourceDurations(manifest, metadata)).toThrowError(
      expect.objectContaining<Partial<LocalSampleInstrumentPreparationError>>({
        code: 'unused-resource',
      }),
    )
  })

  it('rejects an incomplete requested product range', () => {
    const manifest = constrainManifestToPitchRange(createManifest(), 21, 28)

    expect(() => assertManifestPitchCoverage(manifest, 21, 29)).toThrowError(
      expect.objectContaining<Partial<LocalSampleInstrumentPreparationError>>({
        code: 'missing-pitch',
      }),
    )
  })
})
