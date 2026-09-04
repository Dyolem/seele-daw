import sourceFingerprintSnapshot from './built-in-sample-preset-source-fingerprints.json'
import { BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS } from './built-in-general-midi-local-instruments'
import {
  createBuiltInLocalInstrument,
  type BuiltInLocalInstrumentFamily,
  type BuiltInLocalSampleInstrument,
} from './built-in-score-core-local-instruments'

const EXPECTED_INPUT_SET_SHA256 = '179c26c7e23a0f9b6ebed3d802f2179cc681f9d8f617032788b837bc5b523555'
const COMPLETE_PRESET_ARCHIVE_BUDGET = Object.freeze({
  maximumArchiveMebibyte: 128,
  maximumEntryCount: 128,
  maximumEntryMebibyte: 8,
  maximumTotalUncompressedMebibyte: 128,
})

const SOURCE_CATEGORY_FAMILIES = Object.freeze({
  bass: 'bass',
  brass: 'brass',
  'drum-kit': 'drum-kit',
  'drum-pads': 'percussion',
  guitars: 'guitar',
  percussion: 'percussion',
  piano: 'keyboard',
  'special-effects': 'effects',
  strings: 'strings',
  'synth-bass': 'synth',
  'synth-keys': 'synth',
  'synth-leads': 'synth',
  'synth-pads': 'synth',
  voices: 'voices',
  wind: 'woodwind',
} as const satisfies Readonly<Record<string, BuiltInLocalInstrumentFamily>>)

interface ReviewedSamplePresetSource {
  readonly categoryId: keyof typeof SOURCE_CATEGORY_FAMILIES
  readonly displayName: string
  readonly generalMidiProgram: number
  readonly isCanonicalForProgram: boolean
  readonly soundbankId: string
  readonly sourceHashes: {
    readonly archive: string
    readonly catalog: string
    readonly mapping: string
  }
  readonly sourcePresetId: string
}

function assertReviewedSnapshot(): readonly ReviewedSamplePresetSource[] {
  if (
    sourceFingerprintSnapshot.schema !== 'seele.built-in-sample-preset-source-fingerprints' ||
    sourceFingerprintSnapshot.schemaVersion !== 1 ||
    sourceFingerprintSnapshot.inputFileCount !== 870 ||
    sourceFingerprintSnapshot.inputSetSha256 !== EXPECTED_INPUT_SET_SHA256 ||
    sourceFingerprintSnapshot.sources.length !== 289
  ) {
    throw new TypeError('Built-in Sample Preset source fingerprint snapshot is unsupported')
  }
  return sourceFingerprintSnapshot.sources as readonly ReviewedSamplePresetSource[]
}

const existingInstrumentBySourcePresetId = new Map(
  BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS.map((instrument) => [
    instrument.preparation.sourceSlug,
    instrument,
  ]),
)

function createPresetInstrument(source: ReviewedSamplePresetSource): BuiltInLocalSampleInstrument {
  const existing = existingInstrumentBySourcePresetId.get(source.sourcePresetId)
  if (existing !== undefined) {
    if (
      existing.preparation.soundbankId !== source.soundbankId ||
      existing.preparation.expectedSourceDisplayName !== source.displayName ||
      existing.preparation.expectedGeneralMidiProgram !== source.generalMidiProgram ||
      existing.preparation.expectedCanonicalForProgram !== source.isCanonicalForProgram
    ) {
      throw new TypeError(`${source.sourcePresetId}: existing reviewed Instrument metadata drifted`)
    }
    return existing
  }

  const family = SOURCE_CATEGORY_FAMILIES[source.categoryId]
  if (family === undefined) {
    throw new TypeError(`${source.sourcePresetId}: source category is not reviewed`)
  }
  return createBuiltInLocalInstrument({
    archiveBudget: COMPLETE_PRESET_ARCHIVE_BUDGET,
    expectedCanonicalForProgram: source.isCanonicalForProgram,
    expectedSourceDisplayName: source.displayName,
    expectedSourceGeneralMidiProgram: source.generalMidiProgram,
    family,
    plannedRoute: { kind: 'manual-preset', sourceCategoryId: source.categoryId },
    productDisplayName: source.displayName,
    productPitchRange: null,
    soundbankId: source.soundbankId,
    sourceHashes: source.sourceHashes,
    sourceSlug: source.sourcePresetId,
  })
}

const reviewedSources = assertReviewedSnapshot()

/** Complete developer-local MIDISampleSynth set used by the manual Studio Preset browser. */
export const BUILT_IN_PRESET_LOCAL_INSTRUMENTS = Object.freeze(
  reviewedSources.map(createPresetInstrument),
)

export const EXTENDED_BUILT_IN_PRESET_LOCAL_INSTRUMENTS = Object.freeze(
  BUILT_IN_PRESET_LOCAL_INSTRUMENTS.filter(
    ({ preparation }) => !existingInstrumentBySourcePresetId.has(preparation.sourceSlug),
  ),
)
