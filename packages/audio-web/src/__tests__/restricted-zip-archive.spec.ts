import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  RestrictedZipArchiveError,
  extractRestrictedZipArchive,
  type RestrictedZipArchiveErrorCode,
  type RestrictedZipArchiveLimits,
  type RestrictedZipArchiveOptions,
} from '#internal/sample-instrument/restricted-zip-archive'

const DEFAULT_LIMITS: RestrictedZipArchiveLimits = Object.freeze({
  maximumArchiveByteLength: 1_000_000,
  maximumCompressionRatio: 100,
  maximumEntryByteLength: 100_000,
  maximumEntryCount: 10,
  maximumTotalUncompressedByteLength: 200_000,
})

function createArchive(entries: Readonly<Record<string, Uint8Array>>): Uint8Array {
  return zipSync(entries, { level: 6, mtime: new Date('1980-01-01T00:00:00Z') })
}

function replaceCentralDirectoryCompressionMethod(
  archive: Uint8Array,
  compressionMethod: number,
): Uint8Array {
  const result = archive.slice()
  const view = new DataView(result.buffer)
  for (let offset = 0; offset <= result.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint16(offset + 10, compressionMethod, true)
    }
  }
  return result
}

function withLimits(overrides: Partial<RestrictedZipArchiveLimits>): RestrictedZipArchiveLimits {
  return Object.freeze({ ...DEFAULT_LIMITS, ...overrides })
}

interface LimitFailureCase {
  readonly code: RestrictedZipArchiveErrorCode
  readonly createOptions: (archive: Uint8Array) => RestrictedZipArchiveOptions
  readonly entries: Readonly<Record<string, Uint8Array>>
}

const LIMIT_FAILURE_CASES: readonly LimitFailureCase[] = [
  {
    code: 'archive-too-large',
    createOptions: (archive: Uint8Array) => ({
      expectedEntryKeys: ['sample.wav'],
      limits: withLimits({ maximumArchiveByteLength: archive.byteLength - 1 }),
    }),
    entries: { 'sample.wav': Uint8Array.of(1) },
  },
  {
    code: 'entry-too-large',
    createOptions: () => ({
      expectedEntryKeys: ['sample.wav'],
      limits: withLimits({ maximumEntryByteLength: 3 }),
    }),
    entries: { 'sample.wav': Uint8Array.of(1, 2, 3, 4) },
  },
  {
    code: 'total-size-exceeded',
    createOptions: () => ({
      expectedEntryKeys: ['a.wav', 'b.wav'],
      limits: withLimits({ maximumTotalUncompressedByteLength: 3 }),
    }),
    entries: { 'a.wav': Uint8Array.of(1, 2), 'b.wav': Uint8Array.of(3, 4) },
  },
  {
    code: 'too-many-entries',
    createOptions: () => ({
      expectedEntryKeys: ['a.wav', 'b.wav'],
      limits: withLimits({ maximumEntryCount: 1 }),
    }),
    entries: { 'a.wav': Uint8Array.of(1), 'b.wav': Uint8Array.of(2) },
  },
  {
    code: 'unsafe-compression-ratio',
    createOptions: () => ({
      expectedEntryKeys: ['sample.wav'],
      limits: withLimits({ maximumCompressionRatio: 2 }),
    }),
    entries: { 'sample.wav': new Uint8Array(10_000) },
  },
]

describe('restricted ZIP archive', () => {
  it('extracts only the exact declared entry set into stable metadata', async () => {
    const archive = createArchive({
      'instrument.json': strToU8('{"schemaVersion":1}'),
      'samples/060.wav': Uint8Array.of(1, 2, 3, 4),
    })

    const result = await extractRestrictedZipArchive(archive, {
      expectedEntryKeys: ['samples/060.wav', 'instrument.json'],
      limits: DEFAULT_LIMITS,
    })

    expect(result.archiveByteLength).toBe(archive.byteLength)
    expect(result.totalUncompressedByteLength).toBe(23)
    expect(result.entries.map(({ key }) => key)).toEqual(['instrument.json', 'samples/060.wav'])
    expect(result.entries[1]?.bytes).toEqual(Uint8Array.of(1, 2, 3, 4))
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.entries)).toBe(true)
  })

  it.each(LIMIT_FAILURE_CASES)(
    'rejects $code before returning decoded bytes',
    async ({ code, createOptions, entries }) => {
      const archive = createArchive(entries)

      await expect(extractRestrictedZipArchive(archive, createOptions(archive))).rejects.toEqual(
        expect.objectContaining<Partial<RestrictedZipArchiveError>>({ code }),
      )
    },
  )

  it('rejects unsafe, unexpected, missing, and ambiguous entry names', async () => {
    const unsafe = createArchive({ '../sample.wav': Uint8Array.of(1) })
    const unexpected = createArchive({ 'other.wav': Uint8Array.of(1) })
    const missing = createArchive({ 'sample.wav': Uint8Array.of(1) })

    await expect(
      extractRestrictedZipArchive(unsafe, {
        expectedEntryKeys: ['sample.wav'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'invalid-entry-path' }))
    await expect(
      extractRestrictedZipArchive(unexpected, {
        expectedEntryKeys: ['sample.wav'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'unexpected-entry' }))
    await expect(
      extractRestrictedZipArchive(missing, {
        expectedEntryKeys: ['sample.wav', 'instrument.json'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'missing-entry' }))
    await expect(
      extractRestrictedZipArchive(missing, {
        expectedEntryKeys: ['Sample.wav', 'sample.wav'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'duplicate-entry' }))

    const caseCollision = createArchive({
      'Sample.wav': Uint8Array.of(1),
      'sample.wav': Uint8Array.of(2),
    })
    await expect(
      extractRestrictedZipArchive(caseCollision, {
        expectedEntryKeys: ['Sample.wav'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'duplicate-entry' }))
  })

  it('rejects compression methods outside stored and Deflate', async () => {
    const archive = replaceCentralDirectoryCompressionMethod(
      createArchive({ 'sample.wav': Uint8Array.of(1) }),
      12,
    )

    await expect(
      extractRestrictedZipArchive(archive, {
        expectedEntryKeys: ['sample.wav'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'unsupported-compression' }))
  })

  it('wraps malformed archives and honors an already-aborted signal', async () => {
    await expect(
      extractRestrictedZipArchive(Uint8Array.of(1, 2, 3), {
        expectedEntryKeys: ['sample.wav'],
        limits: DEFAULT_LIMITS,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'invalid-archive' }))

    const controller = new AbortController()
    controller.abort()
    await expect(
      extractRestrictedZipArchive(createArchive({ 'sample.wav': Uint8Array.of(1) }), {
        expectedEntryKeys: ['sample.wav'],
        limits: DEFAULT_LIMITS,
        signal: controller.signal,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'aborted' }))
  })
})
