import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest-validator'
import { parseSupportedWavMetadata } from '#internal/sample-instrument/contract/wav-file'
import {
  estimateSampleInstrumentLoading,
  type SampleInstrumentResourceMeasurement,
} from '#internal/sample-instrument/loading/measurement'
import { collectSampleInstrumentResourceKeysForPitches } from '#internal/sample-instrument/loading/zone-selection'

import { BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS } from './built-in-score-core-local-instruments'

interface ReferenceScoreInstrument {
  readonly pitches: readonly number[]
  readonly soundbankId: string
}

const REFERENCE_SCORE_INSTRUMENTS = Object.freeze<readonly ReferenceScoreInstrument[]>([
  Object.freeze({ pitches: Object.freeze([48, 60, 64, 67, 72]), soundbankId: 'studio-grand' }),
  Object.freeze({ pitches: Object.freeze([36, 40, 43]), soundbankId: 'acoustic-bass' }),
  Object.freeze({ pitches: Object.freeze([67, 71, 74]), soundbankId: 'solo-violin' }),
  Object.freeze({ pitches: Object.freeze([60, 64, 67]), soundbankId: 'viola-section' }),
  Object.freeze({ pitches: Object.freeze([48, 52, 55]), soundbankId: 'cello-section' }),
  Object.freeze({ pitches: Object.freeze([36, 40, 43]), soundbankId: 'double-bass-section' }),
  Object.freeze({
    pitches: Object.freeze([55, 60, 67]),
    soundbankId: 'string-ensemble-tremolo',
  }),
  Object.freeze({
    pitches: Object.freeze([55, 60, 67]),
    soundbankId: 'string-ensemble-pizzicato',
  }),
  Object.freeze({ pitches: Object.freeze([48, 60, 72]), soundbankId: 'orchestral-harp' }),
  Object.freeze({ pitches: Object.freeze([48, 60, 67]), soundbankId: 'string-ensemble' }),
  Object.freeze({ pitches: Object.freeze([60, 64, 67]), soundbankId: 'trumpet' }),
  Object.freeze({ pitches: Object.freeze([60, 64, 67]), soundbankId: 'muted-trumpet' }),
  Object.freeze({ pitches: Object.freeze([48, 52, 55]), soundbankId: 'trombone' }),
  Object.freeze({ pitches: Object.freeze([36, 40, 43]), soundbankId: 'tuba' }),
  Object.freeze({ pitches: Object.freeze([48, 55, 60]), soundbankId: 'french-horn' }),
  Object.freeze({ pitches: Object.freeze([48, 55, 60]), soundbankId: 'brass-ensemble' }),
  Object.freeze({ pitches: Object.freeze([60, 64, 67]), soundbankId: 'oboe' }),
  Object.freeze({ pitches: Object.freeze([48, 52, 55]), soundbankId: 'bassoon' }),
  Object.freeze({ pitches: Object.freeze([55, 60, 64]), soundbankId: 'clarinet' }),
  Object.freeze({ pitches: Object.freeze([72, 76, 79]), soundbankId: 'flute' }),
  Object.freeze({ pitches: Object.freeze([41, 45, 48]), soundbankId: 'timpani' }),
  Object.freeze({
    pitches: Object.freeze([36, 38, 42, 46, 49]),
    soundbankId: 'general-midi-percussion',
  }),
])

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const localSoundbankRoot = resolve(repositoryRoot, 'apps/studio/public/soundbanks')
const generatedRoot = resolve(localSoundbankRoot, 'generated')
const outputPath = resolve(
  localSoundbankRoot,
  'measurements/score-core/runtime-cache-estimate.json',
)

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

async function writeOutput(bytes: Uint8Array): Promise<'created' | 'current'> {
  if (await pathExists(outputPath)) {
    const existing = await readFile(outputPath)
    if (existing.byteLength !== bytes.byteLength || sha256(existing) !== sha256(bytes)) {
      throw new TypeError(
        'existing Score Core runtime cache estimate differs; review it before replacement',
      )
    }
    return 'current'
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, bytes, { flag: 'wx' })
  return 'created'
}

function validateReferenceSet(): void {
  const expected = new Set<string>(
    BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.map(({ preparation }) => preparation.soundbankId),
  )
  const actual = new Set<string>(REFERENCE_SCORE_INSTRUMENTS.map(({ soundbankId }) => soundbankId))
  if (actual.size !== REFERENCE_SCORE_INSTRUMENTS.length) {
    throw new TypeError('reference score repeats a Soundbank')
  }
  const missing = [...expected].filter((soundbankId) => !actual.has(soundbankId)).sort()
  const unexpected = [...actual].filter((soundbankId) => !expected.has(soundbankId)).sort()
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(
      `reference score Soundbank set differs; missing=${missing.join(',')}; unexpected=${unexpected.join(',')}`,
    )
  }
}

async function readManifest(soundbankId: string): Promise<{
  readonly byteLength: number
  readonly manifest: SampleInstrumentManifestV1
  readonly sha256: string
}> {
  const manifestPath = resolve(generatedRoot, soundbankId, 'manifest.json')
  const bytes = await readFile(manifestPath)
  return Object.freeze({
    byteLength: bytes.byteLength,
    manifest: parseSampleInstrumentManifestV1(parseJson(bytes, `${soundbankId}/manifest.json`)),
    sha256: sha256(bytes),
  })
}

async function readResourceMeasurements(
  soundbankId: string,
  manifest: SampleInstrumentManifestV1,
  pitches: readonly number[],
): Promise<readonly SampleInstrumentResourceMeasurement[]> {
  const resourceKeys = collectSampleInstrumentResourceKeysForPitches(manifest, pitches)
  return Promise.all(
    resourceKeys.map(async (key): Promise<SampleInstrumentResourceMeasurement> => {
      const bytes = await readFile(resolve(generatedRoot, soundbankId, key))
      const metadata = parseSupportedWavMetadata(bytes)
      return Object.freeze({
        channelCount: metadata.channelCount,
        encodedByteLength: bytes.byteLength,
        frameCount: metadata.frameCount,
        key,
        sampleRateHz: metadata.sampleRateHz,
      })
    }),
  )
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

validateReferenceSet()
const instruments = await Promise.all(
  REFERENCE_SCORE_INSTRUMENTS.map(async ({ pitches, soundbankId }) => {
    const { byteLength, manifest, sha256: manifestSha256 } = await readManifest(soundbankId)
    if (manifest.soundbankId !== soundbankId) {
      throw new TypeError(`${soundbankId}: Manifest Soundbank identity differs`)
    }
    const resources = await readResourceMeasurements(soundbankId, manifest, pitches)
    return Object.freeze({
      estimate: estimateSampleInstrumentLoading(manifest, resources, pitches),
      manifest: Object.freeze({ byteLength, sha256: manifestSha256 }),
      pitches,
      soundbankId,
    })
  }),
)
const report = {
  schema: 'seele.local-score-core-runtime-cache-estimate',
  schemaVersion: 1,
  referenceScore: {
    aggregate: {
      decodedFloat32ByteLength: sum(
        instruments.map(({ estimate }) => estimate.decodedFloat32ByteLength),
      ),
      encodedByteLength: sum(instruments.map(({ estimate }) => estimate.encodedByteLength)),
      instrumentCount: instruments.length,
      manifestByteLength: sum(instruments.map(({ manifest }) => manifest.byteLength)),
      resourceCount: sum(instruments.map(({ estimate }) => estimate.resourceCount)),
    },
    instruments,
  },
}
const reportBytes = jsonBytes(report)
const status = await writeOutput(reportBytes)
console.log(
  status === 'created'
    ? `Measured Score Core runtime cache in ${relative(repositoryRoot, outputPath)}.`
    : `Score Core runtime cache estimate is already current in ${relative(repositoryRoot, outputPath)}.`,
)
