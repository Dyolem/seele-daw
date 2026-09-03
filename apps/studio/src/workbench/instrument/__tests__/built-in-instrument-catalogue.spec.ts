import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_INSTRUMENT_CATALOGUE,
  BUILT_IN_INSTRUMENT_CATALOGUE_GROUPS,
  DEFAULT_BUILT_IN_INSTRUMENT,
  findBuiltInInstrumentCatalogueEntry,
} from '@/workbench/instrument/built-in-instrument-catalogue'

const EXPECTED_IDENTITIES = [
  ['studio-grand', 'Studio Grand', 'keyboard'],
  ['acoustic-bass', 'Acoustic Bass', 'bass'],
  ['solo-violin', 'Violin', 'strings'],
  ['viola-section', 'Viola', 'strings'],
  ['cello-section', 'Cello', 'strings'],
  ['double-bass-section', 'Contrabass', 'strings'],
  ['string-ensemble-tremolo', 'Tremolo Strings', 'strings'],
  ['string-ensemble-pizzicato', 'Pizzicato Strings', 'strings'],
  ['orchestral-harp', 'Harp', 'strings'],
  ['string-ensemble', 'String Ensemble', 'strings'],
  ['trumpet', 'Trumpet', 'brass'],
  ['muted-trumpet', 'Muted Trumpet', 'brass'],
  ['trombone', 'Trombone', 'brass'],
  ['tuba', 'Tuba', 'brass'],
  ['french-horn', 'French Horn', 'brass'],
  ['brass-ensemble', 'Brass Ensemble', 'brass'],
  ['oboe', 'Oboe', 'woodwind'],
  ['bassoon', 'Bassoon', 'woodwind'],
  ['clarinet', 'Clarinet', 'woodwind'],
  ['flute', 'Flute', 'woodwind'],
  ['timpani', 'Timpani', 'percussion'],
  ['general-midi-percussion', 'General MIDI Percussion', 'drum-kit'],
] as const

describe('built-in Instrument Catalogue', () => {
  it('freezes the reviewed 22-entry product identity, presentation, and asset mapping', () => {
    expect(
      BUILT_IN_INSTRUMENT_CATALOGUE.map(({ displayName, family, soundbankId }) => [
        soundbankId,
        displayName,
        family,
      ]),
    ).toEqual(EXPECTED_IDENTITIES)
    expect(BUILT_IN_INSTRUMENT_CATALOGUE.map(({ assetBasePathname }) => assetBasePathname)).toEqual(
      EXPECTED_IDENTITIES.map(([soundbankId]) => `/soundbanks/generated/${soundbankId}/`),
    )
    expect(new Set(BUILT_IN_INSTRUMENT_CATALOGUE.map(({ soundbankId }) => soundbankId)).size).toBe(
      22,
    )
    expect(BUILT_IN_INSTRUMENT_CATALOGUE.every((entry) => Object.isFrozen(entry))).toBe(true)
    expect(Object.isFrozen(BUILT_IN_INSTRUMENT_CATALOGUE)).toBe(true)
  })

  it('groups the same entries for the Inspector without creating a second identity mapping', () => {
    expect(
      BUILT_IN_INSTRUMENT_CATALOGUE_GROUPS.map(({ displayName, instruments }) => [
        displayName,
        instruments.map(({ soundbankId }) => soundbankId),
      ]),
    ).toEqual([
      ['Keyboard', ['studio-grand']],
      ['Bass', ['acoustic-bass']],
      [
        'Strings',
        [
          'solo-violin',
          'viola-section',
          'cello-section',
          'double-bass-section',
          'string-ensemble-tremolo',
          'string-ensemble-pizzicato',
          'orchestral-harp',
          'string-ensemble',
        ],
      ],
      ['Brass', ['trumpet', 'muted-trumpet', 'trombone', 'tuba', 'french-horn', 'brass-ensemble']],
      ['Woodwind', ['oboe', 'bassoon', 'clarinet', 'flute']],
      ['Percussion', ['timpani']],
      ['Drum kit', ['general-midi-percussion']],
    ])
    expect(BUILT_IN_INSTRUMENT_CATALOGUE_GROUPS.flatMap(({ instruments }) => instruments)).toEqual(
      BUILT_IN_INSTRUMENT_CATALOGUE,
    )
  })

  it('uses Studio Grand as the default and rejects unknown or malformed identities', () => {
    expect(DEFAULT_BUILT_IN_INSTRUMENT).toBe(BUILT_IN_INSTRUMENT_CATALOGUE[0])
    expect(findBuiltInInstrumentCatalogueEntry('studio-grand')).toBe(DEFAULT_BUILT_IN_INSTRUMENT)
    expect(findBuiltInInstrumentCatalogueEntry('unknown-orchestral-bank')).toBeNull()
    expect(findBuiltInInstrumentCatalogueEntry(' studio-grand ')).toBeNull()
  })
})
