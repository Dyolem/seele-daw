import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { parseSoundbankId } from '@seele-daw/playback'

import {
  adaptBuiltInMidiSampleSynthMapping,
  inspectBuiltInMidiSampleSynthMapping,
} from '#internal/sample-instrument/assets/built-in-mapping-adapter'
import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import {
  extractRestrictedZipArchive,
  type RestrictedZipArchiveLimits,
} from '#internal/sample-instrument/assets/restricted-zip'
import {
  parseSupportedWavMetadata,
  type SupportedWavMetadata,
} from '#internal/sample-instrument/contract/wav-file'

import {
  resolveBuiltInSoundbankSource,
  validateBuiltInSoundbankCatalog,
} from './built-in-soundbank-source'
import {
  assertManifestPitchCoverage,
  assertManifestResourceDurations,
  constrainManifestToPitchRange,
} from './prepare-local-sample-instrument'

const SOUND_BANK_ID = parseSoundbankId('studio-grand')
const SOURCE_SLUG = 'studio-grand-v2-v4'
const GENERAL_MIDI_PROGRAM = 0
const MINIMUM_PRODUCT_PITCH = 21
const MAXIMUM_PRODUCT_PITCH = 108

const ZIP_LIMITS: RestrictedZipArchiveLimits = Object.freeze({
  maximumArchiveByteLength: 32 * 1_024 * 1_024,
  maximumCompressionRatio: 64,
  maximumEntryByteLength: 8 * 1_024 * 1_024,
  maximumEntryCount: 64,
  maximumTotalUncompressedByteLength: 64 * 1_024 * 1_024,
})

const EXPECTED_INPUT_SHA256 = Object.freeze(
  new Map<string, string>([
    [
      'catalog/selected-soundbanks.json',
      'a1925bfec6e389fd37a901e21d571bdfd0ccfec162f3809c8fae95eaf268a924',
    ],
    [
      'indexes/by-general-midi-program.json',
      '12e42ec8d9131973317ae805c5d120426b95ec8abdda87f596e355dd39a0df66',
    ],
    [
      'indexes/soundbank-map.json',
      '58e800e66415f24665926a945f732f93ac4abb99923d0d078f96e94aa140138d',
    ],
    [
      `soundbanks/MIDISampleSynth/${SOURCE_SLUG}/${SOURCE_SLUG}.mapping.json`,
      '8627c855c32d85eba4899b0b29deaa76e84b9f7ff11f49c5e2b3256b950d913b',
    ],
    [
      `soundbanks/MIDISampleSynth/${SOURCE_SLUG}/${SOURCE_SLUG}-wav.zip`,
      '55f5c6b2aec430f245f83b485d4f6df9a06f4ca3167aaa779b81eb0c0134a1a9',
    ],
  ]),
)

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const localSoundbankRoot = resolve(repositoryRoot, 'apps/studio/public/soundbanks')
const outputDirectory = resolve(localSoundbankRoot, 'generated/studio-grand')
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const textEncoder = new TextEncoder()

interface InputFile {
  readonly bytes: Uint8Array
  readonly relativePath: string
  readonly sha256: string
}

interface PreparedOutputFile {
  readonly bytes: Uint8Array
  readonly relativePath: string
  readonly sha256: string
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  let text: string
  try {
    text = textDecoder.decode(bytes)
  } catch {
    throw new TypeError(`${label}: input is not valid UTF-8`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown JSON parse failure'
    throw new TypeError(`${label}: ${detail}`)
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function resolveLocalInput(relativePath: string): string {
  const absolutePath = resolve(localSoundbankRoot, relativePath)
  const pathFromRoot = relative(localSoundbankRoot, absolutePath)
  if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
    throw new TypeError(`input path escapes the local Soundbank root: ${relativePath}`)
  }
  return absolutePath
}

async function readInputFile(relativePath: string): Promise<InputFile> {
  const bytes = await readFile(resolveLocalInput(relativePath))
  return Object.freeze({ bytes, relativePath, sha256: sha256(bytes) })
}

function assertRecordedFingerprint(input: InputFile): void {
  const expected = EXPECTED_INPUT_SHA256.get(input.relativePath)
  if (expected !== undefined && input.sha256 !== expected) {
    throw new TypeError(
      `${input.relativePath}: input fingerprint changed; review the new source before normalization`,
    )
  }
}

function archiveEntryMap(
  entries: readonly { readonly bytes: Uint8Array; readonly key: string }[],
): ReadonlyMap<string, Uint8Array> {
  return new Map(entries.map(({ bytes, key }) => [key, bytes]))
}

function createManifest(
  mappingInput: unknown,
  wavMetadataByFileName: ReadonlyMap<string, SupportedWavMetadata>,
): SampleInstrumentManifestV1 {
  const manifest = adaptBuiltInMidiSampleSynthMapping(mappingInput, {
    resolveWavResource: ({ fileName }) => {
      const metadata = wavMetadataByFileName.get(fileName)
      if (metadata === undefined) throw new TypeError(`WAV metadata is missing for ${fileName}`)
      return {
        key: `samples/${fileName}.wav`,
        sourceSampleRateHz: metadata.sampleRateHz,
      }
    },
    soundbankId: SOUND_BANK_ID,
  })
  const constrained = constrainManifestToPitchRange(
    manifest,
    MINIMUM_PRODUCT_PITCH,
    MAXIMUM_PRODUCT_PITCH,
  )
  assertManifestPitchCoverage(constrained, MINIMUM_PRODUCT_PITCH, MAXIMUM_PRODUCT_PITCH)
  return constrained
}

function prepareResourceOutputs(
  sampleFileNames: readonly string[],
  entriesByKey: ReadonlyMap<string, Uint8Array>,
): {
  readonly metadataByFileName: ReadonlyMap<string, SupportedWavMetadata>
  readonly metadataByResourceKey: ReadonlyMap<string, SupportedWavMetadata>
  readonly outputs: readonly PreparedOutputFile[]
} {
  const metadataByFileName = new Map<string, SupportedWavMetadata>()
  const metadataByResourceKey = new Map<string, SupportedWavMetadata>()
  const outputs = sampleFileNames.map((fileName): PreparedOutputFile => {
    const archiveKey = `${fileName}.wav`
    const bytes = entriesByKey.get(archiveKey)
    if (bytes === undefined) throw new TypeError(`${archiveKey}: decoded Archive entry is missing`)
    const metadata = parseSupportedWavMetadata(bytes)
    const relativePath = `samples/${archiveKey}`
    metadataByFileName.set(fileName, metadata)
    metadataByResourceKey.set(relativePath, metadata)
    return Object.freeze({ bytes, relativePath, sha256: sha256(bytes) })
  })
  return Object.freeze({
    metadataByFileName,
    metadataByResourceKey,
    outputs: Object.freeze(outputs),
  })
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

async function assertExistingOutputMatches(outputs: readonly PreparedOutputFile[]): Promise<void> {
  const existingPaths: string[] = []
  const existingDirectories: string[] = []
  for (const entry of await readdir(outputDirectory, { recursive: true, withFileTypes: true })) {
    const entryPath = relative(outputDirectory, resolve(entry.parentPath, entry.name))
    if (entry.isFile()) existingPaths.push(entryPath)
    else if (entry.isDirectory()) existingDirectories.push(entryPath)
    else throw new TypeError(`${entryPath}: generated output contains an unsupported entry type`)
  }
  existingPaths.sort(compareStrings)
  existingDirectories.sort(compareStrings)
  const expectedPaths = outputs.map(({ relativePath }) => relativePath).sort(compareStrings)
  const expectedDirectories = [
    ...new Set(
      outputs.flatMap(({ relativePath }) => {
        const segments = relativePath.split('/')
        return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'))
      }),
    ),
  ].sort(compareStrings)
  if (
    !isDeepStrictEqual(existingPaths, expectedPaths) ||
    !isDeepStrictEqual(existingDirectories, expectedDirectories)
  ) {
    throw new TypeError('existing generated output has missing, extra, or unsupported entries')
  }

  for (const output of outputs) {
    const path = resolve(outputDirectory, output.relativePath)
    const existing = await readFile(path)
    if (existing.byteLength !== output.bytes.byteLength || sha256(existing) !== output.sha256) {
      throw new TypeError(
        `${output.relativePath}: existing generated output differs; review it before replacement`,
      )
    }
  }
}

async function publishOutputs(
  outputs: readonly PreparedOutputFile[],
): Promise<'created' | 'current'> {
  if (await pathExists(outputDirectory)) {
    await assertExistingOutputMatches(outputs)
    return 'current'
  }

  const outputParent = dirname(outputDirectory)
  await mkdir(outputParent, { recursive: true })
  const stagingDirectory = await mkdtemp(join(outputParent, '.studio-grand-'))
  try {
    for (const output of outputs) {
      const path = resolve(stagingDirectory, output.relativePath)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, output.bytes, { flag: 'wx' })
    }
    await rename(stagingDirectory, outputDirectory)
    return 'created'
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true })
    throw error
  }
}

async function prepareStudioGrand(): Promise<void> {
  const selectedCatalog = await readInputFile('catalog/selected-soundbanks.json')
  const generalMidiIndex = await readInputFile('indexes/by-general-midi-program.json')
  const soundbankMap = await readInputFile('indexes/soundbank-map.json')
  for (const input of [selectedCatalog, generalMidiIndex, soundbankMap]) {
    assertRecordedFingerprint(input)
  }

  const selection = resolveBuiltInSoundbankSource({
    expectedGeneralMidiProgram: GENERAL_MIDI_PROGRAM,
    generalMidiIndex: parseJson(generalMidiIndex.bytes, generalMidiIndex.relativePath),
    selectedCatalog: parseJson(selectedCatalog.bytes, selectedCatalog.relativePath),
    soundbankMap: parseJson(soundbankMap.bytes, soundbankMap.relativePath),
    sourceSlug: SOURCE_SLUG,
  })
  const soundbankCatalog = await readInputFile(selection.catalogRelativePath)
  const mapping = await readInputFile(selection.mappingRelativePath)
  const wavArchive = await readInputFile(selection.wavArchiveRelativePath)
  assertRecordedFingerprint(mapping)
  assertRecordedFingerprint(wavArchive)

  validateBuiltInSoundbankCatalog(
    parseJson(soundbankCatalog.bytes, soundbankCatalog.relativePath),
    selection,
  )
  const mappingInput = parseJson(mapping.bytes, mapping.relativePath)
  const mappingInventory = inspectBuiltInMidiSampleSynthMapping(mappingInput)
  if (
    mappingInventory.sourceSlug !== selection.sourceSlug ||
    mappingInventory.displayName !== selection.displayName
  ) {
    throw new TypeError('Mapping identity differs from the resolved Catalog and Index records')
  }

  const expectedArchiveEntries = [
    selection.embeddedMappingEntryKey,
    ...mappingInventory.sampleFileNames.map((fileName) => `${fileName}.wav`),
  ]
  const archive = await extractRestrictedZipArchive(wavArchive.bytes, {
    expectedEntryKeys: expectedArchiveEntries,
    limits: ZIP_LIMITS,
  })
  const entriesByKey = archiveEntryMap(archive.entries)
  const embeddedMappingBytes = entriesByKey.get(selection.embeddedMappingEntryKey)
  if (embeddedMappingBytes === undefined) throw new TypeError('Archive Mapping entry is missing')
  const embeddedMapping = parseJson(embeddedMappingBytes, selection.embeddedMappingEntryKey)
  if (!isDeepStrictEqual(embeddedMapping, mappingInput)) {
    throw new TypeError('Archive Mapping differs from the external Mapping input')
  }

  const resources = prepareResourceOutputs(mappingInventory.sampleFileNames, entriesByKey)
  const manifest = createManifest(mappingInput, resources.metadataByFileName)
  assertManifestResourceDurations(manifest, resources.metadataByResourceKey)
  const manifestBytes = jsonBytes(manifest)
  const manifestOutput = Object.freeze({
    bytes: manifestBytes,
    relativePath: 'manifest.json',
    sha256: sha256(manifestBytes),
  })

  const inputFiles = [
    selectedCatalog,
    generalMidiIndex,
    soundbankMap,
    soundbankCatalog,
    mapping,
    wavArchive,
  ]
  const report = {
    schema: 'seele.local-sample-instrument-preparation-report',
    schemaVersion: 1,
    soundbankId: SOUND_BANK_ID,
    sourceSlug: selection.sourceSlug,
    generalMidiProgram: selection.generalMidiProgram,
    productPitchRange: {
      maximumPitch: MAXIMUM_PRODUCT_PITCH,
      minimumPitch: MINIMUM_PRODUCT_PITCH,
    },
    archive: {
      compressedByteLength: archive.archiveByteLength,
      entryCount: archive.entries.length,
      totalUncompressedByteLength: archive.totalUncompressedByteLength,
    },
    inputs: inputFiles
      .map(({ bytes, relativePath, sha256: digest }) => ({
        byteLength: bytes.byteLength,
        relativePath,
        sha256: digest,
      }))
      .sort((left, right) => compareStrings(left.relativePath, right.relativePath)),
    manifest: {
      byteLength: manifestOutput.bytes.byteLength,
      relativePath: manifestOutput.relativePath,
      sha256: manifestOutput.sha256,
    },
    resources: resources.outputs.map((output) => {
      const metadata = resources.metadataByResourceKey.get(output.relativePath)
      if (metadata === undefined) throw new TypeError(`${output.relativePath}: metadata is missing`)
      return {
        bitDepth: metadata.bitDepth,
        byteLength: output.bytes.byteLength,
        channelCount: metadata.channelCount,
        durationSecond: metadata.durationSecond,
        relativePath: output.relativePath,
        sampleRateHz: metadata.sampleRateHz,
        sha256: output.sha256,
      }
    }),
  }
  const reportBytes = jsonBytes(report)
  const reportOutput = Object.freeze({
    bytes: reportBytes,
    relativePath: 'preparation-report.json',
    sha256: sha256(reportBytes),
  })
  const outputs = Object.freeze([manifestOutput, reportOutput, ...resources.outputs])
  const status = await publishOutputs(outputs)
  const relativeOutputDirectory = relative(repositoryRoot, outputDirectory)
  console.log(
    status === 'created'
      ? `Prepared Studio Grand local assets in ${relativeOutputDirectory}.`
      : `Studio Grand local assets are already current in ${relativeOutputDirectory}.`,
  )
}

await prepareStudioGrand()
