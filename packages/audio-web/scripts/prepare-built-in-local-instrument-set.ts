import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BuiltInLocalSampleInstrument } from './built-in-score-core-local-instruments'
import {
  prepareBuiltInLocalSampleInstrument,
  type BuiltInLocalSampleInstrumentPreparationInventory,
} from './prepare-built-in-local-sample-instrument'
import type { BuiltInLocalManifestPolicy } from './built-in-local-manifest-policy'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const localSoundbankRoot = resolve(repositoryRoot, 'apps/studio/public/soundbanks')

interface PreparedLocalInstrument {
  readonly family: string
  readonly inventory: BuiltInLocalSampleInstrumentPreparationInventory
  readonly manifestPolicy: BuiltInLocalManifestPolicy
  readonly plannedRoute: BuiltInLocalSampleInstrument['plannedRoute']
  readonly productDisplayName: string
  readonly productPitchRange: {
    readonly maximumPitch: number
    readonly minimumPitch: number
  } | null
  readonly soundbankId: string
  readonly source: {
    readonly canonicalForProgram: boolean
    readonly generalMidiProgram: number
    readonly slug: string
  }
}

export interface PrepareBuiltInLocalInstrumentSetInput {
  readonly instruments: readonly BuiltInLocalSampleInstrument[]
  readonly inventoryRelativePath: string
  readonly label: string
  readonly reportSchema: string
  readonly reportSchemaVersion: number
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
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

async function writeImmutableInventoryReport(
  path: string,
  bytes: Uint8Array,
  label: string,
): Promise<'created' | 'current'> {
  if (await pathExists(path)) {
    const existing = await readFile(path)
    if (existing.byteLength !== bytes.byteLength || sha256(existing) !== sha256(bytes)) {
      throw new TypeError(
        `existing ${label} inventory differs; review it before replacing the local report`,
      )
    }
    return 'current'
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: 'wx' })
  return 'created'
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function maximumMetric(
  instruments: readonly PreparedLocalInstrument[],
  select: (inventory: BuiltInLocalSampleInstrumentPreparationInventory) => number,
): { readonly byteLength: number; readonly soundbankId: string } {
  const sorted = [...instruments].sort((left, right) => {
    const difference = select(right.inventory) - select(left.inventory)
    if (difference !== 0) return difference
    if (left.soundbankId < right.soundbankId) return -1
    return left.soundbankId > right.soundbankId ? 1 : 0
  })
  const maximum = sorted[0]
  if (maximum === undefined) throw new TypeError('Built-in Instrument list is empty')
  return Object.freeze({
    byteLength: select(maximum.inventory),
    soundbankId: maximum.soundbankId,
  })
}

export async function prepareBuiltInLocalInstrumentSet(
  input: PrepareBuiltInLocalInstrumentSetInput,
): Promise<void> {
  const instruments: PreparedLocalInstrument[] = []

  // Keep transient ZIP/WAV memory bounded by preparing one reviewed Soundbank at a time.
  for (const instrument of input.instruments) {
    const result = await prepareBuiltInLocalSampleInstrument({
      definition: instrument.preparation,
      localSoundbankRoot,
    })
    console.log(`${instrument.preparation.soundbankId}: ${result.status}`)
    instruments.push(
      Object.freeze({
        family: instrument.family,
        inventory: result.inventory,
        manifestPolicy: instrument.preparation.manifestPolicy,
        plannedRoute: instrument.plannedRoute,
        productDisplayName: instrument.productDisplayName,
        productPitchRange: instrument.preparation.productPitchRange,
        soundbankId: instrument.preparation.soundbankId,
        source: Object.freeze({
          canonicalForProgram: instrument.preparation.expectedCanonicalForProgram,
          generalMidiProgram: instrument.preparation.expectedGeneralMidiProgram,
          slug: instrument.preparation.sourceSlug,
        }),
      }),
    )
  }

  const report = {
    schema: input.reportSchema,
    schemaVersion: input.reportSchemaVersion,
    instrumentCount: instruments.length,
    aggregate: {
      archiveCompressedByteLength: sum(
        instruments.map(({ inventory }) => inventory.archive.compressedByteLength),
      ),
      archiveEntryCount: sum(instruments.map(({ inventory }) => inventory.archive.entryCount)),
      archiveUncompressedByteLength: sum(
        instruments.map(({ inventory }) => inventory.archive.totalUncompressedByteLength),
      ),
      decodedFloat32ByteLength: sum(
        instruments.map(({ inventory }) => inventory.resources.decodedFloat32ByteLength),
      ),
      encodedResourceByteLength: sum(
        instruments.map(({ inventory }) => inventory.resources.encodedByteLength),
      ),
      manifestByteLength: sum(instruments.map(({ inventory }) => inventory.manifest.byteLength)),
      resourceCount: sum(instruments.map(({ inventory }) => inventory.resources.count)),
      zoneCount: sum(instruments.map(({ inventory }) => inventory.manifest.zoneCount)),
    },
    maxima: {
      archiveCompressed: maximumMetric(instruments, ({ archive }) => archive.compressedByteLength),
      decodedInstrument: maximumMetric(
        instruments,
        ({ resources }) => resources.decodedFloat32ByteLength,
      ),
      decodedResource: maximumMetric(
        instruments,
        ({ resources }) => resources.maximumDecodedFloat32ByteLength,
      ),
      encodedResource: maximumMetric(
        instruments,
        ({ resources }) => resources.maximumEncodedByteLength,
      ),
      manifest: maximumMetric(instruments, ({ manifest }) => manifest.byteLength),
    },
    instruments,
  }
  const inventoryReportPath = resolve(localSoundbankRoot, input.inventoryRelativePath)
  const reportBytes = jsonBytes(report)
  const reportStatus = await writeImmutableInventoryReport(
    inventoryReportPath,
    reportBytes,
    input.label,
  )
  console.log(
    `${input.label} inventory: ${reportStatus} (${relative(repositoryRoot, inventoryReportPath)}, ${sha256(reportBytes)})`,
  )
}
