import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_INSTRUMENT_CATALOGUE,
  BUILT_IN_INSTRUMENT_CATALOGUE_GROUPS,
  BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND,
  DEFAULT_BUILT_IN_INSTRUMENT,
  GENERAL_MIDI_PERCUSSION_INSTRUMENT,
  findBuiltInInstrumentByProgramNumber,
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

const EXPECTED_PROGRAM_ROUTES = [
  [0, 'studio-grand'],
  [32, 'acoustic-bass'],
  [40, 'solo-violin'],
  [41, 'viola-section'],
  [42, 'cello-section'],
  [43, 'double-bass-section'],
  [44, 'string-ensemble-tremolo'],
  [45, 'string-ensemble-pizzicato'],
  [46, 'orchestral-harp'],
  [48, 'string-ensemble'],
  [56, 'trumpet'],
  [59, 'muted-trumpet'],
  [57, 'trombone'],
  [58, 'tuba'],
  [60, 'french-horn'],
  [61, 'brass-ensemble'],
  [68, 'oboe'],
  [70, 'bassoon'],
  [71, 'clarinet'],
  [73, 'flute'],
  [47, 'timpani'],
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
    expect(
      BUILT_IN_INSTRUMENT_CATALOGUE.every(({ midiImportRoute }) =>
        Object.isFrozen(midiImportRoute),
      ),
    ).toBe(true)
    expect(Object.isFrozen(BUILT_IN_INSTRUMENT_CATALOGUE)).toBe(true)
  })

  it('owns the reviewed GM Program and Channel 10 routes without duplicate Programs', () => {
    const programRoutes = BUILT_IN_INSTRUMENT_CATALOGUE.flatMap(
      ({ midiImportRoute, soundbankId }) =>
        midiImportRoute.kind === 'program'
          ? [[midiImportRoute.programNumber, soundbankId] as const]
          : [],
    )

    expect(programRoutes).toEqual(EXPECTED_PROGRAM_ROUTES)
    expect(new Set(programRoutes.map(([programNumber]) => programNumber)).size).toBe(
      programRoutes.length,
    )
    expect(
      BUILT_IN_INSTRUMENT_CATALOGUE.filter(
        ({ midiImportRoute }) => midiImportRoute.kind === 'program',
      ).every(
        ({ midiImportRoute }) =>
          midiImportRoute.kind === 'program' &&
          midiImportRoute.mappingKind === BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
      ),
    ).toBe(true)
    expect(GENERAL_MIDI_PERCUSSION_INSTRUMENT).toBe(BUILT_IN_INSTRUMENT_CATALOGUE.at(-1))
    expect(GENERAL_MIDI_PERCUSSION_INSTRUMENT.midiImportRoute).toEqual({
      kind: 'percussion-channel',
    })
    for (const [programNumber, soundbankId] of EXPECTED_PROGRAM_ROUTES) {
      expect(findBuiltInInstrumentByProgramNumber(programNumber)?.soundbankId).toBe(soundbankId)
    }
    expect(findBuiltInInstrumentByProgramNumber(1)).toBeNull()
    expect(findBuiltInInstrumentByProgramNumber(128)).toBeNull()
    expect(findBuiltInInstrumentByProgramNumber('40')).toBeNull()
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
