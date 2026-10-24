import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'

function zoneMatchesPitch(zone: SampleInstrumentZoneV1, pitch: number): boolean {
  return zone.selector.kind === 'exact-midi'
    ? zone.selector.pitch === pitch
    : zone.selector.minimumPitch <= pitch && pitch <= zone.selector.maximumPitch
}

/** The Zone that plays `pitch`; null when the Manifest has none for it. */
export function findSampleInstrumentZoneForPitch(
  manifest: SampleInstrumentManifestV1,
  pitch: number,
): SampleInstrumentZoneV1 | null {
  return manifest.zones.find((zone) => zoneMatchesPitch(zone, pitch)) ?? null
}
