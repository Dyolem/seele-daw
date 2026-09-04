import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_INSTRUMENT_CATALOGUE,
  BUILT_IN_INSTRUMENT_ENGINE,
  BUILT_IN_INSTRUMENT_PRESETS,
  BUILT_IN_INSTRUMENT_PRESET_GROUPS,
  BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND,
  DEFAULT_BUILT_IN_INSTRUMENT,
  GENERAL_MIDI_PERCUSSION_INSTRUMENT,
  GENERAL_MIDI_PROGRAM_ROUTES,
  GENERAL_MIDI_PROGRAM_ROUTE_GROUPS,
  findAvailableBuiltInInstrumentPreset,
  findBuiltInInstrumentCatalogueEntry,
  findGeneralMidiProgramRoute,
} from '@/workbench/instrument/built-in-instrument-catalogue'

describe('built-in Instrument Catalogue', () => {
  it('owns one explicit reviewed route for every zero-based General MIDI Program', () => {
    expect(GENERAL_MIDI_PROGRAM_ROUTES).toHaveLength(128)
    expect(GENERAL_MIDI_PROGRAM_ROUTES.map(({ programNumber }) => programNumber)).toEqual(
      Array.from({ length: 128 }, (_, programNumber) => programNumber),
    )
    expect(
      new Set(GENERAL_MIDI_PROGRAM_ROUTES.map(({ programNumber }) => programNumber)).size,
    ).toBe(128)
    expect(GENERAL_MIDI_PROGRAM_ROUTES.every((route) => Object.isFrozen(route))).toBe(true)
    expect(Object.isFrozen(GENERAL_MIDI_PROGRAM_ROUTES)).toBe(true)
  })

  it('separates playable sample routes from the two unavailable synth runtimes', () => {
    const available = GENERAL_MIDI_PROGRAM_ROUTES.filter(
      (route) => route.availability === 'available',
    )
    const unavailable = GENERAL_MIDI_PROGRAM_ROUTES.filter(
      (route) => route.availability === 'runtime-unavailable',
    )

    expect(available).toHaveLength(108)
    expect(
      available.filter(
        ({ mappingKind }) => mappingKind === BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
      ),
    ).toHaveLength(63)
    expect(
      available.filter(
        ({ mappingKind }) => mappingKind === BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.APPROXIMATE,
      ),
    ).toHaveLength(45)
    expect(
      unavailable.filter(({ engine }) => engine === BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH),
    ).toHaveLength(18)
    expect(
      unavailable.filter(({ engine }) => engine === BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH),
    ).toHaveLength(2)

    expect(findGeneralMidiProgramRoute(0)).toMatchObject({
      availability: 'available',
      generalMidiDisplayName: 'Acoustic Grand Piano',
      soundbankId: 'studio-grand',
    })
    expect(findGeneralMidiProgramRoute(31)).toMatchObject({
      availability: 'available',
      mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.APPROXIMATE,
      soundbankId: 'guitar-power-chord',
    })
    expect(findGeneralMidiProgramRoute(80)).toEqual({
      availability: 'runtime-unavailable',
      engine: BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH,
      generalMidiDisplayName: 'Lead 1 (square)',
      programNumber: 80,
      sourceDisplayName: '80s Square Lead',
    })
    expect(findGeneralMidiProgramRoute(109)).toMatchObject({
      availability: 'runtime-unavailable',
      engine: BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH,
      sourceDisplayName: 'Bagpipe',
    })
    expect(findGeneralMidiProgramRoute(128)).toBeNull()
    expect(findGeneralMidiProgramRoute('40')).toBeNull()
  })

  it('keeps GM fallbacks separate from the complete 289-Soundbank playable Catalogue', () => {
    expect(BUILT_IN_INSTRUMENT_CATALOGUE).toHaveLength(289)
    expect(new Set(BUILT_IN_INSTRUMENT_CATALOGUE.map(({ soundbankId }) => soundbankId)).size).toBe(
      289,
    )
    expect(BUILT_IN_INSTRUMENT_CATALOGUE.every((entry) => Object.isFrozen(entry))).toBe(true)
    expect(BUILT_IN_INSTRUMENT_CATALOGUE.map(({ assetBasePathname }) => assetBasePathname)).toEqual(
      BUILT_IN_INSTRUMENT_CATALOGUE.map(
        ({ soundbankId }) => `/soundbanks/generated/${soundbankId}/`,
      ),
    )
    expect(Object.isFrozen(BUILT_IN_INSTRUMENT_CATALOGUE)).toBe(true)

    expect(
      GENERAL_MIDI_PROGRAM_ROUTES.filter(
        (route) => route.availability === 'available' && route.soundbankId === 'electric-piano',
      ).map(({ programNumber }) => programNumber),
    ).toEqual([4, 5])
    expect(
      GENERAL_MIDI_PROGRAM_ROUTES.filter(
        (route) => route.availability === 'available' && route.soundbankId === 'flute',
      ).map(({ programNumber }) => programNumber),
    ).toEqual([72, 73, 74, 77])
  })

  it('groups all 439 source Presets without hiding unavailable synth engines', () => {
    expect(BUILT_IN_INSTRUMENT_PRESETS).toHaveLength(439)
    expect(
      BUILT_IN_INSTRUMENT_PRESETS.filter(({ availability }) => availability === 'available'),
    ).toHaveLength(289)
    expect(
      BUILT_IN_INSTRUMENT_PRESETS.filter(
        ({ engine }) => engine === BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH,
      ),
    ).toHaveLength(139)
    expect(
      BUILT_IN_INSTRUMENT_PRESETS.filter(
        ({ engine }) => engine === BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH,
      ),
    ).toHaveLength(11)
    expect(
      BUILT_IN_INSTRUMENT_PRESET_GROUPS.map(({ categoryId, presets }) => [
        categoryId,
        presets.length,
      ]),
    ).toEqual([
      ['piano', 23],
      ['guitars', 20],
      ['bass', 14],
      ['strings', 34],
      ['brass', 17],
      ['wind', 12],
      ['voices', 11],
      ['percussion', 18],
      ['drum-kit', 46],
      ['drum-pads', 42],
      ['synth-bass', 74],
      ['synth-keys', 46],
      ['synth-leads', 42],
      ['synth-pads', 39],
      ['special-effects', 1],
    ])
    expect(BUILT_IN_INSTRUMENT_PRESET_GROUPS.flatMap(({ presets }) => presets)).toHaveLength(439)
    expect(Object.isFrozen(BUILT_IN_INSTRUMENT_PRESETS)).toBe(true)
    expect(Object.isFrozen(BUILT_IN_INSTRUMENT_PRESET_GROUPS)).toBe(true)

    expect(findAvailableBuiltInInstrumentPreset('studio-grand')).toMatchObject({
      categoryId: 'piano',
      displayName: 'Studio Grand',
      sourcePresetId: 'studio-grand-v2-v4',
    })
    expect(findAvailableBuiltInInstrumentPreset('80s-square-lead')).toBeNull()
  })

  it('groups the 128 Programs into the standard sixteen eight-Program families', () => {
    expect(
      GENERAL_MIDI_PROGRAM_ROUTE_GROUPS.map(({ displayName, routes }) => [
        displayName,
        routes.map(({ programNumber }) => programNumber),
      ]),
    ).toEqual([
      ['Piano', [0, 1, 2, 3, 4, 5, 6, 7]],
      ['Chromatic percussion', [8, 9, 10, 11, 12, 13, 14, 15]],
      ['Organ', [16, 17, 18, 19, 20, 21, 22, 23]],
      ['Guitar', [24, 25, 26, 27, 28, 29, 30, 31]],
      ['Bass', [32, 33, 34, 35, 36, 37, 38, 39]],
      ['Strings', [40, 41, 42, 43, 44, 45, 46, 47]],
      ['Ensemble', [48, 49, 50, 51, 52, 53, 54, 55]],
      ['Brass', [56, 57, 58, 59, 60, 61, 62, 63]],
      ['Reed', [64, 65, 66, 67, 68, 69, 70, 71]],
      ['Pipe', [72, 73, 74, 75, 76, 77, 78, 79]],
      ['Synth lead', [80, 81, 82, 83, 84, 85, 86, 87]],
      ['Synth pad', [88, 89, 90, 91, 92, 93, 94, 95]],
      ['Synth effects', [96, 97, 98, 99, 100, 101, 102, 103]],
      ['Ethnic', [104, 105, 106, 107, 108, 109, 110, 111]],
      ['Percussive', [112, 113, 114, 115, 116, 117, 118, 119]],
      ['Sound effects', [120, 121, 122, 123, 124, 125, 126, 127]],
    ])
    expect(GENERAL_MIDI_PROGRAM_ROUTE_GROUPS.flatMap(({ routes }) => routes)).toEqual(
      GENERAL_MIDI_PROGRAM_ROUTES,
    )
  })

  it('keeps stable defaults and rejects unknown or malformed persisted identities', () => {
    expect(DEFAULT_BUILT_IN_INSTRUMENT.soundbankId).toBe('studio-grand')
    expect(DEFAULT_BUILT_IN_INSTRUMENT.displayName).toBe('Studio Grand')
    expect(GENERAL_MIDI_PERCUSSION_INSTRUMENT.soundbankId).toBe('general-midi-percussion')
    expect(findBuiltInInstrumentCatalogueEntry('studio-grand')).toBe(DEFAULT_BUILT_IN_INSTRUMENT)
    expect(findBuiltInInstrumentCatalogueEntry('unknown-orchestral-bank')).toBeNull()
    expect(findBuiltInInstrumentCatalogueEntry(' studio-grand ')).toBeNull()
  })
})
