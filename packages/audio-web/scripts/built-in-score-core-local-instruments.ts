import { parseSoundbankId } from '@seele-daw/playback'

import type {
  BuiltInLocalSampleInstrumentDefinition,
  BuiltInLocalSampleInstrumentInputFingerprint,
} from './prepare-built-in-local-sample-instrument'
import {
  BUILT_IN_LOCAL_MANIFEST_POLICY,
  type BuiltInLocalManifestPolicy,
} from './built-in-local-manifest-policy'

const MEBIBYTE = 1_024 * 1_024

const COMMON_INPUT_FINGERPRINTS = Object.freeze([
  Object.freeze({
    relativePath: 'catalog/selected-soundbanks.json',
    sha256: 'a1925bfec6e389fd37a901e21d571bdfd0ccfec162f3809c8fae95eaf268a924',
  }),
  Object.freeze({
    relativePath: 'indexes/by-general-midi-program.json',
    sha256: '12e42ec8d9131973317ae805c5d120426b95ec8abdda87f596e355dd39a0df66',
  }),
  Object.freeze({
    relativePath: 'indexes/soundbank-map.json',
    sha256: '58e800e66415f24665926a945f732f93ac4abb99923d0d078f96e94aa140138d',
  }),
] satisfies readonly BuiltInLocalSampleInstrumentInputFingerprint[])

export type BuiltInLocalInstrumentFamily =
  | 'bass'
  | 'brass'
  | 'drum-kit'
  | 'effects'
  | 'ethnic'
  | 'guitar'
  | 'keyboard'
  | 'percussion'
  | 'strings'
  | 'synth'
  | 'voices'
  | 'woodwind'

export type BuiltInScoreCoreInstrumentFamily = BuiltInLocalInstrumentFamily

export type BuiltInLocalInstrumentPlannedRoute =
  | {
      readonly kind: 'general-midi-program'
      readonly programNumber: number
    }
  | {
      readonly channel: 9
      readonly kind: 'percussion-channel'
    }
  | {
      readonly kind: 'manual-preset'
      readonly sourceCategoryId: string
    }

export interface BuiltInLocalSampleInstrument {
  readonly family: BuiltInLocalInstrumentFamily
  readonly plannedRoute: BuiltInLocalInstrumentPlannedRoute
  readonly preparation: BuiltInLocalSampleInstrumentDefinition
  readonly productDisplayName: string
}

export type BuiltInScoreCorePlannedRoute = BuiltInLocalInstrumentPlannedRoute
export type BuiltInScoreCoreLocalInstrument = BuiltInLocalSampleInstrument

interface SourceHashes {
  readonly archive: string
  readonly catalog: string
  readonly mapping: string
}

export interface BuiltInLocalInstrumentInput {
  readonly archiveBudget: {
    readonly maximumArchiveMebibyte: number
    readonly maximumEntryCount: number
    readonly maximumEntryMebibyte: number
    readonly maximumTotalUncompressedMebibyte: number
  }
  readonly expectedCanonicalForProgram: boolean
  readonly expectedSourceDisplayName: string
  readonly expectedSourceGeneralMidiProgram: number
  readonly family: BuiltInLocalInstrumentFamily
  readonly manifestPolicy?: BuiltInLocalManifestPolicy
  readonly plannedRoute: BuiltInLocalInstrumentPlannedRoute
  readonly productDisplayName: string
  readonly productPitchRange: {
    readonly maximumPitch: number
    readonly minimumPitch: number
  } | null
  readonly soundbankId: string
  readonly sourceHashes: SourceHashes
  readonly sourceSlug: string
}

function sourcePath(sourceSlug: string, fileName: string): string {
  return `soundbanks/MIDISampleSynth/${sourceSlug}/${fileName}`
}

function createInputFingerprints(
  sourceSlug: string,
  hashes: SourceHashes,
): readonly BuiltInLocalSampleInstrumentInputFingerprint[] {
  return Object.freeze([
    ...COMMON_INPUT_FINGERPRINTS,
    Object.freeze({
      relativePath: sourcePath(sourceSlug, `${sourceSlug}.catalog.json`),
      sha256: hashes.catalog,
    }),
    Object.freeze({
      relativePath: sourcePath(sourceSlug, `${sourceSlug}.mapping.json`),
      sha256: hashes.mapping,
    }),
    Object.freeze({
      relativePath: sourcePath(sourceSlug, `${sourceSlug}-wav.zip`),
      sha256: hashes.archive,
    }),
  ])
}

export function createBuiltInLocalInstrument(
  input: BuiltInLocalInstrumentInput,
): BuiltInLocalSampleInstrument {
  const soundbankId = parseSoundbankId(input.soundbankId)
  const preparation = Object.freeze({
    archiveLimits: Object.freeze({
      maximumArchiveByteLength: input.archiveBudget.maximumArchiveMebibyte * MEBIBYTE,
      maximumCompressionRatio: 64,
      maximumEntryByteLength: input.archiveBudget.maximumEntryMebibyte * MEBIBYTE,
      maximumEntryCount: input.archiveBudget.maximumEntryCount,
      maximumTotalUncompressedByteLength:
        input.archiveBudget.maximumTotalUncompressedMebibyte * MEBIBYTE,
    }),
    expectedCanonicalForProgram: input.expectedCanonicalForProgram,
    expectedGeneralMidiProgram: input.expectedSourceGeneralMidiProgram,
    expectedInputFingerprints: createInputFingerprints(input.sourceSlug, input.sourceHashes),
    expectedSourceDisplayName: input.expectedSourceDisplayName,
    generatedDirectoryName: input.soundbankId,
    manifestPolicy: input.manifestPolicy ?? BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1,
    productPitchRange:
      input.productPitchRange === null ? null : Object.freeze({ ...input.productPitchRange }),
    soundbankId,
    sourceSlug: input.sourceSlug,
  } satisfies BuiltInLocalSampleInstrumentDefinition)
  return Object.freeze({
    family: input.family,
    plannedRoute: Object.freeze({ ...input.plannedRoute }),
    preparation,
    productDisplayName: input.productDisplayName,
  })
}

const createInstrument = createBuiltInLocalInstrument

export const BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS = Object.freeze([
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 32,
      maximumEntryCount: 64,
      maximumEntryMebibyte: 8,
      maximumTotalUncompressedMebibyte: 64,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Studio Grand',
    expectedSourceGeneralMidiProgram: 0,
    family: 'keyboard',
    plannedRoute: { kind: 'general-midi-program', programNumber: 0 },
    productDisplayName: 'Studio Grand',
    productPitchRange: { maximumPitch: 108, minimumPitch: 21 },
    soundbankId: 'studio-grand',
    sourceHashes: {
      archive: '55f5c6b2aec430f245f83b485d4f6df9a06f4ca3167aaa779b81eb0c0134a1a9',
      catalog: '95ac74b53e1f96831f50f7a79c441672c0cd23dfedc371e71769b66d76d244ea',
      mapping: '8627c855c32d85eba4899b0b29deaa76e84b9f7ff11f49c5e2b3256b950d913b',
    },
    sourceSlug: 'studio-grand-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 4,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Acoustic Bass Legato',
    expectedSourceGeneralMidiProgram: 32,
    family: 'bass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 32 },
    productDisplayName: 'Acoustic Bass',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'acoustic-bass',
    sourceHashes: {
      archive: 'e0b3e869601ec1cc666fed401c1ec74ecfea9a3730899b70eee3361282f85e31',
      catalog: 'a5345be4d35973288c6b0eaac6c0efe5684f2dd74713b68c62cf3b8dffd2837c',
      mapping: 'a8014cbf963cdc9dc92f31326784f75bc630be6d0e5e5eb9aeefabb271e899cf',
    },
    sourceSlug: 'acoustic-bass-legato-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Solo Violin',
    expectedSourceGeneralMidiProgram: 40,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 40 },
    productDisplayName: 'Violin',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'solo-violin',
    sourceHashes: {
      archive: 'b0f52eceb8b5a133f6d8b4e985de707f5034ce8bb8fb9e2e8d987e4ccaebd561',
      catalog: 'd8843de2aa18c36d1aeea4fba0bac15f4a820502d8f476274feed7440ee49c20',
      mapping: 'a190d0cf4feef4eaf04e10c5ec7913583b82089ba9ecb751f60964a1532871ff',
    },
    sourceSlug: 'solo-violin-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 16,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 2,
      maximumTotalUncompressedMebibyte: 16,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Viola Section',
    expectedSourceGeneralMidiProgram: 41,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 41 },
    productDisplayName: 'Viola',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'viola-section',
    sourceHashes: {
      archive: '28080a8357402502ae1f6d1eda2e0ac46aa34ffe81d0d06c39017f09ab8d8e6b',
      catalog: 'a083e3f3f70bb8588a68c463a6475bd1ca11e6693fd0c261b938c6051433170a',
      mapping: '339da00db81f3b41f2f34f1875309d720a27e163f77fa53bf8da7929f970e9ce',
    },
    sourceSlug: 'viola-section-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 16,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 2,
      maximumTotalUncompressedMebibyte: 16,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Cello Section',
    expectedSourceGeneralMidiProgram: 42,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 42 },
    productDisplayName: 'Cello',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'cello-section',
    sourceHashes: {
      archive: '59079aaec730f3e2224089c1007968c092db798dd64face8c061a98db7c586b5',
      catalog: 'dc4e87d0c98085008daa10410527b646d8fffb11b35696d2c9c864cccc39fb72',
      mapping: '10e7871d9c0397e3bf3792108a62cfbb4c4973e315d58dc2980fd442edc33e33',
    },
    sourceSlug: 'cello-section-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 16,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 16,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Double Bass Section',
    expectedSourceGeneralMidiProgram: 43,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 43 },
    productDisplayName: 'Contrabass',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'double-bass-section',
    sourceHashes: {
      archive: 'a901579e8b9234a6269a0d8e7ad4d42ce10c89eefdd737608271796e58d65877',
      catalog: 'e6821b2376d702fdbdddd6bb0da3548f79d6bdf340a52c5953e42454b74c9430',
      mapping: '9b054466a6a2e593ecccc3782ba7cbdab818330c867a9408930f516d4a06037f',
    },
    sourceSlug: 'double-bass-section-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 64,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 4,
      maximumTotalUncompressedMebibyte: 64,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Full Strings Tremolo',
    expectedSourceGeneralMidiProgram: 44,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 44 },
    productDisplayName: 'Tremolo Strings',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'string-ensemble-tremolo',
    sourceHashes: {
      archive: '04ef3f9db0a396ba99d330d59fe7d24aaf9807ee2d00b6604140297bb381771e',
      catalog: '2927b87cdf32c23dc5b56adb87174a8dc1b20ed400d41e5eb76d8d3cb6eaab3c',
      mapping: '0ba9f9a960cc18a565ad7ced6d3212c93588d5aefb9dfa2bc7a1182768ab55fe',
    },
    sourceSlug: 'full-strings-tremolo-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Full Strings Pizzicato',
    expectedSourceGeneralMidiProgram: 45,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 45 },
    productDisplayName: 'Pizzicato Strings',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'string-ensemble-pizzicato',
    sourceHashes: {
      archive: '7017925f5b7a42c604d861024ba4b84027519f8d6b2a26d5b9455b003de61792',
      catalog: '0bd107f04643bdc977cfb2b19b62334907197aede3066481add123c245b28b2a',
      mapping: '61564c2a4304d220ca6fd616bcccae567fa8c3782b50a4b636b721e59aabb7b9',
    },
    sourceSlug: 'full-strings-pizzicato-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Harp',
    expectedSourceGeneralMidiProgram: 46,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 46 },
    productDisplayName: 'Harp',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'orchestral-harp',
    sourceHashes: {
      archive: 'a8a1b2e05b0e324109b6786fea264568f58ca02bef519795384610820cb5470c',
      catalog: 'bf3688f6b7ac8acb692bb2b7a553033104566ecaf430938fd75f431bc68a62fd',
      mapping: 'f1e7e20e13d79ec83638bdbbcf43cdc0d1c4ae41d15782349fad32032def539d',
    },
    sourceSlug: 'harp-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 4,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 4,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Timpani',
    expectedSourceGeneralMidiProgram: 47,
    family: 'percussion',
    plannedRoute: { kind: 'general-midi-program', programNumber: 47 },
    productDisplayName: 'Timpani',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'timpani',
    sourceHashes: {
      archive: '878234862905ecf376b002788241225509c3639dc9baa3678e1a948bff431a27',
      catalog: '5ba29e08f025630a4115a3eb87248e0efdf3ef028b58cbdbb8b02cb7573a8588',
      mapping: '12418244e5ba15e8e999febc70328fe5f4ca3d450ad28a6c511ced272a20c364',
    },
    sourceSlug: 'timpani-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 32,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 32,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'String Orchestra',
    expectedSourceGeneralMidiProgram: 48,
    family: 'strings',
    plannedRoute: { kind: 'general-midi-program', programNumber: 48 },
    productDisplayName: 'String Ensemble',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'string-ensemble',
    sourceHashes: {
      archive: '114506e1eb58d576a93dc652b2fccc858058a441990cbd10539a2888bcb06b5f',
      catalog: 'a2c4116a209adb91c22c21cdb7506ccb781275e8a81d592a56b86c55cce677b1',
      mapping: 'c628557e5dc83b9c0b9357625d3fa284edfcc344340c40f22bd322daddfcbc3c',
    },
    sourceSlug: 'string-orchestra-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 4,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 4,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Trumpet',
    expectedSourceGeneralMidiProgram: 56,
    family: 'brass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 56 },
    productDisplayName: 'Trumpet',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'trumpet',
    sourceHashes: {
      archive: '4199f273bc1ad02c6b3e2e9748b8f1ecfbeb4b92b8e10831e228baabc84f55a7',
      catalog: '381ff5d42e615fda4e77aafa1852e17a304ab3a3364b5c8b3f79fdfec620f9c3',
      mapping: '6ef38da8a10abc201e5bd8e1c9caff28e0f39982544b34df025c1e74fcbb7e15',
    },
    sourceSlug: 'trumpet-clean-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 1,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 1,
    },
    expectedCanonicalForProgram: false,
    expectedSourceDisplayName: 'Trumpet Straight Mute',
    expectedSourceGeneralMidiProgram: 56,
    family: 'brass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 59 },
    productDisplayName: 'Muted Trumpet',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'muted-trumpet',
    sourceHashes: {
      archive: '90abcd2010934dd11a124887c4e0a259c8c07b0426d6020d13628ea580cb2593',
      catalog: 'c260582a2a3d05e2515af392b178d0b2b8c4d885f1e4b5b07b30641f8cb45190',
      mapping: '67972caa581149061b0f03d88ed90dc9d43b2bcb4d819eaf3c946de8e205956b',
    },
    sourceSlug: 'trumpet-straight-mute-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 4,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 4,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Trombone Hard',
    expectedSourceGeneralMidiProgram: 57,
    family: 'brass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 57 },
    productDisplayName: 'Trombone',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'trombone',
    sourceHashes: {
      archive: '30f43801806f597a786a62e64c9000b85e898f5447fbfba21b81b2a70653b370',
      catalog: 'bab0019c3afde76d89008481a0970829f3e4e1b725594ab709c73398d4c263c6',
      mapping: 'f28ef0dccdcfe203555a20bd99994af002328dcaed8a3ebdc93ab3dc8f015c7e',
    },
    sourceSlug: 'trombone-hard-v4-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Tuba',
    expectedSourceGeneralMidiProgram: 58,
    family: 'brass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 58 },
    productDisplayName: 'Tuba',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'tuba',
    sourceHashes: {
      archive: '5c394d90369d2216566eb55ba57c4ccbfa146117f489dfd6648b0e22717204ad',
      catalog: '93155ad5b7bf0362e56b6a9300fad0d09fd63e6621200db75521dbd64e4a8f9d',
      mapping: '3ba99556c508b9f28032a0d1708680cd6cc4f69157313e100ce639a302812fa4',
    },
    sourceSlug: 'tuba-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'French Horn',
    expectedSourceGeneralMidiProgram: 60,
    family: 'brass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 60 },
    productDisplayName: 'French Horn',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'french-horn',
    sourceHashes: {
      archive: '773b9d68f1567efa640a1ba92573209c0d791c380d30359b44949ad8c8898cfb',
      catalog: 'f5270caf6d2f78e04b328074692ebc504954b350dc9be130c17df6089928cd48',
      mapping: 'f0d43156881393a8860845736dc4a449e490aa11fc4dcd8f96c0bfa84471eaf2',
    },
    sourceSlug: 'french-horn-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 4,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Full Brass',
    expectedSourceGeneralMidiProgram: 61,
    family: 'brass',
    plannedRoute: { kind: 'general-midi-program', programNumber: 61 },
    productDisplayName: 'Brass Ensemble',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'brass-ensemble',
    sourceHashes: {
      archive: 'bb0dd08c99e45d15db8aecd7dcfa609c4c74ae336d414db747a499ad7a622b8b',
      catalog: '4c139db5aba0cafb5c9a15845090eb60c277c910ac582a451b9b2b210ff061d9',
      mapping: 'a0c065bd4d66c14a551d933cb111d60b401bbe0f6733a71a11eeacae1d07bbd3',
    },
    sourceSlug: 'full-brass-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Oboe',
    expectedSourceGeneralMidiProgram: 68,
    family: 'woodwind',
    plannedRoute: { kind: 'general-midi-program', programNumber: 68 },
    productDisplayName: 'Oboe',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'oboe',
    sourceHashes: {
      archive: '97cbc196f675184ad278df8435adeddf6e951bb208f36dae354656f2e3ac2f2e',
      catalog: '6b09f7999dee0dfcd161174e5e496e14d5c6dfee5993f89b0a38256706dd88f6',
      mapping: 'a9e2374a76fd48b93cf553b0907ab818d51ac1176da11fb05d8d833b8d2cf6bc',
    },
    sourceSlug: 'oboe-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 16,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Bassoon',
    expectedSourceGeneralMidiProgram: 70,
    family: 'woodwind',
    plannedRoute: { kind: 'general-midi-program', programNumber: 70 },
    productDisplayName: 'Bassoon',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'bassoon',
    sourceHashes: {
      archive: 'd9b75e77e5bf7a8b2ccd08f40021aa1fb980ea77a7e3b1cff1289903e9d3143e',
      catalog: 'a6a654539397726092fe720a33326473d0a53012ee0b045cc09ad5317393bf83',
      mapping: '09e6f4f0acd10999d2d8b8757013ca0bd222c7f7b69373c272f994ef2ec4d63f',
    },
    sourceSlug: 'bassoon-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 16,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 16,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Clarinet',
    expectedSourceGeneralMidiProgram: 71,
    family: 'woodwind',
    plannedRoute: { kind: 'general-midi-program', programNumber: 71 },
    productDisplayName: 'Clarinet',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'clarinet',
    sourceHashes: {
      archive: '112894890e7148796086f2e287fff977a860d186a50278d0cf8701589646db30',
      catalog: 'a8d8f85c3b402fe577931c2aeb31b1f76ba3a8a042a74f611e90804c87ddfc18',
      mapping: '8faa332616e3d17be94a3af91e504d0a3f135964efc8317715583c3bb6492ae9',
    },
    sourceSlug: 'clarinet-v3-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 32,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 16,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'Flute',
    expectedSourceGeneralMidiProgram: 73,
    family: 'woodwind',
    plannedRoute: { kind: 'general-midi-program', programNumber: 73 },
    productDisplayName: 'Flute',
    productPitchRange: { maximumPitch: 119, minimumPitch: 21 },
    soundbankId: 'flute',
    sourceHashes: {
      archive: 'd041ac1b3edce33073c848e81f2b10031ebea4322fe6ae2d58d15ecdef4d16f7',
      catalog: 'b23ffecce59f53cfde6a1aab7fdd414967bcebc7d10281686ebd9fd2c44a0952',
      mapping: 'cb45b854f675c44c9de948ad888e1bfe12ba213ad1e58cc5e1f3f11334715cbf',
    },
    sourceSlug: 'flute-v2-v4',
  }),
  createInstrument({
    archiveBudget: {
      maximumArchiveMebibyte: 8,
      maximumEntryCount: 64,
      maximumEntryMebibyte: 1,
      maximumTotalUncompressedMebibyte: 8,
    },
    expectedCanonicalForProgram: true,
    expectedSourceDisplayName: 'General MIDI Percussion',
    expectedSourceGeneralMidiProgram: -1,
    family: 'drum-kit',
    manifestPolicy: BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1,
    plannedRoute: { channel: 9, kind: 'percussion-channel' },
    productDisplayName: 'General MIDI Percussion',
    productPitchRange: { maximumPitch: 81, minimumPitch: 35 },
    soundbankId: 'general-midi-percussion',
    sourceHashes: {
      archive: 'a46165b0ffe22fbfca8be45c7c97d51a29dc89cedfab0fa71db80a815a306795',
      catalog: '2770546278465328d1c68e05f520f6190667c2ca7fda90b52d475ecb3c7a4c81',
      mapping: 'b664bad3129fc78c552d13b66c01d191688090b0d2501932b143e24f4e4e1ae0',
    },
    sourceSlug: 'general-midi-drums-v2-v4',
  }),
])

export const STUDIO_GRAND_LOCAL_INSTRUMENT =
  BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.find(
    ({ preparation }) => preparation.soundbankId === 'studio-grand',
  ) ??
  (() => {
    throw new TypeError('Score Core instrument list is missing Studio Grand')
  })()

export const GENERAL_MIDI_PERCUSSION_LOCAL_INSTRUMENT =
  BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.find(
    ({ preparation }) => preparation.soundbankId === 'general-midi-percussion',
  ) ??
  (() => {
    throw new TypeError('Score Core instrument list is missing General MIDI Percussion')
  })()
