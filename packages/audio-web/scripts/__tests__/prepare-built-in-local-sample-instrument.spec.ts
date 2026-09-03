import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'

import { parseSoundbankId } from '@seele-daw/playback'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

import {
  BuiltInLocalSampleInstrumentPreparationError,
  prepareBuiltInLocalSampleInstrument,
  type BuiltInLocalSampleInstrumentDefinition,
} from '../prepare-built-in-local-sample-instrument'

const SOURCE_SLUG = 'fixture-strings-v1'
const SAMPLE_FILE_NAME = '060-Fixture-Strings'
const SOURCE_DIRECTORY = `soundbanks/MIDISampleSynth/${SOURCE_SLUG}`
const temporaryRoots: string[] = []
const textEncoder = new TextEncoder()

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function writeFourCc(view: DataView, offset: number, value: string): void {
  for (const [index, character] of [...value].entries()) {
    view.setUint8(offset + index, character.charCodeAt(0))
  }
}

function createFixtureWav(): Uint8Array {
  const frameCount = 4
  const channelCount = 1
  const bitDepth = 16
  const sampleRateHz = 8_000
  const blockAlign = channelCount * (bitDepth / 8)
  const dataByteLength = frameCount * blockAlign
  const bytes = new Uint8Array(44 + dataByteLength)
  const view = new DataView(bytes.buffer)
  writeFourCc(view, 0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  writeFourCc(view, 8, 'WAVE')
  writeFourCc(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRateHz, true)
  view.setUint32(28, sampleRateHz * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeFourCc(view, 36, 'data')
  view.setUint32(40, dataByteLength, true)
  return bytes
}

interface PreparationFixture {
  readonly definition: BuiltInLocalSampleInstrumentDefinition
  readonly localSoundbankRoot: string
  readonly mappingPath: string
  readonly outputDirectory: string
}

async function createPreparationFixture(): Promise<PreparationFixture> {
  const localSoundbankRoot = await mkdtemp(join(tmpdir(), 'seele-multi-instrument-'))
  temporaryRoots.push(localSoundbankRoot)
  const sourceDirectory = join(localSoundbankRoot, SOURCE_DIRECTORY)
  await Promise.all([
    mkdir(join(localSoundbankRoot, 'catalog'), { recursive: true }),
    mkdir(join(localSoundbankRoot, 'indexes'), { recursive: true }),
    mkdir(sourceDirectory, { recursive: true }),
  ])

  const archiveFileName = `${SOURCE_SLUG}-wav.zip`
  const selectedCatalog = [
    {
      archive: { wav: `https://static.example.test/${archiveFileName}` },
      name: 'Fixture Strings',
      slug: SOURCE_SLUG,
      synth: 'MIDISampleSynth',
    },
  ]
  const generalMidiIndex = {
    48: {
      canonicalSoundbank: SOURCE_SLUG,
      name: 'String Ensemble 01',
      programChange: 48,
      soundbanks: [
        {
          engine: 'MIDISampleSynth',
          isCanonicalForProgram: true,
          name: 'Fixture Strings',
          slug: SOURCE_SLUG,
        },
      ],
    },
  }
  const soundbankCatalog = {
    archive: { wav: `https://static.example.test/${archiveFileName}` },
    name: 'Fixture Strings',
    slug: SOURCE_SLUG,
    synth: 'MIDISampleSynth',
  }
  const soundbankMap = {
    bySlug: {
      [SOURCE_SLUG]: {
        archives: {
          wav: {
            available: true,
            fileName: archiveFileName,
            relativePath: `${SOURCE_DIRECTORY}/${archiveFileName}`,
            selectedForDownload: true,
          },
        },
        catalogFile: {
          fileName: `${SOURCE_SLUG}.catalog.json`,
          relativePath: `${SOURCE_DIRECTORY}/${SOURCE_SLUG}.catalog.json`,
        },
        directory: SOURCE_DIRECTORY,
        engine: 'MIDISampleSynth',
        generalMidi: {
          canonicalSoundbank: SOURCE_SLUG,
          isCanonicalForProgram: true,
          programChange: 48,
        },
        mappingFile: {
          fileName: `${SOURCE_SLUG}.mapping.json`,
          relativePath: `${SOURCE_DIRECTORY}/${SOURCE_SLUG}.mapping.json`,
        },
        name: 'Fixture Strings',
        slug: SOURCE_SLUG,
      },
    },
  }
  const mapping = {
    category: 'instrument',
    color: '000000',
    defaultOctave: 48,
    defaultPreset: '',
    filters: ['instrument-type-strings'],
    instrumentSlug: 'strings',
    isDeprecated: false,
    name: 'Fixture Strings',
    release: 0.1,
    samples: [
      {
        crossfade: 0,
        fileName: SAMPLE_FILE_NAME,
        loopEnd: null,
        loopStart: null,
        maxRange: 60,
        midiNumber: 60,
        minRange: 60,
        urls: {
          m4a: `https://static.example.test/${SAMPLE_FILE_NAME}.m4a`,
          wav: `https://static.example.test/${SAMPLE_FILE_NAME}.wav`,
        },
      },
    ],
    slug: SOURCE_SLUG,
    subTitle: 'Fixture',
    synth: 'MIDISampleSynth',
    updatedAt: '2026-09-02T00:00:00Z',
    userInterfaces: ['keyboard'],
  }

  const selectedCatalogBytes = jsonBytes(selectedCatalog)
  const generalMidiIndexBytes = jsonBytes(generalMidiIndex)
  const soundbankMapBytes = jsonBytes(soundbankMap)
  const soundbankCatalogBytes = jsonBytes(soundbankCatalog)
  const mappingBytes = jsonBytes(mapping)
  const wavBytes = createFixtureWav()
  const archiveBytes = zipSync(
    {
      [`${SOURCE_SLUG}.json`]: mappingBytes,
      [`${SAMPLE_FILE_NAME}.wav`]: wavBytes,
    },
    { level: 0, mtime: new Date('2020-01-01T00:00:00Z') },
  )
  const inputs = [
    ['catalog/selected-soundbanks.json', selectedCatalogBytes],
    ['indexes/by-general-midi-program.json', generalMidiIndexBytes],
    ['indexes/soundbank-map.json', soundbankMapBytes],
    [`${SOURCE_DIRECTORY}/${SOURCE_SLUG}.catalog.json`, soundbankCatalogBytes],
    [`${SOURCE_DIRECTORY}/${SOURCE_SLUG}.mapping.json`, mappingBytes],
    [`${SOURCE_DIRECTORY}/${archiveFileName}`, archiveBytes],
  ] as const
  await Promise.all(
    inputs.map(([relativePath, bytes]) => writeFile(join(localSoundbankRoot, relativePath), bytes)),
  )

  return Object.freeze({
    definition: Object.freeze({
      archiveLimits: Object.freeze({
        maximumArchiveByteLength: 64 * 1_024,
        maximumCompressionRatio: 64,
        maximumEntryByteLength: 16 * 1_024,
        maximumEntryCount: 4,
        maximumTotalUncompressedByteLength: 32 * 1_024,
      }),
      expectedCanonicalForProgram: true,
      expectedGeneralMidiProgram: 48,
      expectedInputFingerprints: Object.freeze(
        inputs.map(([relativePath, bytes]) =>
          Object.freeze({ relativePath, sha256: sha256(bytes) }),
        ),
      ),
      expectedSourceDisplayName: 'Fixture Strings',
      generatedDirectoryName: 'fixture-strings',
      productPitchRange: Object.freeze({ maximumPitch: 60, minimumPitch: 60 }),
      soundbankId: parseSoundbankId('fixture-strings'),
      sourceSlug: SOURCE_SLUG,
    }),
    localSoundbankRoot,
    mappingPath: join(sourceDirectory, `${SOURCE_SLUG}.mapping.json`),
    outputDirectory: join(localSoundbankRoot, 'generated/fixture-strings'),
  })
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

describe('built-in local Sample Instrument preparation', () => {
  it('creates deterministic normalized output and recognizes an identical rerun', async () => {
    const fixture = await createPreparationFixture()
    const first = await prepareBuiltInLocalSampleInstrument(fixture)

    expect(first).toMatchObject({ outputDirectory: fixture.outputDirectory, status: 'created' })
    expect(first.inventory).toEqual({
      archive: {
        compressedByteLength: expect.any(Number),
        entryCount: 2,
        totalUncompressedByteLength: expect.any(Number),
      },
      manifest: {
        byteLength: expect.any(Number),
        exclusiveGroupZoneCount: 0,
        loopZoneCount: 0,
        oneShotZoneCount: 0,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        zoneCount: 1,
      },
      resources: {
        count: 1,
        decodedFloat32ByteLength: 16,
        encodedByteLength: 52,
        maximumDecodedFloat32ByteLength: 16,
        maximumEncodedByteLength: 52,
      },
    })
    expect((await readdir(first.outputDirectory)).sort()).toEqual([
      'manifest.json',
      'preparation-report.json',
      'samples',
    ])
    expect(await readdir(join(first.outputDirectory, 'samples'))).toEqual([
      `${SAMPLE_FILE_NAME}.wav`,
    ])
    const manifestBytes = await readFile(join(first.outputDirectory, 'manifest.json'))
    const reportBytes = await readFile(join(first.outputDirectory, 'preparation-report.json'))
    const manifestText = manifestBytes.toString('utf8')
    expect(JSON.parse(manifestText)).toMatchObject({
      displayName: 'Fixture Strings',
      soundbankId: 'fixture-strings',
      zones: [
        {
          resource: { key: `samples/${SAMPLE_FILE_NAME}.wav` },
          selector: { kind: 'exact-midi', pitch: 60 },
        },
      ],
    })
    expect(manifestText).not.toContain('https://')
    expect(JSON.parse(reportBytes.toString('utf8'))).toMatchObject({
      generalMidiProgram: 48,
      inputs: expect.arrayContaining([
        expect.objectContaining({
          relativePath: `${SOURCE_DIRECTORY}/${SOURCE_SLUG}.catalog.json`,
        }),
      ]),
      productPitchRange: { maximumPitch: 60, minimumPitch: 60 },
      soundbankId: 'fixture-strings',
    })
    const firstHashes = [sha256(manifestBytes), sha256(reportBytes)]

    const second = await prepareBuiltInLocalSampleInstrument(fixture)
    expect(second.status).toBe('current')
    expect([
      sha256(await readFile(join(second.outputDirectory, 'manifest.json'))),
      sha256(await readFile(join(second.outputDirectory, 'preparation-report.json'))),
    ]).toEqual(firstHashes)
  })

  it('fails before publication when a reviewed input fingerprint changes', async () => {
    const fixture = await createPreparationFixture()
    await writeFile(fixture.mappingPath, '{}\n')

    await expect(prepareBuiltInLocalSampleInstrument(fixture)).rejects.toEqual(
      expect.objectContaining<Partial<BuiltInLocalSampleInstrumentPreparationError>>({
        code: 'input-fingerprint-mismatch',
        relativePath: `${SOURCE_DIRECTORY}/${SOURCE_SLUG}.mapping.json`,
      }),
    )
    await expect(access(fixture.outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not replace an existing generated directory when product identity changes', async () => {
    const fixture = await createPreparationFixture()
    await prepareBuiltInLocalSampleInstrument(fixture)
    const manifestPath = join(fixture.outputDirectory, 'manifest.json')
    const originalManifestHash = sha256(await readFile(manifestPath))

    await expect(
      prepareBuiltInLocalSampleInstrument({
        ...fixture,
        definition: Object.freeze({
          ...fixture.definition,
          soundbankId: parseSoundbankId('different-product-identity'),
        }),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BuiltInLocalSampleInstrumentPreparationError>>({
        code: 'output-conflict',
      }),
    )
    expect(sha256(await readFile(manifestPath))).toBe(originalManifestHash)
  })

  it('rejects an unsafe generated directory before reading or writing assets', async () => {
    const fixture = await createPreparationFixture()

    await expect(
      prepareBuiltInLocalSampleInstrument({
        ...fixture,
        definition: Object.freeze({
          ...fixture.definition,
          generatedDirectoryName: '../outside',
        }),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BuiltInLocalSampleInstrumentPreparationError>>({
        code: 'invalid-definition',
      }),
    )
    expect(relative(fixture.localSoundbankRoot, fixture.outputDirectory)).toBe(
      'generated/fixture-strings',
    )
  })

  it('rejects absolute input fingerprint paths before publication', async () => {
    const fixture = await createPreparationFixture()
    const firstFingerprint = fixture.definition.expectedInputFingerprints[0]
    if (firstFingerprint === undefined) throw new TypeError('fixture fingerprint is missing')

    await expect(
      prepareBuiltInLocalSampleInstrument({
        ...fixture,
        definition: Object.freeze({
          ...fixture.definition,
          expectedInputFingerprints: Object.freeze([
            Object.freeze({
              ...firstFingerprint,
              relativePath: join(fixture.localSoundbankRoot, firstFingerprint.relativePath),
            }),
            ...fixture.definition.expectedInputFingerprints.slice(1),
          ]),
        }),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BuiltInLocalSampleInstrumentPreparationError>>({
        code: 'unsafe-local-path',
      }),
    )
    await expect(access(fixture.outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
