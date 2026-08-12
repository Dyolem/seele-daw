import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
  SAMPLE_INSTRUMENT_MANIFEST_VERSION,
  type SampleInstrumentManifestV1,
} from '#internal/sample-instrument/sample-instrument-manifest'
import {
  SampleInstrumentManifestError,
  parseSampleInstrumentManifestV1,
} from '#internal/sample-instrument/sample-instrument-manifest-validator'

function createZone(
  zoneId: string,
  pitch: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    amplitudeEnvelope: {
      attack: { curve: null, durationSecond: 0 },
      release: { curve: null, durationSecond: 0.1 },
    },
    exclusiveGroup: null,
    loop: { kind: 'none' },
    resource: { key: `${zoneId}.wav`, mediaType: 'audio/wav' },
    rootMidiPitch: pitch,
    selector: { kind: 'exact-midi', pitch },
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId,
    ...overrides,
  }
}

function createManifest(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    displayName: 'Manifest Fixture',
    schema: SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
    schemaVersion: SAMPLE_INSTRUMENT_MANIFEST_VERSION,
    soundbankId: 'manifest-fixture',
    zones: [createZone('zone-60', 60)],
    ...overrides,
  }
}

describe('Sample Instrument Manifest V1', () => {
  it('parses a canonical immutable contract with both supported loop behaviors', () => {
    const manifest = parseSampleInstrumentManifestV1(
      createManifest({
        zones: [
          createZone('zone-60', 60, {
            loop: { endSecond: 2, kind: 'continuous', startSecond: 1 },
          }),
          createZone('zone-61', 61, {
            loop: { endSecond: 3, kind: 'sustain', startSecond: 1.5 },
          }),
        ],
      }),
    )

    expect(manifest.soundbankId).toBe(parseSoundbankId('manifest-fixture'))
    expect(manifest.zones.map((zone) => zone.loop.kind)).toEqual(['continuous', 'sustain'])
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.zones)).toBe(true)
    expect(Object.isFrozen(manifest.zones[0])).toBe(true)
    expectTypeOf(manifest).toEqualTypeOf<SampleInstrumentManifestV1>()
  })

  it('supports directed SFZ-compatible exclusive groups', () => {
    const manifest = parseSampleInstrumentManifestV1(
      createManifest({
        zones: [
          createZone('closed-hat', 42, {
            exclusiveGroup: { groupId: 1, offByGroupId: 2, offMode: 'normal' },
          }),
          createZone('open-hat', 46, {
            exclusiveGroup: { groupId: 2, offByGroupId: 1, offMode: 'fast' },
          }),
        ],
      }),
    )

    expect(manifest.zones.map((zone) => zone.exclusiveGroup)).toEqual([
      { groupId: 1, offByGroupId: 2, offMode: 'normal' },
      { groupId: 2, offByGroupId: 1, offMode: 'fast' },
    ])
  })

  it.each([
    {
      code: 'unsupported-manifest-version',
      input: createManifest({ schemaVersion: 2 }),
      path: '$.schemaVersion',
    },
    {
      code: 'unsafe-resource-key',
      input: createManifest({
        zones: [
          createZone('zone-60', 60, { resource: { key: '../sample.wav', mediaType: 'audio/wav' } }),
        ],
      }),
      path: '$.zones[0].resource.key',
    },
    {
      code: 'overlapping-zone-selector',
      input: createManifest({
        zones: [
          createZone('zone-range', 60, {
            selector: { kind: 'midi-range', maximumPitch: 61, minimumPitch: 60 },
          }),
          createZone('zone-61', 61),
        ],
      }),
      path: '$.zones[1].selector',
    },
    {
      code: 'noncanonical-zone-order',
      input: createManifest({ zones: [createZone('zone-61', 61), createZone('zone-60', 60)] }),
      path: '$.zones[1]',
    },
  ] as const)('rejects $code without fallback', ({ code, input, path }) => {
    expect(() => parseSampleInstrumentManifestV1(input)).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentManifestError>>({ code, path }),
    )
  })

  it('rejects a gated zone without release and a one-shot zone with a loop', () => {
    const gated = createManifest({
      zones: [
        createZone('zone-60', 60, {
          amplitudeEnvelope: {
            attack: { curve: null, durationSecond: 0 },
            release: null,
          },
        }),
      ],
    })
    const oneShotLoop = createManifest({
      zones: [
        createZone('zone-60', 60, {
          loop: { endSecond: 2, kind: 'continuous', startSecond: 1 },
          triggerMode: 'one-shot',
        }),
      ],
    })

    expect(() => parseSampleInstrumentManifestV1(gated)).toThrowError(
      expect.objectContaining({ code: 'invalid-manifest' }),
    )
    expect(() => parseSampleInstrumentManifestV1(oneShotLoop)).toThrowError(
      expect.objectContaining({ code: 'invalid-manifest' }),
    )
  })
})
