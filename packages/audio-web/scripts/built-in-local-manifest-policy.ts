import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest-validator'
import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'

export const BUILT_IN_LOCAL_MANIFEST_POLICY = Object.freeze({
  generalMidiPercussionV1: 'general-midi-percussion-v1',
  preserveSourceControlsV1: 'preserve-source-controls-v1',
} as const)

export type BuiltInLocalManifestPolicy =
  (typeof BUILT_IN_LOCAL_MANIFEST_POLICY)[keyof typeof BUILT_IN_LOCAL_MANIFEST_POLICY]

export type BuiltInLocalManifestPolicyErrorCode =
  | 'policy-manifest-mismatch'
  | 'policy-source-mismatch'
  | 'unsupported-policy'

export class BuiltInLocalManifestPolicyError extends TypeError {
  readonly code: BuiltInLocalManifestPolicyErrorCode
  readonly detail: string

  constructor(code: BuiltInLocalManifestPolicyErrorCode, message: string) {
    super(message)
    this.name = 'BuiltInLocalManifestPolicyError'
    this.code = code
    this.detail = message
  }
}

export interface ApplyBuiltInLocalManifestPolicyOptions {
  readonly policy: BuiltInLocalManifestPolicy
  readonly sourceSlug: string
}

const GENERAL_MIDI_PERCUSSION_SOURCE_SLUG = 'general-midi-drums-v2-v4'
const GENERAL_MIDI_PERCUSSION_SOUNDBANK_ID = 'general-midi-percussion'
const GENERAL_MIDI_PERCUSSION_MINIMUM_PITCH = 35
const GENERAL_MIDI_PERCUSSION_MAXIMUM_PITCH = 81
const GENERAL_MIDI_HI_HAT_PITCHES = new Set([42, 44, 46])
const GENERAL_MIDI_HI_HAT_EXCLUSIVE_GROUP = Object.freeze({
  groupId: 1,
  offByGroupId: 1,
  offMode: 'fast' as const,
})

function fail(code: BuiltInLocalManifestPolicyErrorCode, message: string): never {
  throw new BuiltInLocalManifestPolicyError(code, message)
}

function assertGeneralMidiPercussionZone(
  zone: SampleInstrumentZoneV1 | undefined,
  expectedPitch: number,
): asserts zone is SampleInstrumentZoneV1 {
  if (
    zone === undefined ||
    zone.selector.kind !== 'exact-midi' ||
    zone.selector.pitch !== expectedPitch ||
    zone.rootMidiPitch !== expectedPitch
  ) {
    fail(
      'policy-manifest-mismatch',
      `General MIDI Percussion requires one exact-key root-matched Zone for MIDI pitch ${expectedPitch}`,
    )
  }
  if (zone.triggerMode !== 'gated' || zone.loop.kind !== 'none' || zone.exclusiveGroup !== null) {
    fail(
      'policy-manifest-mismatch',
      `General MIDI Percussion pitch ${expectedPitch} no longer matches the reviewed gated, no-loop, no-group source contract`,
    )
  }
}

function applyGeneralMidiPercussionV1(
  manifest: SampleInstrumentManifestV1,
  sourceSlug: string,
): SampleInstrumentManifestV1 {
  if (sourceSlug !== GENERAL_MIDI_PERCUSSION_SOURCE_SLUG) {
    fail(
      'policy-source-mismatch',
      `General MIDI Percussion V1 requires reviewed source ${GENERAL_MIDI_PERCUSSION_SOURCE_SLUG}`,
    )
  }
  if (
    manifest.soundbankId !== GENERAL_MIDI_PERCUSSION_SOUNDBANK_ID ||
    manifest.displayName !== 'General MIDI Percussion'
  ) {
    fail(
      'policy-manifest-mismatch',
      'General MIDI Percussion V1 requires the reviewed product and display identity',
    )
  }

  const expectedZoneCount =
    GENERAL_MIDI_PERCUSSION_MAXIMUM_PITCH - GENERAL_MIDI_PERCUSSION_MINIMUM_PITCH + 1
  if (manifest.zones.length !== expectedZoneCount) {
    fail(
      'policy-manifest-mismatch',
      `General MIDI Percussion V1 requires exactly ${expectedZoneCount} reviewed Zones`,
    )
  }

  const transformedZones = manifest.zones.map((zone, index) => {
    const expectedPitch = GENERAL_MIDI_PERCUSSION_MINIMUM_PITCH + index
    assertGeneralMidiPercussionZone(zone, expectedPitch)
    return {
      ...zone,
      exclusiveGroup: GENERAL_MIDI_HI_HAT_PITCHES.has(expectedPitch)
        ? GENERAL_MIDI_HI_HAT_EXCLUSIVE_GROUP
        : null,
      triggerMode: 'one-shot' as const,
    }
  })

  return parseSampleInstrumentManifestV1({
    ...manifest,
    zones: transformedZones,
  })
}

/** Applies only explicit reviewed product corrections after source-format adaptation. */
export function applyBuiltInLocalManifestPolicy(
  manifest: SampleInstrumentManifestV1,
  options: ApplyBuiltInLocalManifestPolicyOptions,
): SampleInstrumentManifestV1 {
  if (options.policy === BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1) return manifest
  if (options.policy === BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1) {
    return applyGeneralMidiPercussionV1(manifest, options.sourceSlug)
  }
  return fail(
    'unsupported-policy',
    `Unsupported built-in Manifest policy: ${String(options.policy)}`,
  )
}
