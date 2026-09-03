import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import { BUILT_IN_INSTRUMENT_CATALOGUE } from '@/workbench/instrument/built-in-instrument-catalogue'
import { createDefaultBuiltInSampleAssetLocations } from '@/workbench/project/playback/browser-runtime'

describe('Browser Project Playback Runtime built-in locations', () => {
  it('projects every Catalogue entry to its same-origin developer asset base', () => {
    const locations = createDefaultBuiltInSampleAssetLocations('https://studio.example.test')

    expect([...locations.keys()]).toEqual(
      BUILT_IN_INSTRUMENT_CATALOGUE.map(({ soundbankId }) => soundbankId),
    )
    expect(locations.get(parseSoundbankId('studio-grand'))?.href).toBe(
      'https://studio.example.test/soundbanks/generated/studio-grand/',
    )
    expect(locations.get(parseSoundbankId('general-midi-percussion'))?.href).toBe(
      'https://studio.example.test/soundbanks/generated/general-midi-percussion/',
    )
    expect(locations.get(parseSoundbankId('unknown-bank'))).toBeUndefined()
  })
})
