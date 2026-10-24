import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'

const MIDI_PITCH_COUNT = 128

/** Each Manifest's Zone per MIDI pitch, built on first use; Manifests are cached and frozen. */
const zonesByPitch = new WeakMap<
  SampleInstrumentManifestV1,
  readonly (SampleInstrumentZoneV1 | null)[]
>()

export function sampleInstrumentZoneMatchesPitch(
  zone: SampleInstrumentZoneV1,
  pitch: number,
): boolean {
  return zone.selector.kind === 'exact-midi'
    ? zone.selector.pitch === pitch
    : zone.selector.minimumPitch <= pitch && pitch <= zone.selector.maximumPitch
}

/** The Zone that plays `pitch`; null when the Manifest has none for it. */
export function findSampleInstrumentZoneForPitch(
  manifest: SampleInstrumentManifestV1,
  pitch: number,
): SampleInstrumentZoneV1 | null {
  let zones = zonesByPitch.get(manifest)
  if (zones === undefined) {
    zones = Object.freeze(
      Array.from(
        { length: MIDI_PITCH_COUNT },
        (_, midiPitch) =>
          manifest.zones.find((zone) => sampleInstrumentZoneMatchesPitch(zone, midiPitch)) ?? null,
      ),
    )
    zonesByPitch.set(manifest, zones)
  }
  return zones[pitch] ?? null
}
