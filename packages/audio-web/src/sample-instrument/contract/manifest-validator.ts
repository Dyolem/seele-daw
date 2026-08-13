import { parseSoundbankId, type SoundbankId } from '@seele-daw/playback'

import {
  SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
  SAMPLE_INSTRUMENT_MANIFEST_VERSION,
  compareSampleInstrumentZones,
  getSampleInstrumentSelectorBounds,
  type SampleInstrumentAmplitudeEnvelopeV1,
  type SampleInstrumentEnvelopeSegmentV1,
  type SampleInstrumentExclusiveGroupV1,
  type SampleInstrumentLoopV1,
  type SampleInstrumentManifestV1,
  type SampleInstrumentResourceV1,
  type SampleInstrumentSelectorV1,
  type SampleInstrumentTriggerModeV1,
  type SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import { SEELE_SUPPORTED_SFZ_PROFILE_V1 } from '#internal/sample-instrument/contract/sfz-profile-v1'
import {
  SampleResourceKeyError,
  assertSafeSampleResourceKey,
} from '#internal/sample-instrument/contract/resource-key'
import {
  StructuredDataError,
  assertExactKeys,
  readArray,
  readDataObject,
  readFiniteNumber,
  readInteger,
  readNonBlankString,
  readRequiredValue,
  readString,
} from '#internal/sample-instrument/contract/structured-data'

const MANIFEST_KEYS = Object.freeze([
  'displayName',
  'schema',
  'schemaVersion',
  'soundbankId',
  'zones',
] as const)

const ZONE_KEYS = Object.freeze([
  'amplitudeEnvelope',
  'exclusiveGroup',
  'loop',
  'resource',
  'rootMidiPitch',
  'selector',
  'startOffsetSecond',
  'triggerMode',
  'tuneCent',
  'zoneId',
] as const)

export type SampleInstrumentManifestErrorCode =
  | 'duplicate-zone-id'
  | 'invalid-manifest'
  | 'noncanonical-zone-order'
  | 'overlapping-zone-selector'
  | 'unknown-exclusive-group'
  | 'unsafe-resource-key'
  | 'unsupported-manifest-version'

/** Stable failure raised before an untrusted Manifest reaches the Sample Runtime. */
export class SampleInstrumentManifestError extends TypeError {
  readonly code: SampleInstrumentManifestErrorCode
  readonly detail: string
  readonly path: string

  constructor(code: SampleInstrumentManifestErrorCode, path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'SampleInstrumentManifestError'
    this.code = code
    this.detail = message
    this.path = path
  }
}

function fail(code: SampleInstrumentManifestErrorCode, path: string, message: string): never {
  throw new SampleInstrumentManifestError(code, path, message)
}

function readMidiPitch(input: unknown, path: string): number {
  const value = readInteger(input, path)
  if (value < 0 || value > 127) {
    throw new StructuredDataError(path, 'expected a MIDI pitch from 0 through 127')
  }
  return value
}

function readNonNegativeNumber(input: unknown, path: string): number {
  const value = readFiniteNumber(input, path)
  if (value < 0) throw new StructuredDataError(path, 'expected a non-negative number')
  return value
}

function readPositiveInteger(input: unknown, path: string): number {
  const value = readInteger(input, path)
  if (value < 1) throw new StructuredDataError(path, 'expected a positive integer')
  return value
}

function readNullableFiniteNumber(input: unknown, path: string): number | null {
  return input === null ? null : readFiniteNumber(input, path)
}

function parseSelector(input: unknown, path: string): SampleInstrumentSelectorV1 {
  const object = readDataObject(input, path)
  const kind = readString(readRequiredValue(object, 'kind', path), `${path}.kind`)
  if (kind === 'exact-midi') {
    assertExactKeys(object, ['kind', 'pitch'], [], path)
    return Object.freeze({
      kind,
      pitch: readMidiPitch(readRequiredValue(object, 'pitch', path), `${path}.pitch`),
    })
  }
  if (kind === 'midi-range') {
    assertExactKeys(object, ['kind', 'maximumPitch', 'minimumPitch'], [], path)
    const minimumPitch = readMidiPitch(
      readRequiredValue(object, 'minimumPitch', path),
      `${path}.minimumPitch`,
    )
    const maximumPitch = readMidiPitch(
      readRequiredValue(object, 'maximumPitch', path),
      `${path}.maximumPitch`,
    )
    if (minimumPitch > maximumPitch) {
      throw new StructuredDataError(path, 'minimumPitch must not exceed maximumPitch')
    }
    return Object.freeze({ kind, maximumPitch, minimumPitch })
  }
  throw new StructuredDataError(`${path}.kind`, 'unsupported selector kind')
}

function parseLoop(input: unknown, path: string): SampleInstrumentLoopV1 {
  const object = readDataObject(input, path)
  const kind = readString(readRequiredValue(object, 'kind', path), `${path}.kind`)
  if (kind === 'none') {
    assertExactKeys(object, ['kind'], [], path)
    return Object.freeze({ kind })
  }
  if (kind !== 'continuous' && kind !== 'sustain') {
    throw new StructuredDataError(`${path}.kind`, 'unsupported loop kind')
  }
  assertExactKeys(object, ['endSecond', 'kind', 'startSecond'], [], path)
  const startSecond = readNonNegativeNumber(
    readRequiredValue(object, 'startSecond', path),
    `${path}.startSecond`,
  )
  const endSecond = readNonNegativeNumber(
    readRequiredValue(object, 'endSecond', path),
    `${path}.endSecond`,
  )
  if (startSecond >= endSecond) {
    throw new StructuredDataError(path, 'loop start must be before loop end')
  }
  return Object.freeze({ endSecond, kind, startSecond })
}

function parseEnvelopeSegment(input: unknown, path: string): SampleInstrumentEnvelopeSegmentV1 {
  const object = readDataObject(input, path)
  assertExactKeys(object, ['curve', 'durationSecond'], [], path)
  return Object.freeze({
    curve: readNullableFiniteNumber(readRequiredValue(object, 'curve', path), `${path}.curve`),
    durationSecond: readNonNegativeNumber(
      readRequiredValue(object, 'durationSecond', path),
      `${path}.durationSecond`,
    ),
  })
}

function parseAmplitudeEnvelope(input: unknown, path: string): SampleInstrumentAmplitudeEnvelopeV1 {
  const object = readDataObject(input, path)
  assertExactKeys(object, ['attack', 'release'], [], path)
  const releaseInput = readRequiredValue(object, 'release', path)
  return Object.freeze({
    attack: parseEnvelopeSegment(readRequiredValue(object, 'attack', path), `${path}.attack`),
    release: releaseInput === null ? null : parseEnvelopeSegment(releaseInput, `${path}.release`),
  })
}

function parseExclusiveGroup(
  input: unknown,
  path: string,
): SampleInstrumentExclusiveGroupV1 | null {
  if (input === null) return null
  const object = readDataObject(input, path)
  assertExactKeys(object, ['groupId', 'offByGroupId', 'offMode'], [], path)
  const offMode = readString(readRequiredValue(object, 'offMode', path), `${path}.offMode`)
  if (offMode !== 'fast' && offMode !== 'normal') {
    throw new StructuredDataError(`${path}.offMode`, 'unsupported off mode')
  }
  return Object.freeze({
    groupId: readPositiveInteger(readRequiredValue(object, 'groupId', path), `${path}.groupId`),
    offByGroupId: readPositiveInteger(
      readRequiredValue(object, 'offByGroupId', path),
      `${path}.offByGroupId`,
    ),
    offMode,
  })
}

function parseResource(input: unknown, path: string): SampleInstrumentResourceV1 {
  const object = readDataObject(input, path)
  assertExactKeys(object, ['key', 'mediaType'], [], path)
  const key = readNonBlankString(readRequiredValue(object, 'key', path), `${path}.key`)
  try {
    assertSafeSampleResourceKey(key)
  } catch (error) {
    if (error instanceof SampleResourceKeyError) {
      fail('unsafe-resource-key', `${path}.key`, error.detail)
    }
    throw error
  }
  const mediaType = readString(readRequiredValue(object, 'mediaType', path), `${path}.mediaType`)
  if (mediaType !== SEELE_SUPPORTED_SFZ_PROFILE_V1.audioMediaTypes[0]) {
    throw new StructuredDataError(`${path}.mediaType`, 'unsupported audio media type')
  }
  return Object.freeze({ key, mediaType: 'audio/wav' })
}

function parseTriggerMode(input: unknown, path: string): SampleInstrumentTriggerModeV1 {
  const value = readString(input, path)
  if (value !== 'gated' && value !== 'one-shot') {
    throw new StructuredDataError(path, 'unsupported trigger mode')
  }
  return value
}

function parseZone(input: unknown, index: number): SampleInstrumentZoneV1 {
  const path = `$.zones[${index}]`
  const object = readDataObject(input, path)
  assertExactKeys(object, ZONE_KEYS, [], path)
  const triggerMode = parseTriggerMode(
    readRequiredValue(object, 'triggerMode', path),
    `${path}.triggerMode`,
  )
  const loop = parseLoop(readRequiredValue(object, 'loop', path), `${path}.loop`)
  const amplitudeEnvelope = parseAmplitudeEnvelope(
    readRequiredValue(object, 'amplitudeEnvelope', path),
    `${path}.amplitudeEnvelope`,
  )
  if (triggerMode === 'gated' && amplitudeEnvelope.release === null) {
    throw new StructuredDataError(
      `${path}.amplitudeEnvelope.release`,
      'gated zones require a release envelope',
    )
  }
  if (triggerMode === 'one-shot' && loop.kind !== 'none') {
    throw new StructuredDataError(`${path}.loop`, 'one-shot zones cannot loop in Profile V1')
  }

  const tuneCent = readFiniteNumber(readRequiredValue(object, 'tuneCent', path), `${path}.tuneCent`)
  const { minimum, maximum } = SEELE_SUPPORTED_SFZ_PROFILE_V1.tuneCentRange
  if (tuneCent < minimum || tuneCent > maximum) {
    throw new StructuredDataError(
      `${path}.tuneCent`,
      `expected a value from ${minimum} through ${maximum}`,
    )
  }

  const zoneId = readNonBlankString(readRequiredValue(object, 'zoneId', path), `${path}.zoneId`)
  if (zoneId.length > 256) {
    throw new StructuredDataError(`${path}.zoneId`, 'must not exceed 256 characters')
  }

  return Object.freeze({
    amplitudeEnvelope,
    exclusiveGroup: parseExclusiveGroup(
      readRequiredValue(object, 'exclusiveGroup', path),
      `${path}.exclusiveGroup`,
    ),
    loop,
    resource: parseResource(readRequiredValue(object, 'resource', path), `${path}.resource`),
    rootMidiPitch: readMidiPitch(
      readRequiredValue(object, 'rootMidiPitch', path),
      `${path}.rootMidiPitch`,
    ),
    selector: parseSelector(readRequiredValue(object, 'selector', path), `${path}.selector`),
    startOffsetSecond: readNonNegativeNumber(
      readRequiredValue(object, 'startOffsetSecond', path),
      `${path}.startOffsetSecond`,
    ),
    triggerMode,
    tuneCent,
    zoneId,
  })
}

function assertManifestSemantics(zones: readonly SampleInstrumentZoneV1[]): void {
  const zoneIds = new Set<string>()
  const pitches = new Map<number, string>()
  const groupIds = new Set<number>()
  let previousZone: SampleInstrumentZoneV1 | null = null

  for (const [index, zone] of zones.entries()) {
    if (zoneIds.has(zone.zoneId)) {
      fail('duplicate-zone-id', `$.zones[${index}].zoneId`, `duplicate zone ID ${zone.zoneId}`)
    }
    zoneIds.add(zone.zoneId)

    if (previousZone !== null && compareSampleInstrumentZones(previousZone, zone) > 0) {
      fail(
        'noncanonical-zone-order',
        `$.zones[${index}]`,
        'zones must use canonical selector and identity order',
      )
    }
    previousZone = zone

    const [minimumPitch, maximumPitch] = getSampleInstrumentSelectorBounds(zone.selector)
    for (let pitch = minimumPitch; pitch <= maximumPitch; pitch += 1) {
      const previousZoneId = pitches.get(pitch)
      if (previousZoneId !== undefined) {
        fail(
          'overlapping-zone-selector',
          `$.zones[${index}].selector`,
          `MIDI pitch ${pitch} is already selected by ${previousZoneId}`,
        )
      }
      pitches.set(pitch, zone.zoneId)
    }

    if (zone.exclusiveGroup !== null) groupIds.add(zone.exclusiveGroup.groupId)
  }

  for (const [index, zone] of zones.entries()) {
    const group = zone.exclusiveGroup
    if (group !== null && !groupIds.has(group.offByGroupId)) {
      fail(
        'unknown-exclusive-group',
        `$.zones[${index}].exclusiveGroup.offByGroupId`,
        `unknown exclusive group ${group.offByGroupId}`,
      )
    }
  }
}

function parseManifest(input: unknown): SampleInstrumentManifestV1 {
  const object = readDataObject(input, '$')
  assertExactKeys(object, MANIFEST_KEYS, [], '$')
  const schema = readString(readRequiredValue(object, 'schema', '$'), '$.schema')
  if (schema !== SAMPLE_INSTRUMENT_MANIFEST_SCHEMA) {
    throw new StructuredDataError('$.schema', 'unsupported manifest schema')
  }

  const schemaVersion = readInteger(
    readRequiredValue(object, 'schemaVersion', '$'),
    '$.schemaVersion',
  )
  if (schemaVersion !== SAMPLE_INSTRUMENT_MANIFEST_VERSION) {
    fail(
      'unsupported-manifest-version',
      '$.schemaVersion',
      `unsupported Manifest version ${schemaVersion}`,
    )
  }

  const soundbankIdInput = readNonBlankString(
    readRequiredValue(object, 'soundbankId', '$'),
    '$.soundbankId',
  )
  let soundbankId: SoundbankId
  try {
    soundbankId = parseSoundbankId(soundbankIdInput)
  } catch {
    throw new StructuredDataError('$.soundbankId', 'invalid Soundbank identity')
  }

  const displayName = readNonBlankString(
    readRequiredValue(object, 'displayName', '$'),
    '$.displayName',
  )
  if (displayName.length > 256) {
    throw new StructuredDataError('$.displayName', 'must not exceed 256 characters')
  }

  const zoneInputs = readArray(readRequiredValue(object, 'zones', '$'), '$.zones')
  if (zoneInputs.length === 0) throw new StructuredDataError('$.zones', 'must not be empty')
  const zones = Object.freeze(zoneInputs.map((zone, index) => parseZone(zone, index)))
  assertManifestSemantics(zones)

  return Object.freeze({
    displayName,
    schema: SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
    schemaVersion: SAMPLE_INSTRUMENT_MANIFEST_VERSION,
    soundbankId,
    zones,
  })
}

export function parseSampleInstrumentManifestV1(input: unknown): SampleInstrumentManifestV1 {
  try {
    return parseManifest(input)
  } catch (error) {
    if (error instanceof SampleInstrumentManifestError) throw error
    if (error instanceof StructuredDataError) {
      throw new SampleInstrumentManifestError('invalid-manifest', error.path, error.detail)
    }
    throw error
  }
}
