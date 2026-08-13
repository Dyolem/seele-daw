import {
  type SampleInstrumentManifestV1,
  type SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import {
  SampleInstrumentZoneSelectionError,
  collectSampleInstrumentResourceKeysForPitches,
  findSampleInstrumentZoneForPitch,
} from '#internal/sample-instrument/loading/zone-selection'

const FLOAT32_SAMPLE_BYTE_LENGTH = 4

export interface SampleInstrumentResourceMeasurement {
  readonly channelCount: number
  readonly encodedByteLength: number
  readonly frameCount: number
  readonly key: string
  readonly sampleRateHz: number
}

export interface SampleInstrumentLoadingEstimate {
  readonly decodedFloat32ByteLength: number
  readonly encodedByteLength: number
  readonly maximumSourceDurationSecond: number
  readonly minimumSourceDurationSecond: number
  readonly resourceCount: number
  readonly resourceKeys: readonly string[]
}

export interface SampleInstrumentPitchAuditionMeasurement {
  readonly effectiveNaturalEndSecond: number | null
  readonly pitch: number
  readonly playbackRate: number
  readonly resourceKey: string
  readonly sourceDurationSecond: number
  readonly zone: SampleInstrumentZoneV1
}

export type SampleInstrumentLoadingMeasurementErrorCode =
  | 'duplicate-resource'
  | 'invalid-pitch'
  | 'invalid-resource-measurement'
  | 'missing-resource'
  | 'unsupported-pitch'

export class SampleInstrumentLoadingMeasurementError extends TypeError {
  readonly code: SampleInstrumentLoadingMeasurementErrorCode
  readonly key: string | null

  constructor(
    code: SampleInstrumentLoadingMeasurementErrorCode,
    message: string,
    key: string | null = null,
  ) {
    super(key === null ? message : `${key}: ${message}`)
    this.name = 'SampleInstrumentLoadingMeasurementError'
    this.code = code
    this.key = key
  }
}

function fail(
  code: SampleInstrumentLoadingMeasurementErrorCode,
  message: string,
  key: string | null = null,
): never {
  throw new SampleInstrumentLoadingMeasurementError(code, message, key)
}

function validateResourceMeasurement(resource: SampleInstrumentResourceMeasurement): void {
  if (
    !Number.isSafeInteger(resource.channelCount) ||
    resource.channelCount < 1 ||
    !Number.isSafeInteger(resource.encodedByteLength) ||
    resource.encodedByteLength < 0 ||
    !Number.isSafeInteger(resource.frameCount) ||
    resource.frameCount < 1 ||
    !Number.isSafeInteger(resource.sampleRateHz) ||
    resource.sampleRateHz < 1
  ) {
    fail(
      'invalid-resource-measurement',
      'resource metadata requires positive safe integers and a non-negative encoded byte length',
      resource.key,
    )
  }
  const decodedByteLength = resource.frameCount * resource.channelCount * FLOAT32_SAMPLE_BYTE_LENGTH
  if (!Number.isSafeInteger(decodedByteLength)) {
    fail(
      'invalid-resource-measurement',
      'decoded Float32 byte estimate exceeds the safe integer range',
      resource.key,
    )
  }
}

function indexResourceMeasurements(
  resources: readonly SampleInstrumentResourceMeasurement[],
): ReadonlyMap<string, SampleInstrumentResourceMeasurement> {
  const byKey = new Map<string, SampleInstrumentResourceMeasurement>()
  for (const resource of resources) {
    validateResourceMeasurement(resource)
    if (byKey.has(resource.key)) {
      fail('duplicate-resource', 'resource measurement is duplicated', resource.key)
    }
    byKey.set(resource.key, resource)
  }
  return byKey
}

export function estimateSampleInstrumentLoading(
  manifest: SampleInstrumentManifestV1,
  resources: readonly SampleInstrumentResourceMeasurement[],
  pitches: readonly number[] | null = null,
): SampleInstrumentLoadingEstimate {
  const resourcesByKey = indexResourceMeasurements(resources)
  let resourceKeys: readonly string[]
  try {
    resourceKeys =
      pitches === null
        ? Object.freeze([...new Set(manifest.zones.map(({ resource }) => resource.key))].sort())
        : collectSampleInstrumentResourceKeysForPitches(manifest, pitches)
  } catch (error) {
    if (error instanceof SampleInstrumentZoneSelectionError) {
      fail(error.code, error.message)
    }
    throw error
  }
  let encodedByteLength = 0
  let decodedFloat32ByteLength = 0
  let minimumSourceDurationSecond = Number.POSITIVE_INFINITY
  let maximumSourceDurationSecond = 0

  for (const key of resourceKeys) {
    const resource = resourcesByKey.get(key)
    if (resource === undefined) fail('missing-resource', 'resource measurement is missing', key)
    encodedByteLength += resource.encodedByteLength
    decodedFloat32ByteLength +=
      resource.frameCount * resource.channelCount * FLOAT32_SAMPLE_BYTE_LENGTH
    if (
      !Number.isSafeInteger(encodedByteLength) ||
      !Number.isSafeInteger(decodedFloat32ByteLength)
    ) {
      fail('invalid-resource-measurement', 'aggregate byte estimate exceeds the safe integer range')
    }
    const durationSecond = resource.frameCount / resource.sampleRateHz
    minimumSourceDurationSecond = Math.min(minimumSourceDurationSecond, durationSecond)
    maximumSourceDurationSecond = Math.max(maximumSourceDurationSecond, durationSecond)
  }

  if (resourceKeys.length === 0) {
    minimumSourceDurationSecond = 0
  }
  return Object.freeze({
    decodedFloat32ByteLength,
    encodedByteLength,
    maximumSourceDurationSecond,
    minimumSourceDurationSecond,
    resourceCount: resourceKeys.length,
    resourceKeys,
  })
}

export function measureSampleInstrumentPitchForAudition(
  manifest: SampleInstrumentManifestV1,
  resources: readonly SampleInstrumentResourceMeasurement[],
  pitch: number,
): SampleInstrumentPitchAuditionMeasurement {
  let zone: SampleInstrumentZoneV1 | null
  try {
    zone = findSampleInstrumentZoneForPitch(manifest, pitch)
  } catch (error) {
    if (error instanceof SampleInstrumentZoneSelectionError) fail(error.code, error.message)
    throw error
  }
  if (zone === null) fail('unsupported-pitch', `Manifest does not cover MIDI pitch ${pitch}`)
  const resource = indexResourceMeasurements(resources).get(zone.resource.key)
  if (resource === undefined) {
    fail('missing-resource', 'resource measurement is missing', zone.resource.key)
  }
  const sourceDurationSecond = resource.frameCount / resource.sampleRateHz
  const playbackRate = 2 ** ((pitch - zone.rootMidiPitch + zone.tuneCent / 100) / 12)
  const effectiveNaturalEndSecond =
    zone.loop.kind === 'none'
      ? Math.max(0, sourceDurationSecond - zone.startOffsetSecond) / playbackRate
      : null
  return Object.freeze({
    effectiveNaturalEndSecond,
    pitch,
    playbackRate,
    resourceKey: zone.resource.key,
    sourceDurationSecond,
    zone,
  })
}
