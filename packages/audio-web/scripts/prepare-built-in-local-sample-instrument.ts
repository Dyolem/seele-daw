import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { parseSoundbankId, type SoundbankId } from '@seele-daw/playback'

import {
  adaptBuiltInMidiSampleSynthMapping,
  inspectBuiltInMidiSampleSynthMapping,
} from '#internal/sample-instrument/assets/built-in-mapping-adapter'
import {
  extractRestrictedZipArchive,
  type RestrictedZipArchiveLimits,
} from '#internal/sample-instrument/assets/restricted-zip'
import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import {
  parseSupportedWavMetadata,
  type SupportedWavMetadata,
} from '#internal/sample-instrument/contract/wav-file'

import {
  resolveBuiltInSoundbankSource,
  validateBuiltInSoundbankCatalog,
} from './built-in-soundbank-source'
import {
  BUILT_IN_LOCAL_MANIFEST_POLICY,
  BuiltInLocalManifestPolicyError,
  applyBuiltInLocalManifestPolicy,
  type BuiltInLocalManifestPolicy,
} from './built-in-local-manifest-policy'
import {
  assertManifestPitchCoverage,
  assertManifestResourceDurations,
  constrainManifestToPitchRange,
} from './prepare-local-sample-instrument'

const SELECTED_CATALOG_RELATIVE_PATH = 'catalog/selected-soundbanks.json'
const GENERAL_MIDI_INDEX_RELATIVE_PATH = 'indexes/by-general-midi-program.json'
const SOUNDBANK_MAP_RELATIVE_PATH = 'indexes/soundbank-map.json'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

export interface BuiltInLocalSampleInstrumentInputFingerprint {
  readonly relativePath: string
  readonly sha256: string
}

export interface BuiltInLocalSampleInstrumentDefinition {
  readonly archiveLimits: RestrictedZipArchiveLimits
  readonly expectedCanonicalForProgram: boolean
  readonly expectedGeneralMidiProgram: number
  readonly expectedInputFingerprints: readonly BuiltInLocalSampleInstrumentInputFingerprint[]
  readonly expectedSourceDisplayName: string
  readonly generatedDirectoryName: string
  readonly manifestPolicy: BuiltInLocalManifestPolicy
  readonly productPitchRange: {
    readonly maximumPitch: number
    readonly minimumPitch: number
  }
  readonly soundbankId: SoundbankId
  readonly sourceSlug: string
}

export interface PrepareBuiltInLocalSampleInstrumentOptions {
  readonly definition: BuiltInLocalSampleInstrumentDefinition
  readonly localSoundbankRoot: string
}

export interface BuiltInLocalSampleInstrumentPreparationResult {
  readonly inventory: BuiltInLocalSampleInstrumentPreparationInventory
  readonly outputDirectory: string
  readonly status: 'created' | 'current'
}

export interface BuiltInLocalSampleInstrumentPreparationInventory {
  readonly archive: {
    readonly compressedByteLength: number
    readonly entryCount: number
    readonly totalUncompressedByteLength: number
  }
  readonly manifest: {
    readonly byteLength: number
    readonly exclusiveGroupZoneCount: number
    readonly loopZoneCount: number
    readonly oneShotZoneCount: number
    readonly sha256: string
    readonly zoneCount: number
  }
  readonly resources: {
    readonly count: number
    readonly decodedFloat32ByteLength: number
    readonly encodedByteLength: number
    readonly maximumDecodedFloat32ByteLength: number
    readonly maximumEncodedByteLength: number
  }
}

export type BuiltInLocalSampleInstrumentPreparationErrorCode =
  | 'archive-mapping-mismatch'
  | 'input-fingerprint-mismatch'
  | 'invalid-definition'
  | 'manifest-policy-mismatch'
  | 'missing-archive-entry'
  | 'output-conflict'
  | 'source-identity-mismatch'
  | 'unsafe-local-path'

/** Stable developer-tool failure for configuration, source, and immutable output drift. */
export class BuiltInLocalSampleInstrumentPreparationError extends TypeError {
  readonly code: BuiltInLocalSampleInstrumentPreparationErrorCode
  readonly detail: string
  readonly relativePath: string | null

  constructor(
    code: BuiltInLocalSampleInstrumentPreparationErrorCode,
    message: string,
    relativePath: string | null = null,
  ) {
    super(relativePath === null ? message : `${relativePath}: ${message}`)
    this.name = 'BuiltInLocalSampleInstrumentPreparationError'
    this.code = code
    this.detail = message
    this.relativePath = relativePath
  }
}

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

interface PreparedResourceOutput extends PreparedOutputFile {
  readonly sourceArchiveKey: string
}

interface ValidatedDefinition extends BuiltInLocalSampleInstrumentDefinition {
  readonly expectedInputSha256ByPath: ReadonlyMap<string, string>
}

function fail(
  code: BuiltInLocalSampleInstrumentPreparationErrorCode,
  message: string,
  relativePath: string | null = null,
): never {
  throw new BuiltInLocalSampleInstrumentPreparationError(code, message, relativePath)
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
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
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
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)
}

function assertNonBlankString(value: string, label: string): void {
  if (value.length === 0 || value.trim() !== value) {
    fail('invalid-definition', `${label} must be a trimmed non-blank string`)
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('invalid-definition', `${label} must be a positive safe integer`)
  }
}

function validateArchiveLimits(limits: RestrictedZipArchiveLimits): void {
  assertPositiveSafeInteger(limits.maximumArchiveByteLength, 'maximumArchiveByteLength')
  assertPositiveSafeInteger(limits.maximumEntryByteLength, 'maximumEntryByteLength')
  assertPositiveSafeInteger(limits.maximumEntryCount, 'maximumEntryCount')
  assertPositiveSafeInteger(
    limits.maximumTotalUncompressedByteLength,
    'maximumTotalUncompressedByteLength',
  )
  if (!Number.isFinite(limits.maximumCompressionRatio) || limits.maximumCompressionRatio < 1) {
    fail('invalid-definition', 'maximumCompressionRatio must be finite and at least 1')
  }
}

function assertSafeRelativePath(localSoundbankRoot: string, relativePath: string): void {
  if (
    relativePath.length === 0 ||
    relativePath.trim() !== relativePath ||
    isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.includes('\0')
  ) {
    fail('unsafe-local-path', 'local path must be a trimmed non-blank relative path', relativePath)
  }
  const absolutePath = resolve(localSoundbankRoot, relativePath)
  const pathFromRoot = relative(localSoundbankRoot, absolutePath)
  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '') {
    fail('unsafe-local-path', 'local path escapes the Soundbank root', relativePath)
  }
}

function validateDefinition(
  definition: BuiltInLocalSampleInstrumentDefinition,
  localSoundbankRoot: string,
): ValidatedDefinition {
  parseSoundbankId(definition.soundbankId)
  if (typeof definition.expectedCanonicalForProgram !== 'boolean') {
    fail('invalid-definition', 'expectedCanonicalForProgram must be a boolean')
  }
  assertNonBlankString(definition.expectedSourceDisplayName, 'expectedSourceDisplayName')
  assertNonBlankString(definition.sourceSlug, 'sourceSlug')
  if (
    definition.manifestPolicy !== BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1 &&
    definition.manifestPolicy !== BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1
  ) {
    fail('invalid-definition', 'manifestPolicy must name a supported reviewed policy')
  }
  if (
    !Number.isInteger(definition.expectedGeneralMidiProgram) ||
    definition.expectedGeneralMidiProgram < -1 ||
    definition.expectedGeneralMidiProgram > 127
  ) {
    fail(
      'invalid-definition',
      'expectedGeneralMidiProgram must be -1 for percussion or a Program from 0 through 127',
    )
  }
  const { maximumPitch, minimumPitch } = definition.productPitchRange
  if (
    !Number.isInteger(minimumPitch) ||
    !Number.isInteger(maximumPitch) ||
    minimumPitch < 0 ||
    maximumPitch > 127 ||
    minimumPitch > maximumPitch
  ) {
    fail('invalid-definition', 'productPitchRange must be ordered MIDI pitches from 0 through 127')
  }
  if (
    definition.generatedDirectoryName.length === 0 ||
    definition.generatedDirectoryName.trim() !== definition.generatedDirectoryName ||
    definition.generatedDirectoryName === '.' ||
    definition.generatedDirectoryName === '..' ||
    definition.generatedDirectoryName.includes('/') ||
    definition.generatedDirectoryName.includes('\\') ||
    definition.generatedDirectoryName.includes('\0')
  ) {
    fail('invalid-definition', 'generatedDirectoryName must be one safe non-blank path segment')
  }
  validateArchiveLimits(definition.archiveLimits)

  const expectedInputSha256ByPath = new Map<string, string>()
  for (const fingerprint of definition.expectedInputFingerprints) {
    assertSafeRelativePath(localSoundbankRoot, fingerprint.relativePath)
    if (!SHA256_PATTERN.test(fingerprint.sha256)) {
      fail(
        'invalid-definition',
        'expected input SHA-256 must be 64 lowercase hexadecimal characters',
        fingerprint.relativePath,
      )
    }
    if (expectedInputSha256ByPath.has(fingerprint.relativePath)) {
      fail(
        'invalid-definition',
        'expected input fingerprint is duplicated',
        fingerprint.relativePath,
      )
    }
    expectedInputSha256ByPath.set(fingerprint.relativePath, fingerprint.sha256)
  }

  return Object.freeze({ ...definition, expectedInputSha256ByPath })
}

function resolveLocalInput(localSoundbankRoot: string, relativePath: string): string {
  assertSafeRelativePath(localSoundbankRoot, relativePath)
  return resolve(localSoundbankRoot, relativePath)
}

async function readInputFile(localSoundbankRoot: string, relativePath: string): Promise<InputFile> {
  const bytes = await readFile(resolveLocalInput(localSoundbankRoot, relativePath))
  return Object.freeze({ bytes, relativePath, sha256: sha256(bytes) })
}

function assertRecordedFingerprint(input: InputFile, definition: ValidatedDefinition): void {
  const expected = definition.expectedInputSha256ByPath.get(input.relativePath)
  if (expected === undefined) {
    fail('invalid-definition', 'input has no recorded fingerprint', input.relativePath)
  }
  if (input.sha256 !== expected) {
    fail(
      'input-fingerprint-mismatch',
      'input fingerprint changed; review the new source before normalization',
      input.relativePath,
    )
  }
}

function assertExactFingerprintSet(
  inputs: readonly InputFile[],
  definition: ValidatedDefinition,
): void {
  const inputPaths = new Set(inputs.map(({ relativePath }) => relativePath))
  for (const expectedPath of definition.expectedInputSha256ByPath.keys()) {
    if (!inputPaths.has(expectedPath)) {
      fail(
        'invalid-definition',
        'recorded fingerprint does not belong to a resolved input',
        expectedPath,
      )
    }
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
  resourceKeyByFileName: ReadonlyMap<string, string>,
  definition: ValidatedDefinition,
): SampleInstrumentManifestV1 {
  const manifest = adaptBuiltInMidiSampleSynthMapping(mappingInput, {
    resolveWavResource: ({ fileName }) => {
      const metadata = wavMetadataByFileName.get(fileName)
      if (metadata === undefined) throw new TypeError(`WAV metadata is missing for ${fileName}`)
      const resourceKey = resourceKeyByFileName.get(fileName)
      if (resourceKey === undefined) {
        throw new TypeError(`normalized WAV resource key is missing for ${fileName}`)
      }
      return {
        key: resourceKey,
        sourceSampleRateHz: metadata.sampleRateHz,
      }
    },
    soundbankId: definition.soundbankId,
  })
  const constrained = constrainManifestToPitchRange(
    manifest,
    definition.productPitchRange.minimumPitch,
    definition.productPitchRange.maximumPitch,
  )
  let policyApplied: SampleInstrumentManifestV1
  try {
    policyApplied = applyBuiltInLocalManifestPolicy(constrained, {
      policy: definition.manifestPolicy,
      sourceSlug: definition.sourceSlug,
    })
  } catch (error) {
    if (error instanceof BuiltInLocalManifestPolicyError) {
      fail('manifest-policy-mismatch', error.detail)
    }
    throw error
  }
  assertManifestPitchCoverage(
    policyApplied,
    definition.productPitchRange.minimumPitch,
    definition.productPitchRange.maximumPitch,
  )
  return policyApplied
}

function prepareResourceOutputs(
  sampleFileNames: readonly string[],
  entriesByKey: ReadonlyMap<string, Uint8Array>,
): {
  readonly metadataByFileName: ReadonlyMap<string, SupportedWavMetadata>
  readonly metadataByResourceKey: ReadonlyMap<string, SupportedWavMetadata>
  readonly outputs: readonly PreparedResourceOutput[]
  readonly resourceKeyByFileName: ReadonlyMap<string, string>
} {
  const metadataByFileName = new Map<string, SupportedWavMetadata>()
  const metadataByResourceKey = new Map<string, SupportedWavMetadata>()
  const resourceKeyByFileName = new Map<string, string>()
  const outputs = sampleFileNames.map((fileName, index): PreparedResourceOutput => {
    const archiveKey = `${fileName}.wav`
    const bytes = entriesByKey.get(archiveKey)
    if (bytes === undefined) {
      fail('missing-archive-entry', 'decoded Archive entry is missing', archiveKey)
    }
    const metadata = parseSupportedWavMetadata(bytes)
    const digest = sha256(bytes)
    // Source names may contain URL delimiters such as '#'. The normalized product
    // asset name is deliberately opaque, deterministic, and safe in browser paths.
    const relativePath = `samples/sample-${String(index + 1).padStart(4, '0')}-${digest.slice(0, 12)}.wav`
    metadataByFileName.set(fileName, metadata)
    metadataByResourceKey.set(relativePath, metadata)
    resourceKeyByFileName.set(fileName, relativePath)
    return Object.freeze({
      bytes,
      relativePath,
      sha256: digest,
      sourceArchiveKey: archiveKey,
    })
  })
  return Object.freeze({
    metadataByFileName,
    metadataByResourceKey,
    outputs: Object.freeze(outputs),
    resourceKeyByFileName,
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

async function assertExistingOutputMatches(
  outputDirectory: string,
  outputs: readonly PreparedOutputFile[],
): Promise<void> {
  const existingPaths: string[] = []
  const existingDirectories: string[] = []
  for (const entry of await readdir(outputDirectory, { recursive: true, withFileTypes: true })) {
    const entryPath = relative(outputDirectory, resolve(entry.parentPath, entry.name))
    if (entry.isFile()) existingPaths.push(entryPath)
    else if (entry.isDirectory()) existingDirectories.push(entryPath)
    else fail('output-conflict', 'generated output contains an unsupported entry type', entryPath)
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
    fail('output-conflict', 'existing generated output has missing, extra, or unsupported entries')
  }

  for (const output of outputs) {
    const path = resolve(outputDirectory, output.relativePath)
    const existing = await readFile(path)
    if (existing.byteLength !== output.bytes.byteLength || sha256(existing) !== output.sha256) {
      fail(
        'output-conflict',
        'existing generated output differs; review it before replacement',
        output.relativePath,
      )
    }
  }
}

async function publishOutputs(
  outputDirectory: string,
  stagingDirectoryPrefix: string,
  outputs: readonly PreparedOutputFile[],
): Promise<'created' | 'current'> {
  if (await pathExists(outputDirectory)) {
    await assertExistingOutputMatches(outputDirectory, outputs)
    return 'current'
  }

  const outputParent = dirname(outputDirectory)
  await mkdir(outputParent, { recursive: true })
  const stagingDirectory = await mkdtemp(join(outputParent, `.${stagingDirectoryPrefix}-`))
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

/** Normalizes one reviewed local built-in source into immutable Manifest/WAV developer assets. */
export async function prepareBuiltInLocalSampleInstrument(
  options: PrepareBuiltInLocalSampleInstrumentOptions,
): Promise<BuiltInLocalSampleInstrumentPreparationResult> {
  const localSoundbankRoot = resolve(options.localSoundbankRoot)
  const definition = validateDefinition(options.definition, localSoundbankRoot)
  const outputDirectory = resolve(
    localSoundbankRoot,
    'generated',
    definition.generatedDirectoryName,
  )

  const selectedCatalog = await readInputFile(localSoundbankRoot, SELECTED_CATALOG_RELATIVE_PATH)
  const generalMidiIndex = await readInputFile(localSoundbankRoot, GENERAL_MIDI_INDEX_RELATIVE_PATH)
  const soundbankMap = await readInputFile(localSoundbankRoot, SOUNDBANK_MAP_RELATIVE_PATH)
  for (const input of [selectedCatalog, generalMidiIndex, soundbankMap]) {
    assertRecordedFingerprint(input, definition)
  }

  const selection = resolveBuiltInSoundbankSource({
    expectedCanonicalForProgram: definition.expectedCanonicalForProgram,
    expectedGeneralMidiProgram: definition.expectedGeneralMidiProgram,
    generalMidiIndex: parseJson(generalMidiIndex.bytes, generalMidiIndex.relativePath),
    selectedCatalog: parseJson(selectedCatalog.bytes, selectedCatalog.relativePath),
    soundbankMap: parseJson(soundbankMap.bytes, soundbankMap.relativePath),
    sourceSlug: definition.sourceSlug,
  })
  const soundbankCatalog = await readInputFile(localSoundbankRoot, selection.catalogRelativePath)
  const mapping = await readInputFile(localSoundbankRoot, selection.mappingRelativePath)
  const wavArchive = await readInputFile(localSoundbankRoot, selection.wavArchiveRelativePath)
  for (const input of [soundbankCatalog, mapping, wavArchive]) {
    assertRecordedFingerprint(input, definition)
  }

  const inputFiles = [
    selectedCatalog,
    generalMidiIndex,
    soundbankMap,
    soundbankCatalog,
    mapping,
    wavArchive,
  ]
  assertExactFingerprintSet(inputFiles, definition)
  validateBuiltInSoundbankCatalog(
    parseJson(soundbankCatalog.bytes, soundbankCatalog.relativePath),
    selection,
  )
  const mappingInput = parseJson(mapping.bytes, mapping.relativePath)
  const mappingInventory = inspectBuiltInMidiSampleSynthMapping(mappingInput)
  if (
    selection.displayName !== definition.expectedSourceDisplayName ||
    mappingInventory.sourceSlug !== selection.sourceSlug ||
    mappingInventory.displayName !== selection.displayName
  ) {
    fail('source-identity-mismatch', 'Mapping identity differs from the Catalog and Index records')
  }

  const expectedArchiveEntries = [
    selection.embeddedMappingEntryKey,
    ...mappingInventory.sampleFileNames.map((fileName) => `${fileName}.wav`),
  ]
  const archive = await extractRestrictedZipArchive(wavArchive.bytes, {
    expectedEntryKeys: expectedArchiveEntries,
    limits: definition.archiveLimits,
  })
  const entriesByKey = archiveEntryMap(archive.entries)
  const embeddedMappingBytes = entriesByKey.get(selection.embeddedMappingEntryKey)
  if (embeddedMappingBytes === undefined) {
    fail(
      'missing-archive-entry',
      'Archive Mapping entry is missing',
      selection.embeddedMappingEntryKey,
    )
  }
  const embeddedMapping = parseJson(embeddedMappingBytes, selection.embeddedMappingEntryKey)
  if (!isDeepStrictEqual(embeddedMapping, mappingInput)) {
    fail('archive-mapping-mismatch', 'Archive Mapping differs from the external Mapping input')
  }

  const resources = prepareResourceOutputs(mappingInventory.sampleFileNames, entriesByKey)
  const manifest = createManifest(
    mappingInput,
    resources.metadataByFileName,
    resources.resourceKeyByFileName,
    definition,
  )
  assertManifestResourceDurations(manifest, resources.metadataByResourceKey)
  const manifestBytes = jsonBytes(manifest)
  const manifestOutput = Object.freeze({
    bytes: manifestBytes,
    relativePath: 'manifest.json',
    sha256: sha256(manifestBytes),
  })

  const report = {
    schema: 'seele.local-sample-instrument-preparation-report',
    schemaVersion: 2,
    soundbankId: definition.soundbankId,
    sourceSlug: selection.sourceSlug,
    generalMidiProgram: selection.generalMidiProgram,
    productPitchRange: {
      maximumPitch: definition.productPitchRange.maximumPitch,
      minimumPitch: definition.productPitchRange.minimumPitch,
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
        sourceArchiveKey: output.sourceArchiveKey,
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
  const status = await publishOutputs(outputDirectory, definition.generatedDirectoryName, outputs)
  const decodedResourceByteLengths = resources.outputs.map((output) => {
    const metadata = resources.metadataByResourceKey.get(output.relativePath)
    if (metadata === undefined) throw new TypeError(`${output.relativePath}: metadata is missing`)
    return metadata.frameCount * metadata.channelCount * Float32Array.BYTES_PER_ELEMENT
  })
  const inventory = Object.freeze({
    archive: Object.freeze({
      compressedByteLength: archive.archiveByteLength,
      entryCount: archive.entries.length,
      totalUncompressedByteLength: archive.totalUncompressedByteLength,
    }),
    manifest: Object.freeze({
      byteLength: manifestOutput.bytes.byteLength,
      exclusiveGroupZoneCount: manifest.zones.filter((zone) => zone.exclusiveGroup !== null).length,
      loopZoneCount: manifest.zones.filter((zone) => zone.loop.kind !== 'none').length,
      oneShotZoneCount: manifest.zones.filter((zone) => zone.triggerMode === 'one-shot').length,
      sha256: manifestOutput.sha256,
      zoneCount: manifest.zones.length,
    }),
    resources: Object.freeze({
      count: resources.outputs.length,
      decodedFloat32ByteLength: decodedResourceByteLengths.reduce(
        (total, byteLength) => total + byteLength,
        0,
      ),
      encodedByteLength: resources.outputs.reduce(
        (total, output) => total + output.bytes.byteLength,
        0,
      ),
      maximumDecodedFloat32ByteLength: Math.max(...decodedResourceByteLengths),
      maximumEncodedByteLength: Math.max(
        ...resources.outputs.map((output) => output.bytes.byteLength),
      ),
    }),
  })
  return Object.freeze({ inventory, outputDirectory, status })
}
