import { parseSoundbankId, type SoundbankId } from '@seele-daw/playback'

import presetSourceSnapshot from './built-in-instrument-preset-source-snapshot.json'

export const BUILT_IN_INSTRUMENT_ENGINE = Object.freeze({
  FM_SYNTH: 'FMSynth',
  MIDI_SAMPLE_SYNTH: 'MIDISampleSynth',
  VA_SYNTH: 'VASynth',
} as const)

export type BuiltInInstrumentEngine =
  (typeof BUILT_IN_INSTRUMENT_ENGINE)[keyof typeof BUILT_IN_INSTRUMENT_ENGINE]

export const BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND = Object.freeze({
  APPROXIMATE: 'approximate',
  EXACT: 'exact',
} as const)

export type BuiltInInstrumentProgramMappingKind =
  (typeof BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND)[keyof typeof BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND]

export interface BuiltInInstrumentCatalogueEntry {
  readonly assetBasePathname: string
  readonly displayName: string
  readonly soundbankId: SoundbankId
}

export type BuiltInInstrumentPresetCategoryId =
  | 'bass'
  | 'brass'
  | 'drum-kit'
  | 'drum-pads'
  | 'guitars'
  | 'percussion'
  | 'piano'
  | 'special-effects'
  | 'strings'
  | 'synth-bass'
  | 'synth-keys'
  | 'synth-leads'
  | 'synth-pads'
  | 'voices'
  | 'wind'

interface BuiltInInstrumentPresetBase {
  readonly categoryId: BuiltInInstrumentPresetCategoryId
  readonly displayName: string
  readonly generalMidiProgram: number
  readonly isCanonicalForProgram: boolean
  readonly sourcePresetId: string
  readonly subtitle: string
}

export interface AvailableBuiltInInstrumentPreset extends BuiltInInstrumentPresetBase {
  readonly availability: 'available'
  readonly engine: typeof BUILT_IN_INSTRUMENT_ENGINE.MIDI_SAMPLE_SYNTH
  readonly soundbankId: SoundbankId
}

export interface RuntimeUnavailableBuiltInInstrumentPreset extends BuiltInInstrumentPresetBase {
  readonly availability: 'runtime-unavailable'
  readonly engine:
    | typeof BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH
    | typeof BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH
}

export type BuiltInInstrumentPreset =
  | AvailableBuiltInInstrumentPreset
  | RuntimeUnavailableBuiltInInstrumentPreset

export interface BuiltInInstrumentPresetGroup {
  readonly categoryId: BuiltInInstrumentPresetCategoryId
  readonly displayName: string
  readonly presets: readonly BuiltInInstrumentPreset[]
}

interface GeneralMidiProgramRouteBase {
  readonly generalMidiDisplayName: string
  readonly programNumber: number
  readonly sourceDisplayName: string
}

export interface AvailableGeneralMidiProgramRoute extends GeneralMidiProgramRouteBase {
  readonly availability: 'available'
  readonly engine: typeof BUILT_IN_INSTRUMENT_ENGINE.MIDI_SAMPLE_SYNTH
  readonly mappingKind: BuiltInInstrumentProgramMappingKind
  readonly soundbankId: SoundbankId
}

export interface RuntimeUnavailableGeneralMidiProgramRoute extends GeneralMidiProgramRouteBase {
  readonly availability: 'runtime-unavailable'
  readonly engine:
    | typeof BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH
    | typeof BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH
}

export type GeneralMidiProgramRoute =
  | AvailableGeneralMidiProgramRoute
  | RuntimeUnavailableGeneralMidiProgramRoute

export interface GeneralMidiProgramRouteGroup {
  readonly displayName: string
  readonly familyId: string
  readonly firstProgramNumber: number
  readonly lastProgramNumber: number
  readonly routes: readonly GeneralMidiProgramRoute[]
}

type AvailableRouteInput = readonly [
  generalMidiDisplayName: string,
  sourceDisplayName: string,
  soundbankId: string,
  mappingKind: BuiltInInstrumentProgramMappingKind,
]
type RuntimeUnavailableRouteInput = readonly [
  generalMidiDisplayName: string,
  sourceDisplayName: string,
  engine: typeof BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH | typeof BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH,
]
type GeneralMidiProgramRouteInput = AvailableRouteInput | RuntimeUnavailableRouteInput

const E = BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT
const A = BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.APPROXIMATE
const FM = BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH
const VA = BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH

// Program numbers are the zero-based positions in this complete General MIDI Level 1 table.
const GENERAL_MIDI_PROGRAM_ROUTE_INPUTS = Object.freeze([
  // Piano
  ['Acoustic Grand Piano', 'Studio Grand', 'studio-grand', E],
  ['Bright Acoustic Piano', 'Upright Piano', 'upright-piano', E],
  ['Electric Grand Piano', 'Grand Piano', 'grand-piano', A],
  ['Honky-tonk Piano', 'Honky Tonk Piano', 'honky-tonk-piano', E],
  ['Electric Piano 1', 'Electric Piano', 'electric-piano', E],
  ['Electric Piano 2', 'Electric Piano', 'electric-piano', A],
  ['Harpsichord', 'Studio Harpsichord', 'studio-harpsichord', E],
  ['Clavinet', 'Funky Clav', VA],
  // Chromatic percussion
  ['Celesta', 'Vibraphone', 'vibraphone', A],
  ['Glockenspiel', 'Glockenspiel', 'glockenspiel', E],
  ['Music Box', 'Vibraphone', 'vibraphone', A],
  ['Vibraphone', 'Vibraphone', 'vibraphone', E],
  ['Marimba', 'Marimba', 'marimba', E],
  ['Xylophone', 'Xylophone', 'xylophone', E],
  ['Tubular Bells', 'Tubular Bells', 'tubular-bells', E],
  ['Dulcimer', 'Hammered Dulcimer', 'hammered-dulcimer', E],
  // Organ
  ['Drawbar Organ', 'Dark Organ', 'dark-organ', E],
  ['Percussive Organ', 'Fanfare Organ', 'fanfare-organ', A],
  ['Rock Organ', 'Rock Organ', 'rock-organ', E],
  ['Church Organ', 'Church Organ', 'church-organ', E],
  ['Reed Organ', 'Dark Organ', 'dark-organ', A],
  ['Accordion', 'Accordion', 'accordion', E],
  ['Harmonica', 'Harmonica', FM],
  ['Tango Accordion', 'Accordion', 'accordion', A],
  // Guitar
  ['Acoustic Guitar (nylon)', 'Nylon Guitar', 'nylon-guitar', E],
  ['Acoustic Guitar (steel)', 'Acoustic Guitar', 'sparkling-acoustic', E],
  ['Electric Guitar (jazz)', 'Jazz Guitar', 'jazz-guitar', E],
  ['Electric Guitar (clean)', 'Clean Guitar', 'clean-guitar', E],
  ['Electric Guitar (muted)', 'Clean Guitar Muted', 'clean-guitar-muted', E],
  ['Overdriven Guitar', 'Overdriven Guitar', 'overdriven-guitar', E],
  ['Distortion Guitar', 'Overdriven Power Chord', 'overdriven-power-chord', A],
  ['Guitar Harmonics', 'Dirty Power Chord', 'guitar-power-chord', A],
  // Bass
  ['Acoustic Bass', 'Acoustic Bass', 'acoustic-bass', E],
  ['Electric Bass (finger)', "'62 P-Bass", '62-p-bass', E],
  ['Electric Bass (pick)', 'Retro Pick Bass', 'retro-pick-bass', A],
  ['Fretless Bass', 'Dub Bass', 'dub-bass', A],
  ['Slap Bass 1', 'Slap Bass', 'slap-bass', E],
  ['Slap Bass 2', 'Funky Slap', 'funky-slap', A],
  ['Synth Bass 1', 'Deep House', 'deep-house-bass', E],
  ['Synth Bass 2', 'Plucked Vaporbass', VA],
  // Strings
  ['Violin', 'Solo Violin', 'solo-violin', E],
  ['Viola', 'Viola Section', 'viola-section', E],
  ['Cello', 'Cello Section', 'cello-section', E],
  ['Contrabass', 'Double Bass Section', 'double-bass-section', E],
  ['Tremolo Strings', 'Full Strings Tremolo', 'string-ensemble-tremolo', E],
  ['Pizzicato Strings', 'Full Strings Pizzicato', 'string-ensemble-pizzicato', E],
  ['Orchestral Harp', 'Harp', 'orchestral-harp', E],
  ['Timpani', 'Timpani', 'timpani', E],
  // Ensemble
  ['String Ensemble 1', 'String Orchestra', 'string-ensemble', E],
  ['String Ensemble 2', 'String Orchestra', 'string-ensemble', A],
  ['SynthStrings 1', 'Synth Strings', 'synth-strings', E],
  ['SynthStrings 2', 'String Pad', 'string-pad', A],
  ['Choir Aahs', 'Choir Synth', 'choir-synth', A],
  ['Voice Oohs', 'Female Ooh', 'female-ooh', E],
  ['Synth Voice', 'Ahh Synth', 'ahh-synth', A],
  ['Orchestra Hit', 'String Orchestra Stacc', 'string-orchestra-stacc', A],
  // Brass
  ['Trumpet', 'Trumpet', 'trumpet', E],
  ['Trombone', 'Trombone Hard', 'trombone', E],
  ['Tuba', 'Tuba', 'tuba', E],
  ['Muted Trumpet', 'Trumpet Straight Mute', 'muted-trumpet', E],
  ['French Horn', 'French Horn', 'french-horn', E],
  ['Brass Section', 'Full Brass', 'brass-ensemble', E],
  ['SynthBrass 1', 'Sunset Brass', VA],
  ['SynthBrass 2', "Fat 'n Dirty", 'fat-n-dirty', A],
  // Reed
  ['Soprano Sax', 'Alto Saxophone', 'alto-saxophone', A],
  ['Alto Sax', 'Alto Saxophone', 'alto-saxophone', E],
  ['Tenor Sax', 'Tenor Saxophone', 'tenor-saxophone', E],
  ['Baritone Sax', 'Tenor Saxophone', 'tenor-saxophone', A],
  ['Oboe', 'Oboe', 'oboe', E],
  ['English Horn', 'French Horn', 'french-horn', A],
  ['Bassoon', 'Bassoon', 'bassoon', E],
  ['Clarinet', 'Clarinet', 'clarinet', E],
  // Pipe
  ['Piccolo', 'Flute', 'flute', A],
  ['Flute', 'Flute', 'flute', E],
  ['Recorder', 'Flute', 'flute', A],
  ['Pan Flute', 'Pan Flute', 'pan-flute', E],
  ['Blown Bottle', 'Blown Bottle', 'blown-bottle', E],
  ['Shakuhachi', 'Flute', 'flute', A],
  ['Whistle', 'Whistle', 'whistle', E],
  ['Ocarina', 'Blown Bottle', 'blown-bottle', A],
  // Synth lead
  ['Lead 1 (square)', '80s Square Lead', VA],
  ['Lead 2 (sawtooth)', 'Super Saw', VA],
  ['Lead 3 (calliope)', 'Eyelash Synth', 'eyelash-synth', E],
  ['Lead 4 (chiff)', 'FM Lead', 'fm-lead', A],
  ['Lead 5 (charang)', 'Future Pop Stab', 'future-pop-stab', A],
  ['Lead 6 (voice)', 'Lush Vocals', 'lush-vocals', A],
  ['Lead 7 (fifths)', 'Dirty Porto 5th', VA],
  ['Lead 8 (bass + lead)', 'Heavy Lead', 'heavy-lead', E],
  // Synth pad
  ['Pad 1 (new age)', 'New Age Synth', 'new-age-synth', E],
  ['Pad 2 (warm)', 'Warm Pad', 'warm-pad', E],
  ['Pad 3 (polysynth)', 'Retro Juno Pad', 'retro-juno-pad', A],
  ['Pad 4 (choir)', 'Choir Synth', 'choir-synth', E],
  ['Pad 5 (bowed)', 'Borealis Pad', 'borealis-pad', A],
  ['Pad 6 (metallic)', 'Shadow Bells', VA],
  ['Pad 7 (halo)', 'Cloud Fluff', VA],
  ['Pad 8 (sweep)', 'Evolve Pad', 'evolve-pad', E],
  // Synth effects
  ['FX 1 (rain)', 'Blip Perc', VA],
  ['FX 2 (soundtrack)', 'Grand Piano', 'grand-piano', A],
  ['FX 3 (crystal)', 'Swell Pad', 'swell-pad', A],
  ['FX 4 (atmosphere)', 'Atmosphere Pad', 'atmosphere-pad', A],
  ['FX 5 (brightness)', 'Atmosphere Pad', 'atmosphere-pad', A],
  ['FX 6 (goblins)', 'Space Bot', 'space-bot', A],
  ['FX 7 (echoes)', 'Wailer Synth', 'wailer-synth', A],
  ['FX 8 (sci-fi)', 'General MIDI Percussion', 'general-midi-percussion', A],
  // Ethnic
  ['Sitar', 'Sitar', 'sitar', E],
  ['Banjo', 'Banjo', 'banjo', E],
  ['Shamisen', 'Grand Piano', 'grand-piano', A],
  ['Koto', 'Koto', 'koto', E],
  ['Kalimba', 'Kalimba', 'kalimba', E],
  ['Bag Pipe', 'Bagpipe', FM],
  ['Fiddle', 'Solo Violin', 'solo-violin', A],
  ['Shanai', 'Grand Piano', 'grand-piano', A],
  // Percussive
  ['Tinkle Bell', 'Vibraphone', 'vibraphone', A],
  ['Agogo', 'Steel Drum', 'steel-drum', A],
  ['Steel Drums', 'Steel Drum', 'steel-drum', E],
  ['Woodblock', 'Clap Slap', VA],
  ['Taiko Drum', 'Taiko', 'taiko', E],
  ['Melodic Tom', 'Blip Perc', VA],
  ['Synth Drum', 'General MIDI Drums Hiphop', 'general-midi-drums-hiphop', A],
  ['Reverse Cymbal', 'Clap Slap', VA],
  // Sound effects
  ['Guitar Fret Noise', 'Funk Guitar', 'funk-guitar', A],
  ['Breath Noise', 'Blip Perc', VA],
  ['Seashore', 'Blip Perc', VA],
  ['Bird Tweet', 'Blip Perc', VA],
  ['Telephone Ring', 'General MIDI Percussion', 'general-midi-percussion', A],
  ['Helicopter', 'Helicopter Orchestra', VA],
  ['Applause', 'Clap Slap', VA],
  ['Gunshot', 'Electro Splat', VA],
] satisfies readonly GeneralMidiProgramRouteInput[])

if (GENERAL_MIDI_PROGRAM_ROUTE_INPUTS.length !== 128) {
  throw new TypeError('Built-in General MIDI route table must contain all 128 Programs')
}

function createProgramRoute(
  input: GeneralMidiProgramRouteInput,
  programNumber: number,
): GeneralMidiProgramRoute {
  const [generalMidiDisplayName, sourceDisplayName] = input
  if (input.length === 3) {
    return Object.freeze({
      availability: 'runtime-unavailable',
      engine: input[2],
      generalMidiDisplayName,
      programNumber,
      sourceDisplayName,
    })
  }

  return Object.freeze({
    availability: 'available',
    engine: BUILT_IN_INSTRUMENT_ENGINE.MIDI_SAMPLE_SYNTH,
    generalMidiDisplayName,
    mappingKind: input[3],
    programNumber,
    soundbankId: parseSoundbankId(input[2]),
    sourceDisplayName,
  })
}

export const GENERAL_MIDI_PROGRAM_ROUTES = Object.freeze(
  GENERAL_MIDI_PROGRAM_ROUTE_INPUTS.map(createProgramRoute),
)

const GENERAL_MIDI_FAMILIES = Object.freeze([
  ['piano', 'Piano'],
  ['chromatic-percussion', 'Chromatic percussion'],
  ['organ', 'Organ'],
  ['guitar', 'Guitar'],
  ['bass', 'Bass'],
  ['strings', 'Strings'],
  ['ensemble', 'Ensemble'],
  ['brass', 'Brass'],
  ['reed', 'Reed'],
  ['pipe', 'Pipe'],
  ['synth-lead', 'Synth lead'],
  ['synth-pad', 'Synth pad'],
  ['synth-effects', 'Synth effects'],
  ['ethnic', 'Ethnic'],
  ['percussive', 'Percussive'],
  ['sound-effects', 'Sound effects'],
] as const)

export const GENERAL_MIDI_PROGRAM_ROUTE_GROUPS = Object.freeze(
  GENERAL_MIDI_FAMILIES.map(([familyId, displayName], familyIndex) =>
    Object.freeze({
      displayName,
      familyId,
      firstProgramNumber: familyIndex * 8,
      lastProgramNumber: familyIndex * 8 + 7,
      routes: Object.freeze(
        GENERAL_MIDI_PROGRAM_ROUTES.slice(familyIndex * 8, familyIndex * 8 + 8),
      ),
    }),
  ),
)

const BUILT_IN_PRESET_CATEGORY_DEFINITIONS = Object.freeze([
  ['piano', 'Piano & keys'],
  ['guitars', 'Guitars'],
  ['bass', 'Bass'],
  ['strings', 'Strings'],
  ['brass', 'Brass'],
  ['wind', 'Wind'],
  ['voices', 'Voices'],
  ['percussion', 'Percussion'],
  ['drum-kit', 'Drum kits'],
  ['drum-pads', 'Drum pads'],
  ['synth-bass', 'Synth bass'],
  ['synth-keys', 'Synth keys'],
  ['synth-leads', 'Synth leads'],
  ['synth-pads', 'Synth pads'],
  ['special-effects', 'Special effects'],
] as const satisfies readonly (readonly [BuiltInInstrumentPresetCategoryId, string])[])

function readSnapshotRecord(input: unknown, index: number): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`Built-in Preset snapshot entry ${index} must be an object`)
  }
  return input as Record<string, unknown>
}

function readSnapshotString(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.length === 0 || input.trim() !== input) {
    throw new TypeError(`${label} must be a trimmed non-blank string`)
  }
  return input
}

function parseBuiltInInstrumentPreset(input: unknown, index: number): BuiltInInstrumentPreset {
  const record = readSnapshotRecord(input, index)
  const label = `Built-in Preset snapshot entry ${index}`
  const categoryId = readSnapshotString(record.categoryId, `${label}.categoryId`)
  if (
    !BUILT_IN_PRESET_CATEGORY_DEFINITIONS.some(
      ([reviewedCategoryId]) => reviewedCategoryId === categoryId,
    )
  ) {
    throw new TypeError(`${label}.categoryId is not reviewed`)
  }
  const generalMidiProgram = record.generalMidiProgram
  if (
    typeof generalMidiProgram !== 'number' ||
    !Number.isSafeInteger(generalMidiProgram) ||
    generalMidiProgram < -1 ||
    generalMidiProgram > 127
  ) {
    throw new TypeError(`${label}.generalMidiProgram must be -1 or a Program from 0 through 127`)
  }
  if (typeof record.isCanonicalForProgram !== 'boolean') {
    throw new TypeError(`${label}.isCanonicalForProgram must be a boolean`)
  }
  const base = {
    categoryId: categoryId as BuiltInInstrumentPresetCategoryId,
    displayName: readSnapshotString(record.displayName, `${label}.displayName`),
    generalMidiProgram,
    isCanonicalForProgram: record.isCanonicalForProgram,
    sourcePresetId: readSnapshotString(record.sourcePresetId, `${label}.sourcePresetId`),
    subtitle: readSnapshotString(record.subtitle, `${label}.subtitle`),
  }
  if (record.engine === BUILT_IN_INSTRUMENT_ENGINE.MIDI_SAMPLE_SYNTH) {
    return Object.freeze({
      ...base,
      availability: 'available',
      engine: BUILT_IN_INSTRUMENT_ENGINE.MIDI_SAMPLE_SYNTH,
      soundbankId: parseSoundbankId(record.soundbankId),
    })
  }
  if (
    (record.engine === BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH ||
      record.engine === BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH) &&
    record.soundbankId === null
  ) {
    return Object.freeze({
      ...base,
      availability: 'runtime-unavailable',
      engine: record.engine,
    })
  }
  throw new TypeError(`${label} has an inconsistent engine and Soundbank identity`)
}

function comparePresetNames(left: BuiltInInstrumentPreset, right: BuiltInInstrumentPreset): number {
  if (left.displayName < right.displayName) return -1
  if (left.displayName > right.displayName) return 1
  if (left.sourcePresetId < right.sourcePresetId) return -1
  return left.sourcePresetId > right.sourcePresetId ? 1 : 0
}

if (
  presetSourceSnapshot.schema !== 'seele.built-in-instrument-preset-source-snapshot' ||
  presetSourceSnapshot.schemaVersion !== 1
) {
  throw new TypeError('Built-in Instrument Preset snapshot schema is unsupported')
}

export const BUILT_IN_INSTRUMENT_PRESETS = Object.freeze(
  presetSourceSnapshot.presets.map(parseBuiltInInstrumentPreset),
)

const presetBySourceId = new Map<string, BuiltInInstrumentPreset>()
const availablePresetBySoundbankId = new Map<SoundbankId, AvailableBuiltInInstrumentPreset>()
for (const preset of BUILT_IN_INSTRUMENT_PRESETS) {
  if (presetBySourceId.has(preset.sourcePresetId)) {
    throw new TypeError(`Built-in Preset source identity is duplicated: ${preset.sourcePresetId}`)
  }
  presetBySourceId.set(preset.sourcePresetId, preset)
  if (preset.availability !== 'available') continue
  if (availablePresetBySoundbankId.has(preset.soundbankId)) {
    throw new TypeError(`Built-in Soundbank identity is duplicated: ${preset.soundbankId}`)
  }
  availablePresetBySoundbankId.set(preset.soundbankId, preset)
}

if (
  BUILT_IN_INSTRUMENT_PRESETS.length !== 439 ||
  availablePresetBySoundbankId.size !== 289 ||
  BUILT_IN_INSTRUMENT_PRESETS.filter(({ engine }) => engine === BUILT_IN_INSTRUMENT_ENGINE.VA_SYNTH)
    .length !== 139 ||
  BUILT_IN_INSTRUMENT_PRESETS.filter(({ engine }) => engine === BUILT_IN_INSTRUMENT_ENGINE.FM_SYNTH)
    .length !== 11
) {
  throw new TypeError('Built-in Preset snapshot does not match the reviewed 439-Preset inventory')
}

export const BUILT_IN_INSTRUMENT_PRESET_GROUPS = Object.freeze(
  BUILT_IN_PRESET_CATEGORY_DEFINITIONS.map(([categoryId, displayName]) =>
    Object.freeze({
      categoryId,
      displayName,
      presets: Object.freeze(
        BUILT_IN_INSTRUMENT_PRESETS.filter((preset) => preset.categoryId === categoryId).sort(
          comparePresetNames,
        ),
      ),
    }),
  ),
)

const catalogueEntries = [...availablePresetBySoundbankId.values()].map((preset) =>
  Object.freeze({
    assetBasePathname: `/soundbanks/generated/${preset.soundbankId}/`,
    displayName: preset.displayName,
    soundbankId: preset.soundbankId,
  }),
)
const entryBySoundbankId = new Map<SoundbankId, BuiltInInstrumentCatalogueEntry>(
  catalogueEntries.map((entry) => [entry.soundbankId, entry]),
)

for (const route of GENERAL_MIDI_PROGRAM_ROUTES) {
  if (route.availability === 'available' && !entryBySoundbankId.has(route.soundbankId)) {
    throw new TypeError(`General MIDI route has no built-in Preset: ${route.soundbankId}`)
  }
}

export const BUILT_IN_INSTRUMENT_CATALOGUE = Object.freeze(catalogueEntries)

export const DEFAULT_BUILT_IN_INSTRUMENT =
  entryBySoundbankId.get(parseSoundbankId('studio-grand')) ??
  (() => {
    throw new TypeError('Built-in Instrument Catalogue is missing the default Studio Grand')
  })()

export const GENERAL_MIDI_PERCUSSION_INSTRUMENT =
  entryBySoundbankId.get(parseSoundbankId('general-midi-percussion')) ??
  (() => {
    throw new TypeError('Built-in Instrument Catalogue is missing General MIDI Percussion')
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

/** Resolves the unique playable Preset behind a persisted Sample Instrument identity. */
export function findAvailableBuiltInInstrumentPreset(
  soundbankIdInput: unknown,
): AvailableBuiltInInstrumentPreset | null {
  let soundbankId: SoundbankId
  try {
    soundbankId = parseSoundbankId(soundbankIdInput)
  } catch {
    return null
  }
  return availablePresetBySoundbankId.get(soundbankId) ?? null
}

/** Resolves the complete reviewed zero-based General MIDI Program policy. */
export function findGeneralMidiProgramRoute(
  programNumberInput: unknown,
): GeneralMidiProgramRoute | null {
  if (
    typeof programNumberInput !== 'number' ||
    !Number.isSafeInteger(programNumberInput) ||
    programNumberInput < 0 ||
    programNumberInput > 127
  ) {
    return null
  }
  return GENERAL_MIDI_PROGRAM_ROUTES[programNumberInput] ?? null
}
