import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import { BUILT_IN_INSTRUMENT_CATALOGUE } from '@/workbench/instrument/built-in-instrument-catalogue'
import {
  DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS,
  builtInSampleAssetBaseUrl,
} from '@/workbench/instrument/built-in-sample-assets'

describe('built-in sample assets', () => {
  it('serves every Catalogue entry from its same-origin developer asset path', () => {
    const assetBaseUrl = builtInSampleAssetBaseUrl('https://studio.example.test')

    expect(DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS.maximumResourceByteLength).toBe(
      8 * 1_024 * 1_024,
    )
    for (const { soundbankId } of BUILT_IN_INSTRUMENT_CATALOGUE) {
      expect(assetBaseUrl(soundbankId)).not.toBeNull()
    }
    expect(String(assetBaseUrl(parseSoundbankId('studio-grand')))).toBe(
      'https://studio.example.test/soundbanks/generated/studio-grand/',
    )
    expect(String(assetBaseUrl(parseSoundbankId('general-midi-percussion')))).toBe(
      'https://studio.example.test/soundbanks/generated/general-midi-percussion/',
    )
    expect(assetBaseUrl(parseSoundbankId('unknown-bank'))).toBeNull()
  })
})
