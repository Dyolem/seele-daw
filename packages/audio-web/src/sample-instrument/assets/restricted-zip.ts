import { unzip, type UnzipFileInfo, type Unzipped } from 'fflate'

import {
  SampleResourceKeyError,
  assertSafeSampleResourceKey,
} from '#internal/sample-instrument/contract/resource-key'

const STORED_COMPRESSION_METHOD = 0
const DEFLATE_COMPRESSION_METHOD = 8

export interface RestrictedZipArchiveLimits {
  readonly maximumArchiveByteLength: number
  readonly maximumCompressionRatio: number
  readonly maximumEntryByteLength: number
  readonly maximumEntryCount: number
  readonly maximumTotalUncompressedByteLength: number
}

export interface RestrictedZipArchiveOptions {
  readonly expectedEntryKeys: readonly string[]
  readonly limits: RestrictedZipArchiveLimits
  readonly signal?: AbortSignal
}

export interface RestrictedZipEntry {
  readonly bytes: Uint8Array
  readonly compressedByteLength: number
  readonly key: string
}

export interface RestrictedZipArchive {
  readonly archiveByteLength: number
  readonly entries: readonly RestrictedZipEntry[]
  readonly totalUncompressedByteLength: number
}

export type RestrictedZipArchiveErrorCode =
  | 'aborted'
  | 'archive-too-large'
  | 'duplicate-entry'
  | 'entry-too-large'
  | 'invalid-archive'
  | 'invalid-entry-path'
  | 'invalid-limits'
  | 'missing-entry'
  | 'too-many-entries'
  | 'total-size-exceeded'
  | 'unexpected-entry'
  | 'unsafe-compression-ratio'
  | 'unsupported-compression'

export class RestrictedZipArchiveError extends TypeError {
  readonly code: RestrictedZipArchiveErrorCode
  readonly detail: string
  readonly entryKey: string | null

  constructor(
    code: RestrictedZipArchiveErrorCode,
    message: string,
    entryKey: string | null = null,
  ) {
    super(entryKey === null ? message : `${entryKey}: ${message}`)
    this.name = 'RestrictedZipArchiveError'
    this.code = code
    this.detail = message
    this.entryKey = entryKey
  }
}

function fail(
  code: RestrictedZipArchiveErrorCode,
  message: string,
  entryKey: string | null = null,
): never {
  throw new RestrictedZipArchiveError(code, message, entryKey)
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('invalid-limits', `${name} must be a positive safe integer`)
  }
}

function validateLimits(limits: RestrictedZipArchiveLimits): void {
  assertPositiveSafeInteger(limits.maximumArchiveByteLength, 'maximumArchiveByteLength')
  assertPositiveSafeInteger(limits.maximumEntryByteLength, 'maximumEntryByteLength')
  assertPositiveSafeInteger(limits.maximumEntryCount, 'maximumEntryCount')
  assertPositiveSafeInteger(
    limits.maximumTotalUncompressedByteLength,
    'maximumTotalUncompressedByteLength',
  )
  if (!Number.isFinite(limits.maximumCompressionRatio) || limits.maximumCompressionRatio < 1) {
    fail('invalid-limits', 'maximumCompressionRatio must be finite and at least 1')
  }
}

function validateEntryKey(key: string): void {
  try {
    assertSafeSampleResourceKey(key)
  } catch (error) {
    if (error instanceof SampleResourceKeyError) {
      fail('invalid-entry-path', error.detail, key)
    }
    throw error
  }
}

function canonicalFileSystemKey(key: string): string {
  return key.normalize('NFC').toLowerCase()
}

function prepareExpectedEntries(entryKeys: readonly string[]): ReadonlySet<string> {
  if (entryKeys.length === 0) fail('missing-entry', 'at least one expected entry is required')

  const entries = new Set<string>()
  const fileSystemKeys = new Set<string>()
  for (const key of entryKeys) {
    validateEntryKey(key)
    const fileSystemKey = canonicalFileSystemKey(key)
    if (entries.has(key) || fileSystemKeys.has(fileSystemKey)) {
      fail('duplicate-entry', 'expected entries contain an ambiguous duplicate', key)
    }
    entries.add(key)
    fileSystemKeys.add(fileSystemKey)
  }
  return entries
}

function assertEntrySize(value: number, label: string, entryKey: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('invalid-archive', `${label} is not a non-negative safe integer`, entryKey)
  }
}

function invalidArchive(error: unknown): RestrictedZipArchiveError {
  if (error instanceof RestrictedZipArchiveError) return error
  const detail = error instanceof Error ? error.message : 'unknown ZIP decoder failure'
  return new RestrictedZipArchiveError('invalid-archive', detail)
}

/**
 * Expands only an exact, predeclared entry set after validating central-directory budgets.
 * The caller still owns media validation and checksums for the returned bytes.
 */
export async function extractRestrictedZipArchive(
  archiveBytes: Uint8Array,
  options: RestrictedZipArchiveOptions,
): Promise<RestrictedZipArchive> {
  validateLimits(options.limits)
  const expectedEntries = prepareExpectedEntries(options.expectedEntryKeys)
  if (archiveBytes.byteLength > options.limits.maximumArchiveByteLength) {
    fail('archive-too-large', 'archive exceeds the configured compressed byte budget')
  }
  if (options.signal?.aborted === true) {
    fail('aborted', 'ZIP extraction was aborted')
  }

  return new Promise((resolve, reject) => {
    const metadata = new Map<string, UnzipFileInfo>()
    const fileSystemKeys = new Set<string>()
    let totalUncompressedByteLength = 0
    let settled = false
    let terminate: (() => void) | null = null

    const detachAbortListener = () => options.signal?.removeEventListener('abort', handleAbort)
    const rejectOnce = (error: unknown) => {
      if (settled) return
      settled = true
      detachAbortListener()
      reject(invalidArchive(error))
    }
    const resolveOnce = (archive: RestrictedZipArchive) => {
      if (settled) return
      settled = true
      detachAbortListener()
      resolve(archive)
    }
    const handleAbort = () => {
      terminate?.()
      rejectOnce(new RestrictedZipArchiveError('aborted', 'ZIP extraction was aborted'))
    }

    const filter = (entry: UnzipFileInfo): boolean => {
      const key = entry.name
      validateEntryKey(key)
      const fileSystemKey = canonicalFileSystemKey(key)
      if (metadata.has(key) || fileSystemKeys.has(fileSystemKey)) {
        fail('duplicate-entry', 'archive contains an ambiguous duplicate', key)
      }
      if (!expectedEntries.has(key)) {
        fail('unexpected-entry', 'archive entry was not declared by the caller', key)
      }
      if (
        entry.compression !== STORED_COMPRESSION_METHOD &&
        entry.compression !== DEFLATE_COMPRESSION_METHOD
      ) {
        fail(
          'unsupported-compression',
          `unsupported ZIP compression method ${entry.compression}`,
          key,
        )
      }

      assertEntrySize(entry.size, 'compressed size', key)
      assertEntrySize(entry.originalSize, 'uncompressed size', key)
      if (entry.originalSize > options.limits.maximumEntryByteLength) {
        fail('entry-too-large', 'entry exceeds the configured uncompressed byte budget', key)
      }
      const compressionRatio = entry.originalSize === 0 ? 0 : entry.originalSize / entry.size
      if (
        !Number.isFinite(compressionRatio) ||
        compressionRatio > options.limits.maximumCompressionRatio
      ) {
        fail('unsafe-compression-ratio', 'entry exceeds the configured compression ratio', key)
      }

      totalUncompressedByteLength += entry.originalSize
      if (
        !Number.isSafeInteger(totalUncompressedByteLength) ||
        totalUncompressedByteLength > options.limits.maximumTotalUncompressedByteLength
      ) {
        fail('total-size-exceeded', 'archive exceeds the total uncompressed byte budget', key)
      }

      metadata.set(key, Object.freeze({ ...entry }))
      fileSystemKeys.add(fileSystemKey)
      if (metadata.size > options.limits.maximumEntryCount) {
        fail('too-many-entries', 'archive exceeds the configured entry count', key)
      }
      return true
    }

    const complete = (error: Error | null, unzipped: Unzipped) => {
      if (error !== null) {
        rejectOnce(error)
        return
      }
      try {
        const missingEntries = [...expectedEntries].filter((key) => !metadata.has(key))
        if (missingEntries.length > 0) {
          fail('missing-entry', 'archive is missing a declared entry', missingEntries[0] ?? null)
        }

        const unzippedKeys = Object.keys(unzipped)
        if (unzippedKeys.length !== expectedEntries.size) {
          fail('invalid-archive', 'decoder output does not match the validated entry set')
        }
        const entries = [...expectedEntries].sort().map((key): RestrictedZipEntry => {
          const bytes = unzipped[key]
          const entryMetadata = metadata.get(key)
          if (bytes === undefined || entryMetadata === undefined) {
            fail('missing-entry', 'decoder did not return a declared entry', key)
          }
          if (bytes.byteLength !== entryMetadata.originalSize) {
            fail('invalid-archive', 'decoded byte length differs from ZIP metadata', key)
          }
          return Object.freeze({
            bytes,
            compressedByteLength: entryMetadata.size,
            key,
          })
        })

        resolveOnce(
          Object.freeze({
            archiveByteLength: archiveBytes.byteLength,
            entries: Object.freeze(entries),
            totalUncompressedByteLength,
          }),
        )
      } catch (completionError) {
        rejectOnce(completionError)
      }
    }

    options.signal?.addEventListener('abort', handleAbort, { once: true })
    try {
      terminate = unzip(archiveBytes, { filter }, complete)
    } catch (error) {
      rejectOnce(error)
      return
    }
    if (options.signal?.aborted === true) handleAbort()
  })
}
