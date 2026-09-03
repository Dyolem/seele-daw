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

export const BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND = Object.freeze({
  APPROXIMATE: 'approximate',
  EXACT: 'exact',
} as const)

export type BuiltInInstrumentProgramMappingKind =
  (typeof BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND)[keyof typeof BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND]

export type BuiltInInstrumentMidiImportRoute =
  | {
      readonly kind: 'program'
      readonly mappingKind: BuiltInInstrumentProgramMappingKind
      readonly programNumber: number
    }
  | { readonly kind: 'percussion-channel' }

export interface BuiltInInstrumentCatalogueEntry {
  readonly assetBasePathname: string
  readonly displayName: string
  readonly family: BuiltInInstrumentFamily
  readonly midiImportRoute: BuiltInInstrumentMidiImportRoute
  readonly soundbankId: SoundbankId
}

export interface BuiltInInstrumentCatalogueGroup {
  readonly displayName: string
  readonly family: BuiltInInstrumentFamily
  readonly instruments: readonly BuiltInInstrumentCatalogueEntry[]
}

interface CatalogueEntryBaseInput {
  readonly displayName: string
  readonly family: BuiltInInstrumentFamily
  readonly soundbankId: string
}

type CatalogueEntryInput = CatalogueEntryBaseInput &
  (
    | {
        readonly gmProgramNumber: number
        readonly mappingKind: BuiltInInstrumentProgramMappingKind
      }
    | { readonly generalMidiPercussion: true }
  )

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
  let midiImportRoute: BuiltInInstrumentMidiImportRoute
  if ('gmProgramNumber' in input) {
    if (
      !Number.isSafeInteger(input.gmProgramNumber) ||
      input.gmProgramNumber < 0 ||
      input.gmProgramNumber > 127
    ) {
      throw new TypeError(`Invalid GM Program route for ${soundbankId}`)
    }
    midiImportRoute = Object.freeze({
      kind: 'program',
      mappingKind: input.mappingKind,
      programNumber: input.gmProgramNumber,
    })
  } else {
    midiImportRoute = Object.freeze({ kind: 'percussion-channel' })
  }
  return Object.freeze({
    assetBasePathname: `/soundbanks/generated/${soundbankId}/`,
    displayName: input.displayName,
    family: input.family,
    midiImportRoute,
    soundbankId,
  })
}

export const BUILT_IN_INSTRUMENT_CATALOGUE = Object.freeze([
  createEntry({
    displayName: 'Studio Grand',
    family: BUILT_IN_INSTRUMENT_FAMILY.KEYBOARD,
    gmProgramNumber: 0,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'studio-grand',
  }),
  createEntry({
    displayName: 'Acoustic Bass',
    family: BUILT_IN_INSTRUMENT_FAMILY.BASS,
    gmProgramNumber: 32,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'acoustic-bass',
  }),
  createEntry({
    displayName: 'Violin',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 40,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'solo-violin',
  }),
  createEntry({
    displayName: 'Viola',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 41,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'viola-section',
  }),
  createEntry({
    displayName: 'Cello',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 42,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'cello-section',
  }),
  createEntry({
    displayName: 'Contrabass',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 43,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'double-bass-section',
  }),
  createEntry({
    displayName: 'Tremolo Strings',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 44,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'string-ensemble-tremolo',
  }),
  createEntry({
    displayName: 'Pizzicato Strings',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 45,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'string-ensemble-pizzicato',
  }),
  createEntry({
    displayName: 'Harp',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 46,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'orchestral-harp',
  }),
  createEntry({
    displayName: 'String Ensemble',
    family: BUILT_IN_INSTRUMENT_FAMILY.STRINGS,
    gmProgramNumber: 48,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'string-ensemble',
  }),
  createEntry({
    displayName: 'Trumpet',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    gmProgramNumber: 56,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'trumpet',
  }),
  createEntry({
    displayName: 'Muted Trumpet',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    gmProgramNumber: 59,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'muted-trumpet',
  }),
  createEntry({
    displayName: 'Trombone',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    gmProgramNumber: 57,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'trombone',
  }),
  createEntry({
    displayName: 'Tuba',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    gmProgramNumber: 58,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'tuba',
  }),
  createEntry({
    displayName: 'French Horn',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    gmProgramNumber: 60,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'french-horn',
  }),
  createEntry({
    displayName: 'Brass Ensemble',
    family: BUILT_IN_INSTRUMENT_FAMILY.BRASS,
    gmProgramNumber: 61,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'brass-ensemble',
  }),
  createEntry({
    displayName: 'Oboe',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    gmProgramNumber: 68,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'oboe',
  }),
  createEntry({
    displayName: 'Bassoon',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    gmProgramNumber: 70,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'bassoon',
  }),
  createEntry({
    displayName: 'Clarinet',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    gmProgramNumber: 71,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'clarinet',
  }),
  createEntry({
    displayName: 'Flute',
    family: BUILT_IN_INSTRUMENT_FAMILY.WOODWIND,
    gmProgramNumber: 73,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'flute',
  }),
  createEntry({
    displayName: 'Timpani',
    family: BUILT_IN_INSTRUMENT_FAMILY.PERCUSSION,
    gmProgramNumber: 47,
    mappingKind: BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    soundbankId: 'timpani',
  }),
  createEntry({
    displayName: 'General MIDI Percussion',
    family: BUILT_IN_INSTRUMENT_FAMILY.DRUM_KIT,
    generalMidiPercussion: true,
    soundbankId: 'general-midi-percussion',
  }),
] satisfies readonly BuiltInInstrumentCatalogueEntry[])

const entryBySoundbankId = new Map(
  BUILT_IN_INSTRUMENT_CATALOGUE.map((entry) => [entry.soundbankId, entry] as const),
)
const programRouteEntries = BUILT_IN_INSTRUMENT_CATALOGUE.filter(
  ({ midiImportRoute }) => midiImportRoute.kind === 'program',
)
const entryByProgramNumber = new Map(
  programRouteEntries.flatMap((entry) =>
    entry.midiImportRoute.kind === 'program'
      ? [[entry.midiImportRoute.programNumber, entry] as const]
      : [],
  ),
)
if (entryByProgramNumber.size !== programRouteEntries.length) {
  throw new TypeError('Built-in Instrument Catalogue contains duplicate GM Program routes')
}
const percussionRouteEntries = BUILT_IN_INSTRUMENT_CATALOGUE.filter(
  ({ midiImportRoute }) => midiImportRoute.kind === 'percussion-channel',
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

export const GENERAL_MIDI_PERCUSSION_INSTRUMENT =
  percussionRouteEntries.length === 1
    ? percussionRouteEntries[0]!
    : (() => {
        throw new TypeError(
          'Built-in Instrument Catalogue requires exactly one General MIDI Percussion route',
        )
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

/** Resolves only explicitly reviewed zero-based GM Program routes. */
export function findBuiltInInstrumentByProgramNumber(
  programNumberInput: unknown,
): BuiltInInstrumentCatalogueEntry | null {
  if (
    typeof programNumberInput !== 'number' ||
    !Number.isSafeInteger(programNumberInput) ||
    programNumberInput < 0 ||
    programNumberInput > 127
  ) {
    return null
  }
  return entryByProgramNumber.get(programNumberInput) ?? null
}
