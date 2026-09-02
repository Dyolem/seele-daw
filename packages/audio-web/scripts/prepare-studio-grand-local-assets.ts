import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSoundbankId } from '@seele-daw/playback'

import {
  prepareBuiltInLocalSampleInstrument,
  type BuiltInLocalSampleInstrumentDefinition,
} from './prepare-built-in-local-sample-instrument'

const SOURCE_SLUG = 'studio-grand-v2-v4'
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const localSoundbankRoot = resolve(repositoryRoot, 'apps/studio/public/soundbanks')

const STUDIO_GRAND_DEFINITION = Object.freeze({
  archiveLimits: Object.freeze({
    maximumArchiveByteLength: 32 * 1_024 * 1_024,
    maximumCompressionRatio: 64,
    maximumEntryByteLength: 8 * 1_024 * 1_024,
    maximumEntryCount: 64,
    maximumTotalUncompressedByteLength: 64 * 1_024 * 1_024,
  }),
  expectedGeneralMidiProgram: 0,
  expectedInputFingerprints: Object.freeze([
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
    Object.freeze({
      relativePath: `soundbanks/MIDISampleSynth/${SOURCE_SLUG}/${SOURCE_SLUG}.catalog.json`,
      sha256: '95ac74b53e1f96831f50f7a79c441672c0cd23dfedc371e71769b66d76d244ea',
    }),
    Object.freeze({
      relativePath: `soundbanks/MIDISampleSynth/${SOURCE_SLUG}/${SOURCE_SLUG}.mapping.json`,
      sha256: '8627c855c32d85eba4899b0b29deaa76e84b9f7ff11f49c5e2b3256b950d913b',
    }),
    Object.freeze({
      relativePath: `soundbanks/MIDISampleSynth/${SOURCE_SLUG}/${SOURCE_SLUG}-wav.zip`,
      sha256: '55f5c6b2aec430f245f83b485d4f6df9a06f4ca3167aaa779b81eb0c0134a1a9',
    }),
  ]),
  expectedSourceDisplayName: 'Studio Grand',
  generatedDirectoryName: 'studio-grand',
  productPitchRange: Object.freeze({ maximumPitch: 108, minimumPitch: 21 }),
  soundbankId: parseSoundbankId('studio-grand'),
  sourceSlug: SOURCE_SLUG,
} satisfies BuiltInLocalSampleInstrumentDefinition)

const result = await prepareBuiltInLocalSampleInstrument({
  definition: STUDIO_GRAND_DEFINITION,
  localSoundbankRoot,
})
const relativeOutputDirectory = relative(repositoryRoot, result.outputDirectory)
console.log(
  result.status === 'created'
    ? `Prepared Studio Grand local assets in ${relativeOutputDirectory}.`
    : `Studio Grand local assets are already current in ${relativeOutputDirectory}.`,
)
