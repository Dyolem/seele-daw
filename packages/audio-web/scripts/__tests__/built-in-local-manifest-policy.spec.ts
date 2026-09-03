import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest-validator'

import {
  BUILT_IN_LOCAL_MANIFEST_POLICY,
  BuiltInLocalManifestPolicyError,
  applyBuiltInLocalManifestPolicy,
} from '../built-in-local-manifest-policy'

const SOURCE_SLUG = 'general-midi-drums-v2-v4'

function createZone(pitch: number): SampleInstrumentZoneV1 {
  return {
    amplitudeEnvelope: {
      attack: { curve: null, durationSecond: 0 },
      release: { curve: null, durationSecond: 0.133 },
    },
    exclusiveGroup: null,
    loop: { kind: 'none' },
    resource: { key: `samples/${String(pitch).padStart(3, '0')}.wav`, mediaType: 'audio/wav' },
    rootMidiPitch: pitch,
    selector: { kind: 'exact-midi', pitch },
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId: `fixture:${pitch}`,
  }
}

function createGeneralMidiPercussionManifest(
  transformZone: (zone: SampleInstrumentZoneV1, pitch: number) => SampleInstrumentZoneV1 = (zone) =>
    zone,
): SampleInstrumentManifestV1 {
  return parseSampleInstrumentManifestV1({
    displayName: 'General MIDI Percussion',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: parseSoundbankId('general-midi-percussion'),
    zones: Array.from({ length: 47 }, (_, index) => {
      const pitch = 35 + index
      return transformZone(createZone(pitch), pitch)
    }),
  })
}

describe('built-in local Manifest policy', () => {
  it('preserves source-authored controls and Manifest identity without rewriting', () => {
    const manifest = createGeneralMidiPercussionManifest()

    expect(
      applyBuiltInLocalManifestPolicy(manifest, {
        policy: BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1,
        sourceSlug: SOURCE_SLUG,
      }),
    ).toBe(manifest)
  })

  it('makes all reviewed General MIDI drum pitches one-shot and only groups the three hi-hats', () => {
    const manifest = applyBuiltInLocalManifestPolicy(createGeneralMidiPercussionManifest(), {
      policy: BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1,
      sourceSlug: SOURCE_SLUG,
    })

    expect(manifest.zones).toHaveLength(47)
    expect(manifest.zones.every(({ triggerMode }) => triggerMode === 'one-shot')).toBe(true)
    expect(
      manifest.zones
        .filter(({ exclusiveGroup }) => exclusiveGroup !== null)
        .map(({ selector }) => (selector.kind === 'exact-midi' ? selector.pitch : null)),
    ).toEqual([42, 44, 46])
    expect(
      manifest.zones
        .filter(({ exclusiveGroup }) => exclusiveGroup !== null)
        .map(({ exclusiveGroup }) => exclusiveGroup),
    ).toEqual([
      { groupId: 1, offByGroupId: 1, offMode: 'fast' },
      { groupId: 1, offByGroupId: 1, offMode: 'fast' },
      { groupId: 1, offByGroupId: 1, offMode: 'fast' },
    ])
    expect(
      manifest.zones.every(({ amplitudeEnvelope }) => amplitudeEnvelope.release !== null),
    ).toBe(true)
    expect(Object.isFrozen(manifest)).toBe(true)
  })

  it('rejects the percussion policy for an unreviewed source identity', () => {
    expect(() =>
      applyBuiltInLocalManifestPolicy(createGeneralMidiPercussionManifest(), {
        policy: BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1,
        sourceSlug: 'different-source',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BuiltInLocalManifestPolicyError>>({
        code: 'policy-source-mismatch',
      }),
    )
  })

  it.each([
    {
      label: 'a source one-shot flag that bypasses the reviewed conversion boundary',
      transformZone: (zone: SampleInstrumentZoneV1, pitch: number) =>
        pitch === 35 ? { ...zone, triggerMode: 'one-shot' as const } : zone,
    },
    {
      label: 'a non-root-matched drum Zone',
      transformZone: (zone: SampleInstrumentZoneV1, pitch: number) =>
        pitch === 35 ? { ...zone, rootMidiPitch: 36 } : zone,
    },
  ])('rejects $label', ({ transformZone }) => {
    expect(() =>
      applyBuiltInLocalManifestPolicy(createGeneralMidiPercussionManifest(transformZone), {
        policy: BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1,
        sourceSlug: SOURCE_SLUG,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BuiltInLocalManifestPolicyError>>({
        code: 'policy-manifest-mismatch',
      }),
    )
  })
})
