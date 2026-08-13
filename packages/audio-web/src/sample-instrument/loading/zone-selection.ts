import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'

export type SampleInstrumentZoneSelectionErrorCode = 'invalid-pitch' | 'unsupported-pitch'

export class SampleInstrumentZoneSelectionError extends TypeError {
  readonly code: SampleInstrumentZoneSelectionErrorCode
  readonly pitch: number

  constructor(code: SampleInstrumentZoneSelectionErrorCode, pitch: number, message: string) {
    super(message)
    this.name = 'SampleInstrumentZoneSelectionError'
    this.code = code
    this.pitch = pitch
  }
}

function assertMidiPitch(pitch: number): void {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
    throw new SampleInstrumentZoneSelectionError(
      'invalid-pitch',
      pitch,
      'expected a MIDI pitch from 0 through 127',
    )
  }
}

function zoneMatchesPitch(zone: SampleInstrumentZoneV1, pitch: number): boolean {
  return zone.selector.kind === 'exact-midi'
    ? zone.selector.pitch === pitch
    : zone.selector.minimumPitch <= pitch && pitch <= zone.selector.maximumPitch
}

export function findSampleInstrumentZoneForPitch(
  manifest: SampleInstrumentManifestV1,
  pitch: number,
): SampleInstrumentZoneV1 | null {
  assertMidiPitch(pitch)
  return manifest.zones.find((zone) => zoneMatchesPitch(zone, pitch)) ?? null
}

export function collectSampleInstrumentResourceKeysForPitches(
  manifest: SampleInstrumentManifestV1,
  pitches: readonly number[],
): readonly string[] {
  const keys = new Set<string>()
  for (const pitch of pitches) {
    const zone = findSampleInstrumentZoneForPitch(manifest, pitch)
    if (zone === null) {
      throw new SampleInstrumentZoneSelectionError(
        'unsupported-pitch',
        pitch,
        `Manifest does not cover MIDI pitch ${pitch}`,
      )
    }
    keys.add(zone.resource.key)
  }
  return Object.freeze([...keys].sort())
}
