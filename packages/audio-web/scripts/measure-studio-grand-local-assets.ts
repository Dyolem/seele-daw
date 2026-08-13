import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest'
import { parseSampleInstrumentManifestV1 } from '#internal/sample-instrument/contract/manifest-validator'
import {
  estimateSampleInstrumentLoading,
  measureSampleInstrumentPitchForAudition,
  type SampleInstrumentResourceMeasurement,
} from '#internal/sample-instrument/loading/measurement'
import { parseSupportedWavMetadata } from '#internal/sample-instrument/contract/wav-file'

const REFERENCE_INITIAL_WINDOW_PITCHES = Object.freeze([48, 60, 64, 67, 72])
const REFERENCE_NOTE_DURATIONS_SECOND = Object.freeze([0.08, 0.25, 1, 4, 10])
const REFERENCE_VELOCITIES = Object.freeze([32, 64, 96, 127])

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const localSoundbankRoot = resolve(repositoryRoot, 'apps/studio/public/soundbanks')
const preparedAssetDirectory = resolve(localSoundbankRoot, 'generated/studio-grand')
const outputPath = resolve(localSoundbankRoot, 'measurements/studio-grand/loading-estimate.json')
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const textEncoder = new TextEncoder()

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

async function readResourceMeasurements(
  manifest: SampleInstrumentManifestV1,
): Promise<readonly SampleInstrumentResourceMeasurement[]> {
  const keys = [...new Set(manifest.zones.map(({ resource }) => resource.key))].sort()
  return Promise.all(
    keys.map(async (key): Promise<SampleInstrumentResourceMeasurement> => {
      const bytes = await readFile(resolve(preparedAssetDirectory, key))
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

function minimumManifestPitch(manifest: SampleInstrumentManifestV1): number {
  const first = manifest.zones[0]
  if (first === undefined) throw new TypeError('Manifest has no Zones')
  return first.selector.kind === 'exact-midi' ? first.selector.pitch : first.selector.minimumPitch
}

function maximumManifestPitch(manifest: SampleInstrumentManifestV1): number {
  const last = manifest.zones.at(-1)
  if (last === undefined) throw new TypeError('Manifest has no Zones')
  return last.selector.kind === 'exact-midi' ? last.selector.pitch : last.selector.maximumPitch
}

function summarizeNaturalEnds(
  manifest: SampleInstrumentManifestV1,
  resources: readonly SampleInstrumentResourceMeasurement[],
) {
  const minimumPitch = minimumManifestPitch(manifest)
  const maximumPitch = maximumManifestPitch(manifest)
  const pitchMeasurements = Array.from({ length: maximumPitch - minimumPitch + 1 }, (_, offset) =>
    measureSampleInstrumentPitchForAudition(manifest, resources, minimumPitch + offset),
  )
  return REFERENCE_NOTE_DURATIONS_SECOND.map((noteDurationSecond) => {
    const pitchesEndingBeforeNoteOff = pitchMeasurements
      .filter(
        ({ effectiveNaturalEndSecond }) =>
          effectiveNaturalEndSecond !== null && effectiveNaturalEndSecond < noteDurationSecond,
      )
      .map(({ pitch }) => pitch)
    return {
      noteDurationSecond,
      pitchCountEndingBeforeNoteOff: pitchesEndingBeforeNoteOff.length,
      pitchesEndingBeforeNoteOff,
    }
  })
}

async function writeOutput(bytes: Uint8Array): Promise<'created' | 'current'> {
  if (await pathExists(outputPath)) {
    const existing = await readFile(outputPath)
    if (existing.byteLength !== bytes.byteLength || sha256(existing) !== sha256(bytes)) {
      throw new TypeError('existing loading estimate differs; review it before replacement')
    }
    return 'current'
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, bytes, { flag: 'wx' })
  return 'created'
}

async function measureStudioGrand(): Promise<void> {
  const manifestPath = resolve(preparedAssetDirectory, 'manifest.json')
  const manifestBytes = await readFile(manifestPath)
  const manifest = parseSampleInstrumentManifestV1(parseJson(manifestBytes, 'manifest.json'))
  const resources = await readResourceMeasurements(manifest)
  const fullInstrument = estimateSampleInstrumentLoading(manifest, resources)
  const referenceInitialWindow = estimateSampleInstrumentLoading(
    manifest,
    resources,
    REFERENCE_INITIAL_WINDOW_PITCHES,
  )
  const formats = [
    ...new Set(
      resources.map(
        ({ channelCount, sampleRateHz }) => `${channelCount}ch-float32-${sampleRateHz}hz`,
      ),
    ),
  ].sort()
  const report = {
    schema: 'seele.local-sample-instrument-loading-estimate',
    schemaVersion: 1,
    soundbankId: manifest.soundbankId,
    manifest: {
      relativePath: relative(localSoundbankRoot, manifestPath),
      sha256: sha256(manifestBytes),
    },
    pitchRange: {
      maximumPitch: maximumManifestPitch(manifest),
      minimumPitch: minimumManifestPitch(manifest),
    },
    decodedAudioFormats: formats,
    fullInstrument,
    referenceInitialWindow: {
      pitches: REFERENCE_INITIAL_WINDOW_PITCHES,
      ...referenceInitialWindow,
    },
    auditionVectors: {
      noteDurationsSecond: REFERENCE_NOTE_DURATIONS_SECOND,
      velocities: REFERENCE_VELOCITIES,
    },
    naturalEndByNoteDuration: summarizeNaturalEnds(manifest, resources),
  }
  const status = await writeOutput(jsonBytes(report))
  const output = relative(repositoryRoot, outputPath)
  console.log(
    status === 'created'
      ? `Measured Studio Grand local assets in ${output}.`
      : `Studio Grand local loading estimate is already current in ${output}.`,
  )
}

await measureStudioGrand()
