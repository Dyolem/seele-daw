import {
  getSampleInstrumentSelectorBounds,
  type SampleInstrumentManifestV1,
  type SampleInstrumentSelectorV1,
  type SampleInstrumentZoneV1,
} from '#internal/sample-instrument/sample-instrument-manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/sample-instrument-manifest-validator'
import type { SupportedWavMetadata } from '#internal/sample-instrument/supported-wav-file'

export type LocalSampleInstrumentPreparationErrorCode =
  | 'invalid-pitch-range'
  | 'missing-pitch'
  | 'missing-resource'
  | 'resource-duration-mismatch'
  | 'unused-resource'

export class LocalSampleInstrumentPreparationError extends TypeError {
  readonly code: LocalSampleInstrumentPreparationErrorCode
  readonly detail: string
  readonly key: string | null

  constructor(
    code: LocalSampleInstrumentPreparationErrorCode,
    message: string,
    key: string | null = null,
  ) {
    super(key === null ? message : `${key}: ${message}`)
    this.name = 'LocalSampleInstrumentPreparationError'
    this.code = code
    this.detail = message
    this.key = key
  }
}

function fail(
  code: LocalSampleInstrumentPreparationErrorCode,
  message: string,
  key: string | null = null,
): never {
  throw new LocalSampleInstrumentPreparationError(code, message, key)
}

function selectorForBounds(minimumPitch: number, maximumPitch: number): SampleInstrumentSelectorV1 {
  return minimumPitch === maximumPitch
    ? Object.freeze({ kind: 'exact-midi', pitch: minimumPitch })
    : Object.freeze({ kind: 'midi-range', maximumPitch, minimumPitch })
}

/** Narrows a validated Manifest to an explicit product pitch range without clamping incoming Notes. */
export function constrainManifestToPitchRange(
  manifest: SampleInstrumentManifestV1,
  minimumPitch: number,
  maximumPitch: number,
): SampleInstrumentManifestV1 {
  if (
    !Number.isInteger(minimumPitch) ||
    !Number.isInteger(maximumPitch) ||
    minimumPitch < 0 ||
    maximumPitch > 127 ||
    minimumPitch > maximumPitch
  ) {
    fail('invalid-pitch-range', 'expected an ordered MIDI pitch range from 0 through 127')
  }

  const zones: SampleInstrumentZoneV1[] = []
  for (const zone of manifest.zones) {
    const [zoneMinimum, zoneMaximum] = getSampleInstrumentSelectorBounds(zone.selector)
    const constrainedMinimum = Math.max(zoneMinimum, minimumPitch)
    const constrainedMaximum = Math.min(zoneMaximum, maximumPitch)
    if (constrainedMinimum > constrainedMaximum) continue
    zones.push({
      ...zone,
      selector: selectorForBounds(constrainedMinimum, constrainedMaximum),
    })
  }

  return parseSampleInstrumentManifestV1({
    ...manifest,
    zones,
  })
}

export function assertManifestPitchCoverage(
  manifest: SampleInstrumentManifestV1,
  minimumPitch: number,
  maximumPitch: number,
): void {
  for (let pitch = minimumPitch; pitch <= maximumPitch; pitch += 1) {
    const covered = manifest.zones.some((zone) => {
      const [zoneMinimum, zoneMaximum] = getSampleInstrumentSelectorBounds(zone.selector)
      return zoneMinimum <= pitch && pitch <= zoneMaximum
    })
    if (!covered) fail('missing-pitch', `Manifest does not cover MIDI pitch ${pitch}`)
  }
}

export function assertManifestResourceDurations(
  manifest: SampleInstrumentManifestV1,
  wavMetadataByResourceKey: ReadonlyMap<string, SupportedWavMetadata>,
): void {
  const usedResourceKeys = new Set<string>()
  for (const zone of manifest.zones) {
    const key = zone.resource.key
    const metadata = wavMetadataByResourceKey.get(key)
    if (metadata === undefined) fail('missing-resource', 'Manifest resource is absent', key)
    if (metadata.frameCount === 0 || zone.startOffsetSecond >= metadata.durationSecond) {
      fail('resource-duration-mismatch', 'start offset does not precede the WAV end', key)
    }
    if (zone.loop.kind !== 'none' && zone.loop.endSecond > metadata.durationSecond) {
      fail('resource-duration-mismatch', 'loop end exceeds the WAV duration', key)
    }
    usedResourceKeys.add(key)
  }

  for (const key of wavMetadataByResourceKey.keys()) {
    if (!usedResourceKeys.has(key))
      fail('unused-resource', 'WAV is not referenced by the Manifest', key)
  }
}
