import type { SoundbankId } from '@seele-daw/playback'

import {
  SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
  SAMPLE_INSTRUMENT_MANIFEST_VERSION,
  compareSampleInstrumentZones,
  type SampleInstrumentAmplitudeEnvelopeV1,
  type SampleInstrumentExclusiveGroupV1,
  type SampleInstrumentLoopV1,
  type SampleInstrumentManifestV1,
  type SampleInstrumentSelectorV1,
  type SampleInstrumentTriggerModeV1,
  type SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import {
  SampleInstrumentManifestError,
  parseSampleInstrumentManifestV1,
} from '#internal/sample-instrument/contract/manifest-validator'
import {
  StructuredDataError,
  assertExactKeys,
  readArray,
  readBoolean,
  readDataObject,
  readFiniteNumber,
  readInteger,
  readNonBlankString,
  readOptionalValue,
  readRequiredValue,
  readString,
  type DataObject,
} from '#internal/sample-instrument/contract/structured-data'

const MAPPING_REQUIRED_KEYS = Object.freeze([
  'category',
  'color',
  'defaultOctave',
  'defaultPreset',
  'filters',
  'instrumentSlug',
  'isDeprecated',
  'name',
  'release',
  'samples',
  'slug',
  'subTitle',
  'synth',
  'updatedAt',
  'userInterfaces',
] as const)

const MAPPING_OPTIONAL_KEYS = Object.freeze(['mutexSets', 'sfz'] as const)

const ZONE_REQUIRED_KEYS = Object.freeze([
  'crossfade',
  'fileName',
  'loopEnd',
  'loopStart',
  'maxRange',
  'midiNumber',
  'minRange',
  'urls',
] as const)

const ZONE_OPTIONAL_KEYS = Object.freeze([
  'attackCurve',
  'attackTime',
  'oneshot',
  'offset',
  'releaseCurve',
  'releaseTime',
  'tune',
] as const)

interface ParsedBuiltInZone {
  readonly amplitudeEnvelope: SampleInstrumentAmplitudeEnvelopeV1
  readonly fileName: string
  readonly loop: SampleInstrumentLoopV1
  readonly rootMidiPitch: number
  readonly selector: SampleInstrumentSelectorV1
  readonly startOffsetFrame: number
  readonly triggerMode: SampleInstrumentTriggerModeV1
  readonly tuneCent: number
  readonly wavUrl: string
}

interface ParsedBuiltInMapping {
  readonly displayName: string
  readonly mutexSets: readonly (readonly number[])[]
  readonly sourceSlug: string
  readonly zones: readonly ParsedBuiltInZone[]
}

export interface BuiltInMidiSampleSynthMappingInventory {
  readonly displayName: string
  readonly sampleFileNames: readonly string[]
  readonly sourceSlug: string
}

export interface BuiltInWavResourceRequest {
  readonly fileName: string
  readonly wavUrl: string
}

export interface BuiltInWavResourceResolution {
  readonly key: string
  readonly sourceSampleRateHz?: number
}

export interface BuiltInMidiSampleSynthAdapterOptions {
  readonly resolveWavResource: (request: BuiltInWavResourceRequest) => BuiltInWavResourceResolution
  readonly soundbankId: SoundbankId
}

export type BuiltInMidiSampleSynthAdapterErrorCode =
  | 'ambiguous-mutex-set'
  | 'invalid-built-in-mapping'
  | 'manifest-contract-violation'
  | 'missing-source-sample-rate'
  | 'resource-resolution-failed'
  | 'unsupported-built-in-control'

/** Stable failure raised while compiling the audited built-in Mapping into a Seele Manifest. */
export class BuiltInMidiSampleSynthAdapterError extends TypeError {
  readonly code: BuiltInMidiSampleSynthAdapterErrorCode
  readonly path: string

  constructor(code: BuiltInMidiSampleSynthAdapterErrorCode, path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'BuiltInMidiSampleSynthAdapterError'
    this.code = code
    this.path = path
  }
}

function fail(code: BuiltInMidiSampleSynthAdapterErrorCode, path: string, message: string): never {
  throw new BuiltInMidiSampleSynthAdapterError(code, path, message)
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

function readNullableNonNegativeNumber(input: unknown, path: string): number | null {
  return input === null ? null : readNonNegativeNumber(input, path)
}

function readNullableMidiPitch(input: unknown, path: string): number | null {
  return input === null ? null : readMidiPitch(input, path)
}

function readStringArray(input: unknown, path: string): readonly string[] {
  return Object.freeze(
    readArray(input, path).map((value, index) => readString(value, `${path}[${index}]`)),
  )
}

function validateKnownMappingMetadata(object: DataObject): void {
  readString(readRequiredValue(object, 'color', '$'), '$.color')
  readInteger(readRequiredValue(object, 'defaultOctave', '$'), '$.defaultOctave')
  readString(readRequiredValue(object, 'defaultPreset', '$'), '$.defaultPreset')
  readStringArray(readRequiredValue(object, 'filters', '$'), '$.filters')
  readString(readRequiredValue(object, 'instrumentSlug', '$'), '$.instrumentSlug')
  readBoolean(readRequiredValue(object, 'isDeprecated', '$'), '$.isDeprecated')
  readString(readRequiredValue(object, 'subTitle', '$'), '$.subTitle')
  readString(readRequiredValue(object, 'updatedAt', '$'), '$.updatedAt')
  readStringArray(readRequiredValue(object, 'userInterfaces', '$'), '$.userInterfaces')
  if (object.has('sfz')) readString(readOptionalValue(object, 'sfz'), '$.sfz')
}

function readMutexSets(input: unknown, path: string): readonly (readonly number[])[] {
  if (input === undefined || input === null) return Object.freeze([])
  return Object.freeze(
    readArray(input, path).map((groupInput, groupIndex) => {
      const groupPath = `${path}[${groupIndex}]`
      const pitches = readArray(groupInput, groupPath).map((pitch, pitchIndex) =>
        readMidiPitch(pitch, `${groupPath}[${pitchIndex}]`),
      )
      if (pitches.length < 2 || new Set(pitches).size !== pitches.length) {
        fail(
          'ambiguous-mutex-set',
          groupPath,
          'mutex sets require at least two unique MIDI pitches',
        )
      }
      return Object.freeze(pitches)
    }),
  )
}

function readOptionalPairedNumbers(
  object: DataObject,
  durationKey: string,
  curveKey: string,
  path: string,
): { readonly curve: number; readonly durationSecond: number } | null {
  const hasDuration = object.has(durationKey)
  const hasCurve = object.has(curveKey)
  if (hasDuration !== hasCurve) {
    throw new StructuredDataError(
      path,
      `${durationKey} and ${curveKey} must either both be present or both be absent`,
    )
  }
  if (!hasDuration) return null
  return Object.freeze({
    curve: readFiniteNumber(readOptionalValue(object, curveKey), `${path}.${curveKey}`),
    durationSecond: readNonNegativeNumber(
      readOptionalValue(object, durationKey),
      `${path}.${durationKey}`,
    ),
  })
}

function readSelector(
  object: DataObject,
  path: string,
  rootMidiPitch: number,
): SampleInstrumentSelectorV1 {
  const minimumPitch = readNullableMidiPitch(
    readRequiredValue(object, 'minRange', path),
    `${path}.minRange`,
  )
  const maximumPitch = readNullableMidiPitch(
    readRequiredValue(object, 'maxRange', path),
    `${path}.maxRange`,
  )
  if (minimumPitch === null || maximumPitch === null) {
    if (minimumPitch !== null || maximumPitch !== null) {
      throw new StructuredDataError(path, 'minRange and maxRange must have the same nullability')
    }
    return Object.freeze({ kind: 'exact-midi', pitch: rootMidiPitch })
  }
  if (minimumPitch > maximumPitch) {
    throw new StructuredDataError(path, 'minRange must not exceed maxRange')
  }
  if (minimumPitch === maximumPitch) {
    return Object.freeze({ kind: 'exact-midi', pitch: minimumPitch })
  }
  return Object.freeze({ kind: 'midi-range', maximumPitch, minimumPitch })
}

function inferBuiltInLoop(object: DataObject, path: string): SampleInstrumentLoopV1 {
  const startSecond = readNullableNonNegativeNumber(
    readRequiredValue(object, 'loopStart', path),
    `${path}.loopStart`,
  )
  const endSecond = readNullableNonNegativeNumber(
    readRequiredValue(object, 'loopEnd', path),
    `${path}.loopEnd`,
  )
  if (startSecond === null || endSecond === null) {
    if (startSecond !== null || endSecond !== null) {
      throw new StructuredDataError(path, 'loopStart and loopEnd must have the same nullability')
    }
    return Object.freeze({ kind: 'none' })
  }
  if (startSecond === 0 && endSecond === 0) return Object.freeze({ kind: 'none' })
  if (startSecond >= endSecond) {
    throw new StructuredDataError(path, 'loopStart must be before loopEnd')
  }

  // The source JSON drops SFZ loop_mode. The audited WAV tails support this source-specific
  // compatibility inference; it is deliberately isolated instead of becoming a Profile default.
  return Object.freeze({ endSecond, kind: 'continuous', startSecond })
}

function readUrl(input: unknown, path: string, expectedFileName: string): string {
  const value = readString(input, path)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StructuredDataError(path, 'expected an absolute URL')
  }
  if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '') {
    throw new StructuredDataError(path, 'expected a plain HTTPS asset URL')
  }
  const encodedBasename = url.pathname.split('/').at(-1)
  let basename: string
  try {
    basename = decodeURIComponent(encodedBasename ?? '')
  } catch {
    throw new StructuredDataError(path, 'asset URL has invalid percent encoding')
  }
  if (basename !== expectedFileName) {
    throw new StructuredDataError(path, `expected URL basename ${expectedFileName}`)
  }
  return value
}

function readUrls(object: DataObject, path: string, fileName: string): string {
  const urls = readDataObject(readRequiredValue(object, 'urls', path), `${path}.urls`)
  assertExactKeys(urls, ['m4a', 'wav'], [], `${path}.urls`)
  readUrl(readRequiredValue(urls, 'm4a', `${path}.urls`), `${path}.urls.m4a`, `${fileName}.m4a`)
  return readUrl(
    readRequiredValue(urls, 'wav', `${path}.urls`),
    `${path}.urls.wav`,
    `${fileName}.wav`,
  )
}

function readBuiltInZone(
  input: unknown,
  index: number,
  category: 'instrument' | 'kit',
  bankReleaseSecond: number | null,
): ParsedBuiltInZone {
  const path = `$.samples[${index}]`
  const object = readDataObject(input, path)
  assertExactKeys(object, ZONE_REQUIRED_KEYS, ZONE_OPTIONAL_KEYS, path)
  const crossfade = readNonNegativeNumber(
    readRequiredValue(object, 'crossfade', path),
    `${path}.crossfade`,
  )
  if (crossfade !== 0) {
    fail(
      'unsupported-built-in-control',
      `${path}.crossfade`,
      'non-zero crossfade has no audited compatibility meaning',
    )
  }

  const rootMidiPitch = readMidiPitch(
    readRequiredValue(object, 'midiNumber', path),
    `${path}.midiNumber`,
  )
  const attack = readOptionalPairedNumbers(object, 'attackTime', 'attackCurve', path)
  const zoneRelease = readOptionalPairedNumbers(object, 'releaseTime', 'releaseCurve', path)
  const resolvedRelease =
    zoneRelease ??
    (bankReleaseSecond === null
      ? null
      : Object.freeze({ curve: null, durationSecond: bankReleaseSecond }))
  const oneShot = object.has('oneshot')
    ? readBoolean(readOptionalValue(object, 'oneshot'), `${path}.oneshot`)
    : false

  // category=kit is an observed built-in Mapping default, not a Seele Profile or SFZ rule.
  const triggerMode: SampleInstrumentTriggerModeV1 =
    oneShot || category === 'kit' ? 'one-shot' : 'gated'
  if (triggerMode === 'gated' && resolvedRelease === null) {
    fail(
      'unsupported-built-in-control',
      path,
      'gated zones require either releaseTime or a bank release value',
    )
  }

  const startOffsetFrame = object.has('offset')
    ? readInteger(readOptionalValue(object, 'offset'), `${path}.offset`)
    : 0
  if (startOffsetFrame < 0) {
    throw new StructuredDataError(`${path}.offset`, 'expected a non-negative source frame')
  }

  const fileName = readNonBlankString(
    readRequiredValue(object, 'fileName', path),
    `${path}.fileName`,
  )
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: attack ?? Object.freeze({ curve: null, durationSecond: 0 }),
      release: resolvedRelease,
    }),
    fileName,
    loop: inferBuiltInLoop(object, path),
    rootMidiPitch,
    selector: readSelector(object, path, rootMidiPitch),
    startOffsetFrame,
    triggerMode,
    tuneCent: object.has('tune')
      ? readFiniteNumber(readOptionalValue(object, 'tune'), `${path}.tune`)
      : 0,
    wavUrl: readUrls(object, path, fileName),
  })
}

function readBuiltInMapping(input: unknown): ParsedBuiltInMapping {
  const object = readDataObject(input, '$')
  assertExactKeys(object, MAPPING_REQUIRED_KEYS, MAPPING_OPTIONAL_KEYS, '$')
  const synth = readString(readRequiredValue(object, 'synth', '$'), '$.synth')
  if (synth !== 'MIDISampleSynth') {
    fail('invalid-built-in-mapping', '$.synth', 'expected MIDISampleSynth')
  }
  const categoryInput = readString(readRequiredValue(object, 'category', '$'), '$.category')
  if (categoryInput !== 'instrument' && categoryInput !== 'kit') {
    fail('invalid-built-in-mapping', '$.category', 'expected instrument or kit')
  }
  const releaseInput = readRequiredValue(object, 'release', '$')
  const bankReleaseSecond =
    releaseInput === null ? null : readNonNegativeNumber(releaseInput, '$.release')
  validateKnownMappingMetadata(object)
  const samples = readArray(readRequiredValue(object, 'samples', '$'), '$.samples')
  if (samples.length === 0) throw new StructuredDataError('$.samples', 'must not be empty')
  const zones = samples.map((zone, index) =>
    readBuiltInZone(zone, index, categoryInput, bankReleaseSecond),
  )
  return Object.freeze({
    displayName: readNonBlankString(readRequiredValue(object, 'name', '$'), '$.name'),
    mutexSets: readMutexSets(readOptionalValue(object, 'mutexSets'), '$.mutexSets'),
    sourceSlug: readNonBlankString(readRequiredValue(object, 'slug', '$'), '$.slug'),
    zones: Object.freeze(zones),
  })
}

export function inspectBuiltInMidiSampleSynthMapping(
  input: unknown,
): BuiltInMidiSampleSynthMappingInventory {
  try {
    const mapping = readBuiltInMapping(input)
    return Object.freeze({
      displayName: mapping.displayName,
      sampleFileNames: Object.freeze(
        [...new Set(mapping.zones.map(({ fileName }) => fileName))].sort(),
      ),
      sourceSlug: mapping.sourceSlug,
    })
  } catch (error) {
    if (error instanceof BuiltInMidiSampleSynthAdapterError) throw error
    if (error instanceof StructuredDataError) {
      throw new BuiltInMidiSampleSynthAdapterError(
        'invalid-built-in-mapping',
        error.path,
        error.detail,
      )
    }
    throw error
  }
}

function resolveResource(
  zone: ParsedBuiltInZone,
  index: number,
  resolver: BuiltInMidiSampleSynthAdapterOptions['resolveWavResource'],
): { readonly key: string; readonly startOffsetSecond: number } {
  const path = `$.samples[${index}]`
  let resolutionInput: unknown
  try {
    resolutionInput = resolver(Object.freeze({ fileName: zone.fileName, wavUrl: zone.wavUrl }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown resource resolver failure'
    fail('resource-resolution-failed', `${path}.fileName`, detail)
  }
  const resolution = readDataObject(resolutionInput, `${path}.resource`)
  assertExactKeys(resolution, ['key'], ['sourceSampleRateHz'], `${path}.resource`)
  const key = readNonBlankString(
    readRequiredValue(resolution, 'key', `${path}.resource`),
    `${path}.resource.key`,
  )
  const sourceSampleRateHz = resolution.has('sourceSampleRateHz')
    ? readFiniteNumber(
        readOptionalValue(resolution, 'sourceSampleRateHz'),
        `${path}.resource.sourceSampleRateHz`,
      )
    : null
  if (sourceSampleRateHz !== null && sourceSampleRateHz <= 0) {
    throw new StructuredDataError(
      `${path}.resource.sourceSampleRateHz`,
      'expected a positive sample rate',
    )
  }
  if (zone.startOffsetFrame === 0) return Object.freeze({ key, startOffsetSecond: 0 })
  if (sourceSampleRateHz === null) {
    fail(
      'missing-source-sample-rate',
      `${path}.resource.sourceSampleRateHz`,
      'offset frames require the encoded source sample rate',
    )
  }
  return Object.freeze({
    key,
    startOffsetSecond: zone.startOffsetFrame / sourceSampleRateHz,
  })
}

function selectorMatchesPitch(selector: SampleInstrumentSelectorV1, pitch: number): boolean {
  return selector.kind === 'exact-midi'
    ? selector.pitch === pitch
    : selector.minimumPitch <= pitch && pitch <= selector.maximumPitch
}

function applyMutexSets(
  zones: readonly SampleInstrumentZoneV1[],
  mutexSets: readonly (readonly number[])[],
): readonly SampleInstrumentZoneV1[] {
  const exclusiveGroups = new Map<string, SampleInstrumentExclusiveGroupV1>()
  for (const [groupIndex, pitches] of mutexSets.entries()) {
    const groupId = groupIndex + 1
    for (const [pitchIndex, pitch] of pitches.entries()) {
      const path = `$.mutexSets[${groupIndex}][${pitchIndex}]`
      const matchingZones = zones.filter((zone) => selectorMatchesPitch(zone.selector, pitch))
      if (
        matchingZones.length !== 1 ||
        matchingZones[0]?.selector.kind !== 'exact-midi' ||
        matchingZones[0].selector.pitch !== pitch
      ) {
        fail(
          'ambiguous-mutex-set',
          path,
          'mutex pitches must each select exactly one exact-key zone',
        )
      }
      const zone = matchingZones[0]
      if (zone === undefined || exclusiveGroups.has(zone.zoneId)) {
        fail('ambiguous-mutex-set', path, 'a zone cannot belong to multiple mutex sets')
      }

      // Built-in mutexSets are symmetric. SFZ off_by=group with the default fast mode expresses
      // the same audited intent without changing the general Manifest contract.
      exclusiveGroups.set(
        zone.zoneId,
        Object.freeze({ groupId, offByGroupId: groupId, offMode: 'fast' }),
      )
    }
  }

  return Object.freeze(
    zones.map((zone) =>
      Object.freeze({
        ...zone,
        exclusiveGroup: exclusiveGroups.get(zone.zoneId) ?? null,
      }),
    ),
  )
}

function createBuiltInZoneId(
  zone: ParsedBuiltInZone,
  repeatedFileNames: ReadonlySet<string>,
): string {
  const prefix = `built-in:${zone.fileName}`
  if (!repeatedFileNames.has(zone.fileName)) return prefix
  return zone.selector.kind === 'exact-midi'
    ? `${prefix}:key:${zone.selector.pitch}`
    : `${prefix}:range:${zone.selector.minimumPitch}-${zone.selector.maximumPitch}`
}

function compileBuiltInMapping(
  input: unknown,
  options: BuiltInMidiSampleSynthAdapterOptions,
): SampleInstrumentManifestV1 {
  const mapping = readBuiltInMapping(input)
  const seenFileNames = new Set<string>()
  const repeatedFileNames = new Set<string>()
  for (const { fileName } of mapping.zones) {
    if (seenFileNames.has(fileName)) repeatedFileNames.add(fileName)
    seenFileNames.add(fileName)
  }
  const zones = mapping.zones
    .map((zone, index): SampleInstrumentZoneV1 => {
      const resource = resolveResource(zone, index, options.resolveWavResource)
      return {
        amplitudeEnvelope: zone.amplitudeEnvelope,
        exclusiveGroup: null,
        loop: zone.loop,
        resource: { key: resource.key, mediaType: 'audio/wav' },
        rootMidiPitch: zone.rootMidiPitch,
        selector: zone.selector,
        startOffsetSecond: resource.startOffsetSecond,
        triggerMode: zone.triggerMode,
        tuneCent: zone.tuneCent,
        zoneId: createBuiltInZoneId(zone, repeatedFileNames),
      }
    })
    .sort(compareSampleInstrumentZones)

  return parseSampleInstrumentManifestV1({
    displayName: mapping.displayName,
    schema: SAMPLE_INSTRUMENT_MANIFEST_SCHEMA,
    schemaVersion: SAMPLE_INSTRUMENT_MANIFEST_VERSION,
    soundbankId: options.soundbankId,
    zones: applyMutexSets(zones, mapping.mutexSets),
  })
}

export function adaptBuiltInMidiSampleSynthMapping(
  input: unknown,
  options: BuiltInMidiSampleSynthAdapterOptions,
): SampleInstrumentManifestV1 {
  try {
    return compileBuiltInMapping(input, options)
  } catch (error) {
    if (error instanceof BuiltInMidiSampleSynthAdapterError) throw error
    if (error instanceof SampleInstrumentManifestError) {
      throw new BuiltInMidiSampleSynthAdapterError(
        'manifest-contract-violation',
        error.path,
        error.detail,
      )
    }
    if (error instanceof StructuredDataError) {
      throw new BuiltInMidiSampleSynthAdapterError(
        'invalid-built-in-mapping',
        error.path,
        error.detail,
      )
    }
    throw error
  }
}
