import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const localSoundbankRoot = path.join(repositoryRoot, 'apps/studio/public/soundbanks')
const outputPath = path.join(
  repositoryRoot,
  'apps/studio/src/workbench/instrument/built-in-instrument-preset-source-snapshot.json',
)
const sampleFingerprintOutputPath = path.join(
  repositoryRoot,
  'packages/audio-web/scripts/built-in-sample-preset-source-fingerprints.json',
)

const sourcePaths = Object.freeze({
  catalogue: 'catalog/selected-soundbanks.json',
  generalMidiIndex: 'indexes/by-general-midi-program.json',
  soundbankMap: 'indexes/soundbank-map.json',
})
const expectedSourceSha256 = Object.freeze({
  catalogue: 'a1925bfec6e389fd37a901e21d571bdfd0ccfec162f3809c8fae95eaf268a924',
  generalMidiIndex: '12e42ec8d9131973317ae805c5d120426b95ec8abdda87f596e355dd39a0df66',
  soundbankMap: '58e800e66415f24665926a945f732f93ac4abb99923d0d078f96e94aa140138d',
})
const expectedSampleInputSetSha256 =
  '179c26c7e23a0f9b6ebed3d802f2179cc681f9d8f617032788b837bc5b523555'
const supportedEngines = new Set(['MIDISampleSynth', 'VASynth', 'FMSynth'])
const supportedCategoryIds = new Set([
  'bass',
  'brass',
  'drum-kit',
  'drum-pads',
  'guitars',
  'percussion',
  'piano',
  'special-effects',
  'strings',
  'synth-bass',
  'synth-keys',
  'synth-leads',
  'synth-pads',
  'voices',
  'wind',
])

// These identities already exist in Project files and generated developer assets.
const stableSoundbankIdOverrides = new Map([
  ['acoustic-bass-legato-v2-v4', 'acoustic-bass'],
  ['full-strings-tremolo-v3-v4', 'string-ensemble-tremolo'],
  ['full-strings-pizzicato-v3-v4', 'string-ensemble-pizzicato'],
  ['harp-v2-v4', 'orchestral-harp'],
  ['string-orchestra-v2-v4', 'string-ensemble'],
  ['trumpet-straight-mute-v4', 'muted-trumpet'],
  ['trombone-hard-v4-v4', 'trombone'],
  ['full-brass-v2-v4', 'brass-ensemble'],
  ['studio-harpsichord-v3-v4', 'studio-harpsichord'],
  ['sparkling-acoustic-v2-v4', 'sparkling-acoustic'],
  ['guitar-power-chord-v2-v4', 'guitar-power-chord'],
  ['deep-house-bass-v3-v4', 'deep-house-bass'],
  ['general-midi-drums-hiphop-v3-v4', 'general-midi-drums-hiphop'],
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readPinnedJson(key) {
  const relativePath = sourcePaths[key]
  const bytes = await readFile(path.join(localSoundbankRoot, relativePath))
  const actualSha256 = sha256(bytes)
  if (actualSha256 !== expectedSourceSha256[key]) {
    throw new TypeError(
      `${relativePath}: source changed; audit it before regenerating the snapshot`,
    )
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function sampleSourcePath(sourcePresetId, suffix) {
  return `soundbanks/MIDISampleSynth/${sourcePresetId}/${sourcePresetId}${suffix}`
}

async function createSampleFingerprintSnapshot(presets) {
  const aggregateInputs = Object.entries(sourcePaths).map(([key, relativePath]) => ({
    relativePath,
    sha256: expectedSourceSha256[key],
  }))
  const sources = []
  for (const preset of presets) {
    if (preset.engine !== 'MIDISampleSynth' || preset.soundbankId === null) continue
    const inputPaths = {
      archive: sampleSourcePath(preset.sourcePresetId, '-wav.zip'),
      catalog: sampleSourcePath(preset.sourcePresetId, '.catalog.json'),
      mapping: sampleSourcePath(preset.sourcePresetId, '.mapping.json'),
    }
    const sourceHashes = {}
    for (const [kind, relativePath] of Object.entries(inputPaths)) {
      const digest = sha256(await readFile(path.join(localSoundbankRoot, relativePath)))
      sourceHashes[kind] = digest
      aggregateInputs.push({ relativePath, sha256: digest })
    }
    sources.push({
      categoryId: preset.categoryId,
      displayName: preset.displayName,
      generalMidiProgram: preset.generalMidiProgram,
      isCanonicalForProgram: preset.isCanonicalForProgram,
      soundbankId: preset.soundbankId,
      sourceHashes,
      sourcePresetId: preset.sourcePresetId,
    })
  }

  const aggregate = createHash('sha256')
  for (const { relativePath, sha256: digest } of aggregateInputs.sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
  )) {
    aggregate.update(relativePath)
    aggregate.update('\0')
    aggregate.update(digest)
    aggregate.update('\n')
  }
  const inputSetSha256 = aggregate.digest('hex')
  if (inputSetSha256 !== expectedSampleInputSetSha256 || sources.length !== 289) {
    throw new TypeError('Complete MIDISampleSynth input set differs from the reviewed snapshot')
  }
  return {
    schema: 'seele.built-in-sample-preset-source-fingerprints',
    schemaVersion: 1,
    commonSourceSha256: expectedSourceSha256,
    inputFileCount: aggregateInputs.length,
    inputSetSha256,
    sources,
  }
}

function readNonBlankString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a trimmed non-blank string`)
  }
  return value
}

function createSoundbankId(sourcePresetId, displayName) {
  const override = stableSoundbankIdOverrides.get(sourcePresetId)
  if (override !== undefined) return override
  const soundbankId = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return readNonBlankString(soundbankId, `${sourcePresetId}.soundbankId`)
}

function createPreset(source, sourceIndex, soundbankMap) {
  const pathPrefix = `catalogue[${sourceIndex}]`
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${pathPrefix} must be an object`)
  }
  const sourcePresetId = readNonBlankString(source.slug, `${pathPrefix}.slug`)
  const displayName = readNonBlankString(source.name, `${pathPrefix}.name`)
  const subtitle = readNonBlankString(source.subTitle, `${pathPrefix}.subTitle`)
  const categoryId = readNonBlankString(source.instrumentSlug, `${pathPrefix}.instrumentSlug`)
  const engine = readNonBlankString(source.synth, `${pathPrefix}.synth`)
  if (!supportedCategoryIds.has(categoryId)) {
    throw new TypeError(`${pathPrefix}.instrumentSlug is not a reviewed category`)
  }
  if (!supportedEngines.has(engine)) {
    throw new TypeError(`${pathPrefix}.synth is not a reviewed engine`)
  }

  const indexed = soundbankMap.bySlug?.[sourcePresetId]
  if (indexed === null || typeof indexed !== 'object' || Array.isArray(indexed)) {
    throw new TypeError(`${sourcePresetId}: Soundbank index entry is missing`)
  }
  if (indexed.name !== displayName || indexed.engine !== engine) {
    throw new TypeError(`${sourcePresetId}: Catalogue and Soundbank index identities differ`)
  }
  const generalMidi = indexed.generalMidi
  if (generalMidi === null || typeof generalMidi !== 'object' || Array.isArray(generalMidi)) {
    throw new TypeError(`${sourcePresetId}: General MIDI index metadata is missing`)
  }
  if (
    !Number.isInteger(generalMidi.programChange) ||
    generalMidi.programChange < -1 ||
    generalMidi.programChange > 127 ||
    typeof generalMidi.isCanonicalForProgram !== 'boolean'
  ) {
    throw new TypeError(`${sourcePresetId}: General MIDI index metadata is malformed`)
  }

  return {
    categoryId,
    displayName,
    engine,
    generalMidiProgram: generalMidi.programChange,
    isCanonicalForProgram: generalMidi.isCanonicalForProgram,
    soundbankId:
      engine === 'MIDISampleSynth' ? createSoundbankId(sourcePresetId, displayName) : null,
    sourcePresetId,
    subtitle,
  }
}

const catalogue = await readPinnedJson('catalogue')
await readPinnedJson('generalMidiIndex')
const soundbankMap = await readPinnedJson('soundbankMap')
if (!Array.isArray(catalogue) || catalogue.length !== 439) {
  throw new TypeError('Selected built-in Preset Catalogue must contain exactly 439 entries')
}
const presets = catalogue.map((source, index) => createPreset(source, index, soundbankMap))
const sourcePresetIds = new Set(presets.map(({ sourcePresetId }) => sourcePresetId))
if (sourcePresetIds.size !== presets.length) {
  throw new TypeError('Built-in Preset source identities must be unique')
}
const playableSoundbankIds = presets.flatMap(({ soundbankId }) =>
  soundbankId === null ? [] : [soundbankId],
)
if (new Set(playableSoundbankIds).size !== 289 || playableSoundbankIds.length !== 289) {
  throw new TypeError('MIDISampleSynth Soundbank identities must contain 289 unique entries')
}

const snapshot = {
  schema: 'seele.built-in-instrument-preset-source-snapshot',
  schemaVersion: 1,
  sourceSha256: expectedSourceSha256,
  presets,
}
const sampleFingerprintSnapshot = await createSampleFingerprintSnapshot(presets)
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`)
await writeFile(
  sampleFingerprintOutputPath,
  `${JSON.stringify(sampleFingerprintSnapshot, null, 2)}\n`,
)
console.log(`${path.relative(repositoryRoot, outputPath)}: wrote ${presets.length} Presets`)
console.log(
  `${path.relative(repositoryRoot, sampleFingerprintOutputPath)}: wrote ${sampleFingerprintSnapshot.sources.length} sample fingerprints`,
)
