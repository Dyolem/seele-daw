import type { SampleAssetBaseUrl, SampleInstrumentResourceCacheLimits } from '@seele-daw/audio-web'
import type { SoundbankId } from '@seele-daw/playback'

import { BUILT_IN_INSTRUMENT_CATALOGUE } from '@/workbench/instrument/built-in-instrument-catalogue'

// Retains over two MI4 reference-score working sets without retaining the full Preset catalogue.
const DEFAULT_DECODED_CACHE_BYTE_LENGTH = 192 * 1_024 * 1_024

export const DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS =
  Object.freeze<SampleInstrumentResourceCacheLimits>({
    maximumDecodedFloat32ByteLength: DEFAULT_DECODED_CACHE_BYTE_LENGTH,
    maximumManifestByteLength: 64 * 1_024,
    // The reviewed 289-Preset snapshot peaks at 4,659,232 encoded bytes for one WAV.
    maximumResourceByteLength: 8 * 1_024 * 1_024,
  })

/** Serves each built-in Soundbank from the developer-local path the Catalogue names. */
export function builtInSampleAssetBaseUrl(origin: string): SampleAssetBaseUrl {
  const locations = new Map<SoundbankId, URL>(
    BUILT_IN_INSTRUMENT_CATALOGUE.map(({ assetBasePathname, soundbankId }) => [
      soundbankId,
      new URL(assetBasePathname, origin),
    ]),
  )
  return (soundbankId) => locations.get(soundbankId) ?? null
}
