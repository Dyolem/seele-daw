import { parseSoundbankId, type SoundbankId } from '@seele-daw/playback'

export const BUILT_IN_INSTRUMENT_FAMILY = Object.freeze({
  BASS: 'bass',
  BRASS: 'brass',
  DRUM_KIT: 'drum-kit',
  KEYBOARD: 'keyboard',
  PERCUSSION: 'percussion',
  STRINGS: 'strings',
  WOODWIND: 'woodwind',
} as const)

export type BuiltInInstrumentFamily =
  (typeof BUILT_IN_INSTRUMENT_FAMILY)[keyof typeof BUILT_IN_INSTRUMENT_FAMILY]

export interface BuiltInInstrumentCatalogueEntry {
  readonly assetBasePathname: string
  readonly displayName: string
  readonly family: BuiltInInstrumentFamily
  readonly soundbankId: SoundbankId
}

export interface BuiltInInstrumentCatalogueGroup {
  readonly displayName: string
  readonly family: BuiltInInstrumentFamily
  readonly instruments: readonly BuiltInInstrumentCatalogueEntry[]
}

interface CatalogueEntryInput {
  readonly displayName: string
  readonly family: BuiltInInstrumentFamily
  readonly soundbankId: string
}

const FAMILY_PRESENTATION = Object.freeze([
  Object.freeze({ displayName: 'Keyboard', family: BUILT_IN_INSTRUMENT_FAMILY.KEYBOARD }),
  Object.freeze({ displayName: 'Bass', family: BUILT_IN_INSTRUMENT_FAMILY.BASS }),
  Object.freeze({ displayName: 'Strings', family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS }),
  Object.freeze({ displayName: 'Brass', family: BUILT_IN_INSTRUMENT_FAMILY.BRASS }),
  Object.freeze({ displayName: 'Woodwind', family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND }),
  Object.freeze({ displayName: 'Percussion', family: BUILT_IN_INSTRUMENT_FAMILY.PERCUSSION }),
  Object.freeze({ displayName: 'Drum kit', family: BUILT_IN_INSTRUMENT_FAMILY.DRUM_KIT }),
] as const)

function createEntry(input: CatalogueEntryInput): BuiltInInstrumentCatalogueEntry {
  const soundbankId = parseSoundbankId(input.soundbankId)
  return Object.freeze({
    assetBasePathname: `/soundbanks/generated/${soundbankId}/`,
    displayName: input.displayName,
    family: input.family,
    soundbankId,
  })
}

export const BUILT_IN_INSTRUMENT_CATALOGUE = Object.freeze([
  createEntry({
    displayName: 'Studio Grand',
    family: BUILT_IN_INSTRUMENT_FAMILY.KEYBOARD,
    soundbankId: 'studio-grand',
  }),
  createEntry({
    displayName: 'Acoustic Bass',
    family: BUILT_IN_INSTRUMENT_FAMILY.BASS,
    soundbankId: 'acoustic-bass',
  }),
  createEntry({
    displayName: 'Violin',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'solo-violin',
  }),
  createEntry({
    displayName: 'Viola',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'viola-section',
  }),
  createEntry({
    displayName: 'Cello',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'cello-section',
  }),
  createEntry({
    displayName: 'Contrabass',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'double-bass-section',
  }),
  createEntry({
    displayName: 'Tremolo Strings',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'string-ensemble-tremolo',
  }),
  createEntry({
    displayName: 'Pizzicato Strings',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'string-ensemble-pizzicato',
  }),
  createEntry({
    displayName: 'Harp',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'orchestral-harp',
  }),
  createEntry({
    displayName: 'String Ensemble',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    soundbankId: 'string-ensemble',
  }),
  createEntry({
    displayName: 'Trumpet',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    soundbankId: 'trumpet',
  }),
  createEntry({
    displayName: 'Muted Trumpet',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    soundbankId: 'muted-trumpet',
  }),
  createEntry({
    displayName: 'Trombone',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    soundbankId: 'trombone',
  }),
  createEntry({
    displayName: 'Tuba',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    soundbankId: 'tuba',
  }),
  createEntry({
    displayName: 'French Horn',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    soundbankId: 'french-horn',
  }),
  createEntry({
    displayName: 'Brass Ensemble',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    soundbankId: 'brass-ensemble',
  }),
  createEntry({
    displayName: 'Oboe',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    soundbankId: 'oboe',
  }),
  createEntry({
    displayName: 'Bassoon',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    soundbankId: 'bassoon',
  }),
  createEntry({
    displayName: 'Clarinet',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    soundbankId: 'clarinet',
  }),
  createEntry({
    displayName: 'Flute',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    soundbankId: 'flute',
  }),
  createEntry({
    displayName: 'Timpani',
    family: BUILT_IN_INSTRUMENT_FAMILY.PERCUSSION,
    soundbankId: 'timpani',
  }),
  createEntry({
    displayName: 'General MIDI Percussion',
    family: BUILT_IN_INSTRUMENT_FAMILY.DRUM_KIT,
    soundbankId: 'general-midi-percussion',
  }),
] satisfies readonly BuiltInInstrumentCatalogueEntry[])

const entryBySoundbankId = new Map(
  BUILT_IN_INSTRUMENT_CATALOGUE.map((entry) => [entry.soundbankId, entry] as const),
)

export const BUILT_IN_INSTRUMENT_CATALOGUE_GROUPS = Object.freeze(
  FAMILY_PRESENTATION.map(({ displayName, family }) =>
    Object.freeze({
      displayName,
      family,
      instruments: Object.freeze(
        BUILT_IN_INSTRUMENT_CATALOGUE.filter((entry) => entry.family === family),
      ),
    }),
  ),
)

export const DEFAULT_BUILT_IN_INSTRUMENT =
  entryBySoundbankId.get(parseSoundbankId('studio-grand')) ??
  (() => {
    throw new TypeError('Built-in Instrument Catalogue is missing the default Studio Grand')
  })()

/** Resolves only reviewed Studio Catalogue identities; unknown persisted IDs remain missing. */
export function findBuiltInInstrumentCatalogueEntry(
  soundbankIdInput: unknown,
): BuiltInInstrumentCatalogueEntry | null {
  let soundbankId: SoundbankId
  try {
    soundbankId = parseSoundbankId(soundbankIdInput)
  } catch {
    return null
  }
  return entryBySoundbankId.get(soundbankId) ?? null
}
