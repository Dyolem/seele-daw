import type { JsonObject, JsonValue } from '@/model/json-value'
import {
  type ChannelStripDTO,
  type ClipDTO,
  type DeviceDTO,
  type MasterChannelDTO,
  type MidiLoopDTO,
  type MidiNoteDTO,
  type MidiSourceDTO,
  type ProjectFileDTO,
  type TempoEventDTO,
  type TimeSignatureEventDTO,
  type TrackDTO,
} from '@/persistence/project-file-dto'
import {
  ProjectFileValidationError,
  type ProjectFileValidationErrorCode,
  type ProjectFileValidationErrorDetails,
  type ProjectFileValidationPathSegment,
} from '@/persistence/project-file-validation-error'
import { PROJECT_FILE_V1_PROTOCOL } from '@/persistence/project-file-v1-protocol'

type ValidationPath = readonly ProjectFileValidationPathSegment[]
type DataFields = ReadonlyMap<string, unknown>

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function appendPath(
  path: ValidationPath,
  segment: ProjectFileValidationPathSegment,
): ValidationPath {
  return [...path, segment]
}

function formatPath(path: ValidationPath): string {
  return path.reduce<string>(
    (formatted, segment) =>
      typeof segment === 'number'
        ? `${formatted}[${segment}]`
        : `${formatted}[${JSON.stringify(segment)}]`,
    'ProjectFileDTO',
  )
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'

  switch (typeof value) {
    case 'number':
      if (Number.isNaN(value)) return 'number NaN'
      if (value === Number.POSITIVE_INFINITY) return 'number Infinity'
      if (value === Number.NEGATIVE_INFINITY) return 'number -Infinity'
      return 'number'
    case 'object':
      return 'object'
    default:
      return typeof value
  }
}

function rejectValidation(
  code: ProjectFileValidationErrorCode,
  path: ValidationPath,
  message: string,
  details: Omit<ProjectFileValidationErrorDetails, 'path'> = {},
): never {
  throw new ProjectFileValidationError(code, message, { ...details, path })
}

function rejectType(value: unknown, path: ValidationPath, expected: string): never {
  const actual = describeValue(value)
  return rejectValidation(
    'invalid-type',
    path,
    `Invalid ${formatPath(path)}: expected ${expected}, received ${actual}`,
    { actual, expected },
  )
}

function defineOwnDataProperty<Value>(
  target: Record<string, Value>,
  key: string,
  value: Value,
): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  })
}

function inspectDataObject(
  value: unknown,
  path: ValidationPath,
  invalidTypeCode: ProjectFileValidationErrorCode = 'invalid-type',
  invalidPropertyCode: ProjectFileValidationErrorCode = 'invalid-object-property',
): { readonly fields: DataFields; readonly object: object } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (invalidTypeCode === 'invalid-type') return rejectType(value, path, 'an object')

    return rejectValidation(
      invalidTypeCode,
      path,
      `Invalid ${formatPath(path)}: expected a JSON object`,
      { actual: describeValue(value), expected: 'a JSON object' },
    )
  }

  let prototype: object | null
  let ownKeys: readonly PropertyKey[]

  try {
    prototype = Object.getPrototypeOf(value)
    ownKeys = Reflect.ownKeys(value)
  } catch (cause) {
    return rejectValidation(
      invalidPropertyCode,
      path,
      `Cannot inspect ${formatPath(path)} as passive project file data`,
      { cause, expected: 'an inspectable data object' },
    )
  }

  if (prototype !== Object.prototype && prototype !== null) {
    return rejectValidation(
      invalidTypeCode,
      path,
      `Invalid ${formatPath(path)}: expected a plain object`,
      { actual: 'object with a non-plain prototype', expected: 'a plain object' },
    )
  }

  const fields = new Map<string, unknown>()

  for (const key of ownKeys) {
    if (typeof key !== 'string') {
      return rejectValidation(
        invalidPropertyCode,
        path,
        `Invalid ${formatPath(path)}: symbol properties are not project file data`,
        { actual: 'symbol property', expected: 'enumerable string data properties' },
      )
    }

    // Descriptors keep validation passive: an input-owned getter is rejected, never invoked.
    let descriptor: PropertyDescriptor | undefined

    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch (cause) {
      return rejectValidation(
        invalidPropertyCode,
        appendPath(path, key),
        `Cannot inspect property ${formatPath(appendPath(path, key))}`,
        { cause, expected: 'an enumerable data property' },
      )
    }

    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return rejectValidation(
        invalidPropertyCode,
        appendPath(path, key),
        `Invalid ${formatPath(appendPath(path, key))}: expected an enumerable data property`,
        { actual: 'accessor or non-enumerable property', expected: 'an enumerable data property' },
      )
    }

    fields.set(key, descriptor.value)
  }

  return { fields, object: value }
}

function validateExactFields(
  fields: DataFields,
  expectedFieldMap: Readonly<Record<string, true>>,
  path: ValidationPath,
): void {
  const expectedFields = Object.keys(expectedFieldMap)

  for (const field of expectedFields) {
    if (!fields.has(field)) {
      const fieldPath = appendPath(path, field)
      rejectValidation(
        'missing-property',
        fieldPath,
        `Missing required property ${formatPath(fieldPath)}`,
        { expected: 'a required own data property' },
      )
    }
  }

  const unexpected = [...fields.keys()]
    .filter((field) => !Object.hasOwn(expectedFieldMap, field))
    .sort(compareStrings)[0]

  if (unexpected !== undefined) {
    const fieldPath = appendPath(path, unexpected)
    rejectValidation(
      'unexpected-property',
      fieldPath,
      `Unexpected property ${formatPath(fieldPath)} in ProjectFileDTO V1`,
      { actual: unexpected, expected: 'a declared V1 property' },
    )
  }
}

function requireField(fields: DataFields, field: string, path: ValidationPath): unknown {
  if (!fields.has(field)) {
    const fieldPath = appendPath(path, field)
    return rejectValidation(
      'missing-property',
      fieldPath,
      `Missing required property ${formatPath(fieldPath)}`,
      { expected: 'a required own data property' },
    )
  }

  return fields.get(field)
}

function withDataObject<Output>(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
  decode: (fields: DataFields) => Output,
  invalidTypeCode: ProjectFileValidationErrorCode = 'invalid-type',
  invalidPropertyCode: ProjectFileValidationErrorCode = 'invalid-object-property',
): Output {
  const inspected = inspectDataObject(value, path, invalidTypeCode, invalidPropertyCode)

  if (ancestors.has(inspected.object)) {
    return rejectValidation(
      'cyclic-value',
      path,
      `Invalid ${formatPath(path)}: project file data cannot contain cyclic references`,
      { expected: 'acyclic project file data' },
    )
  }

  ancestors.add(inspected.object)

  try {
    return decode(inspected.fields)
  } finally {
    ancestors.delete(inspected.object)
  }
}

function withStrictDataObject<Output>(
  value: unknown,
  path: ValidationPath,
  expectedFieldMap: Readonly<Record<string, true>>,
  ancestors: Set<object>,
  decode: (fields: DataFields) => Output,
): Output {
  return withDataObject(value, path, ancestors, (fields) => {
    validateExactFields(fields, expectedFieldMap, path)
    return decode(fields)
  })
}

function decodeArray<Output>(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
  decodeItem: (item: unknown, itemPath: ValidationPath) => Output,
  invalidTypeCode: ProjectFileValidationErrorCode = 'invalid-type',
  invalidPropertyCode: ProjectFileValidationErrorCode = 'invalid-object-property',
): readonly Output[] {
  if (!Array.isArray(value)) {
    if (invalidTypeCode === 'invalid-type') return rejectType(value, path, 'an array')

    return rejectValidation(
      invalidTypeCode,
      path,
      `Invalid ${formatPath(path)}: expected a dense JSON array`,
      { actual: describeValue(value), expected: 'a dense JSON array' },
    )
  }

  if (ancestors.has(value)) {
    return rejectValidation(
      'cyclic-value',
      path,
      `Invalid ${formatPath(path)}: project file data cannot contain cyclic references`,
      { expected: 'acyclic project file data' },
    )
  }

  ancestors.add(value)

  try {
    let ownKeys: readonly PropertyKey[]

    try {
      ownKeys = Reflect.ownKeys(value)
    } catch (cause) {
      return rejectValidation(
        invalidPropertyCode,
        path,
        `Cannot inspect ${formatPath(path)} as passive project file data`,
        { cause, expected: 'an inspectable dense array' },
      )
    }

    for (const key of ownKeys) {
      if (typeof key !== 'string') {
        return rejectValidation(
          invalidPropertyCode,
          path,
          `Invalid ${formatPath(path)}: symbol properties are not project file data`,
          { actual: 'symbol property', expected: 'a dense array without custom properties' },
        )
      }

      if (key === 'length') continue

      const index = Number(key)

      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
        const propertyPath = appendPath(path, key)
        return rejectValidation(
          invalidPropertyCode,
          propertyPath,
          `Invalid custom array property ${formatPath(propertyPath)}`,
          { actual: key, expected: 'a canonical array index' },
        )
      }
    }

    const output: Output[] = []

    for (let index = 0; index < value.length; index += 1) {
      const itemPath = appendPath(path, index)
      let descriptor: PropertyDescriptor | undefined

      try {
        descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      } catch (cause) {
        return rejectValidation(
          invalidPropertyCode,
          itemPath,
          `Cannot inspect array item ${formatPath(itemPath)}`,
          { cause, expected: 'an enumerable data property' },
        )
      }

      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return rejectValidation(
          invalidPropertyCode,
          itemPath,
          `Invalid ${formatPath(itemPath)}: expected a dense array item`,
          { actual: 'missing or accessor item', expected: 'an enumerable data property' },
        )
      }

      output.push(decodeItem(descriptor.value, itemPath))
    }

    return Object.freeze(output)
  } finally {
    ancestors.delete(value)
  }
}

function decodeString(value: unknown, path: ValidationPath): string {
  if (typeof value !== 'string') return rejectType(value, path, 'a string')
  return value
}

function decodeNonEmptyString(value: unknown, path: ValidationPath): string {
  const decoded = decodeString(value, path)

  if (decoded.length === 0) {
    return rejectValidation(
      'invalid-value',
      path,
      `Invalid ${formatPath(path)}: expected a non-empty string`,
      { actual: 'empty string', expected: 'a non-empty string' },
    )
  }

  return decoded
}

function decodeNullableString(value: unknown, path: ValidationPath): string | null {
  return value === null ? null : decodeString(value, path)
}

function decodeBoolean(value: unknown, path: ValidationPath): boolean {
  if (typeof value !== 'boolean') return rejectType(value, path, 'a boolean')
  return value
}

function decodeFiniteNumber(value: unknown, path: ValidationPath): number {
  if (typeof value !== 'number') return rejectType(value, path, 'a finite number')

  if (!Number.isFinite(value)) {
    return rejectValidation(
      'invalid-number',
      path,
      `Invalid ${formatPath(path)}: expected a finite number`,
      { actual: describeValue(value), expected: 'a finite number' },
    )
  }

  return value
}

function decodeSafeInteger(value: unknown, path: ValidationPath): number {
  const decoded = decodeFiniteNumber(value, path)

  if (!Number.isSafeInteger(decoded)) {
    return rejectValidation(
      'invalid-integer',
      path,
      `Invalid ${formatPath(path)}: expected a safe integer`,
      { actual: 'non-safe-integer number', expected: 'a safe integer' },
    )
  }

  return decoded
}

function decodeKnownLiteral<const Literal extends string>(
  value: unknown,
  path: ValidationPath,
  allowed: Readonly<Record<Literal, true>>,
): Literal {
  const decoded = decodeString(value, path)

  if (!Object.hasOwn(allowed, decoded)) {
    return rejectValidation(
      'invalid-literal',
      path,
      `Invalid ${formatPath(path)}: unsupported discriminator ${JSON.stringify(decoded)}`,
      {
        actual: JSON.stringify(decoded),
        expected: Object.keys(allowed)
          .map((candidate) => JSON.stringify(candidate))
          .join(' or '),
      },
    )
  }

  return decoded as Literal
}

function decodeStringArray(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): readonly string[] {
  return decodeArray(value, path, ancestors, decodeString)
}

function decodeJsonValue(value: unknown, path: ValidationPath, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return rejectValidation(
        'invalid-json-value',
        path,
        `Invalid ${formatPath(path)}: JSON numbers must be finite`,
        { actual: describeValue(value), expected: 'a finite JSON number' },
      )
    }

    return value
  }

  if (Array.isArray(value)) {
    return decodeArray(
      value,
      path,
      ancestors,
      (item, itemPath) => decodeJsonValue(item, itemPath, ancestors),
      'invalid-json-value',
      'invalid-json-value',
    )
  }

  if (typeof value === 'object') return decodeJsonObject(value, path, ancestors)

  return rejectValidation(
    'invalid-json-value',
    path,
    `Invalid ${formatPath(path)}: value is not representable in JSON`,
    { actual: describeValue(value), expected: 'a JSON value' },
  )
}

function decodeJsonObject(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): JsonObject {
  return withDataObject(
    value,
    path,
    ancestors,
    (fields) => {
      const output: Record<string, JsonValue> = {}

      for (const key of [...fields.keys()].sort(compareStrings)) {
        defineOwnDataProperty(
          output,
          key,
          decodeJsonValue(fields.get(key), appendPath(path, key), ancestors),
        )
      }

      return Object.freeze(output)
    },
    'invalid-json-value',
    'invalid-json-value',
  )
}

function decodeRequiredFeatures(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): readonly string[] {
  const features = decodeArray(value, path, ancestors, decodeNonEmptyString)
  const firstIndexByFeature = new Map<string, number>()

  for (let index = 0; index < features.length; index += 1) {
    const featureId = features[index]!
    const firstIndex = firstIndexByFeature.get(featureId)

    if (firstIndex !== undefined) {
      const featurePath = appendPath(path, index)
      return rejectValidation(
        'duplicate-required-feature',
        featurePath,
        `Required feature ${JSON.stringify(featureId)} appears more than once`,
        {
          actual: `duplicate of index ${firstIndex}`,
          expected: 'a unique required feature ID',
          featureId,
        },
      )
    }

    firstIndexByFeature.set(featureId, index)
  }

  for (let index = 0; index < features.length; index += 1) {
    const featureId = features[index]!

    if (!Object.hasOwn(PROJECT_FILE_V1_PROTOCOL.supportedRequiredFeatures, featureId)) {
      const featurePath = appendPath(path, index)
      return rejectValidation(
        'unsupported-required-feature',
        featurePath,
        `Project file requires unsupported feature ${JSON.stringify(featureId)}`,
        { featureId },
      )
    }
  }

  return Object.freeze([...features].sort(compareStrings))
}

function decodeChannelStrip(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): ChannelStripDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.channelStrip,
    ancestors,
    (fields) =>
      Object.freeze({
        gain: decodeFiniteNumber(fields.get('gain'), appendPath(path, 'gain')),
        pan: decodeFiniteNumber(fields.get('pan'), appendPath(path, 'pan')),
        muted: decodeBoolean(fields.get('muted'), appendPath(path, 'muted')),
        soloed: decodeBoolean(fields.get('soloed'), appendPath(path, 'soloed')),
      }),
  )
}

function decodeMasterChannel(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): MasterChannelDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.masterChannel,
    ancestors,
    (fields) =>
      Object.freeze({
        gain: decodeFiniteNumber(fields.get('gain'), appendPath(path, 'gain')),
        muted: decodeBoolean(fields.get('muted'), appendPath(path, 'muted')),
        audioEffectIds: decodeStringArray(
          fields.get('audioEffectIds'),
          appendPath(path, 'audioEffectIds'),
          ancestors,
        ),
      }),
  )
}

function decodeTrack(value: unknown, path: ValidationPath, ancestors: Set<object>): TrackDTO {
  return withDataObject(value, path, ancestors, (fields) => {
    const kindPath = appendPath(path, 'kind')
    const kind = decodeKnownLiteral(
      requireField(fields, 'kind', path),
      kindPath,
      PROJECT_FILE_V1_PROTOCOL.trackKinds,
    )

    switch (kind) {
      case 'instrument':
        validateExactFields(fields, PROJECT_FILE_V1_PROTOCOL.fields.instrumentTrack, path)
        return Object.freeze({
          id: decodeString(fields.get('id'), appendPath(path, 'id')),
          kind,
          name: decodeString(fields.get('name'), appendPath(path, 'name')),
          color: decodeNullableString(fields.get('color'), appendPath(path, 'color')),
          channel: decodeChannelStrip(
            fields.get('channel'),
            appendPath(path, 'channel'),
            ancestors,
          ),
          audioEffectIds: decodeStringArray(
            fields.get('audioEffectIds'),
            appendPath(path, 'audioEffectIds'),
            ancestors,
          ),
          midiEffectIds: decodeStringArray(
            fields.get('midiEffectIds'),
            appendPath(path, 'midiEffectIds'),
            ancestors,
          ),
          instrumentDeviceId: decodeString(
            fields.get('instrumentDeviceId'),
            appendPath(path, 'instrumentDeviceId'),
          ),
        })
      case 'audio':
        validateExactFields(fields, PROJECT_FILE_V1_PROTOCOL.fields.audioTrack, path)
        return Object.freeze({
          id: decodeString(fields.get('id'), appendPath(path, 'id')),
          kind,
          name: decodeString(fields.get('name'), appendPath(path, 'name')),
          color: decodeNullableString(fields.get('color'), appendPath(path, 'color')),
          channel: decodeChannelStrip(
            fields.get('channel'),
            appendPath(path, 'channel'),
            ancestors,
          ),
          audioEffectIds: decodeStringArray(
            fields.get('audioEffectIds'),
            appendPath(path, 'audioEffectIds'),
            ancestors,
          ),
        })
    }
  })
}

function decodeMidiLoop(value: unknown, path: ValidationPath, ancestors: Set<object>): MidiLoopDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.midiLoop,
    ancestors,
    (fields) =>
      Object.freeze({
        sourceStartTick: decodeSafeInteger(
          fields.get('sourceStartTick'),
          appendPath(path, 'sourceStartTick'),
        ),
        sourceSpanTick: decodeSafeInteger(
          fields.get('sourceSpanTick'),
          appendPath(path, 'sourceSpanTick'),
        ),
      }),
  )
}

function decodeClip(value: unknown, path: ValidationPath, ancestors: Set<object>): ClipDTO {
  return withDataObject(value, path, ancestors, (fields) => {
    const kindPath = appendPath(path, 'kind')
    const kind = decodeKnownLiteral(
      requireField(fields, 'kind', path),
      kindPath,
      PROJECT_FILE_V1_PROTOCOL.clipKinds,
    )

    validateExactFields(fields, PROJECT_FILE_V1_PROTOCOL.fields.midiClip, path)

    const loopValue = fields.get('loop')

    return Object.freeze({
      id: decodeString(fields.get('id'), appendPath(path, 'id')),
      kind,
      trackId: decodeString(fields.get('trackId'), appendPath(path, 'trackId')),
      name: decodeString(fields.get('name'), appendPath(path, 'name')),
      color: decodeNullableString(fields.get('color'), appendPath(path, 'color')),
      muted: decodeBoolean(fields.get('muted'), appendPath(path, 'muted')),
      startTick: decodeSafeInteger(fields.get('startTick'), appendPath(path, 'startTick')),
      spanTick: decodeSafeInteger(fields.get('spanTick'), appendPath(path, 'spanTick')),
      sourceId: decodeString(fields.get('sourceId'), appendPath(path, 'sourceId')),
      sourceOffsetTick: decodeSafeInteger(
        fields.get('sourceOffsetTick'),
        appendPath(path, 'sourceOffsetTick'),
      ),
      loop:
        loopValue === null ? null : decodeMidiLoop(loopValue, appendPath(path, 'loop'), ancestors),
    })
  })
}

function decodeMidiNote(value: unknown, path: ValidationPath, ancestors: Set<object>): MidiNoteDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.midiNote,
    ancestors,
    (fields) =>
      Object.freeze({
        id: decodeString(fields.get('id'), appendPath(path, 'id')),
        startTick: decodeSafeInteger(fields.get('startTick'), appendPath(path, 'startTick')),
        durationTick: decodeSafeInteger(
          fields.get('durationTick'),
          appendPath(path, 'durationTick'),
        ),
        pitch: decodeSafeInteger(fields.get('pitch'), appendPath(path, 'pitch')),
        velocity: decodeSafeInteger(fields.get('velocity'), appendPath(path, 'velocity')),
        channel: decodeSafeInteger(fields.get('channel'), appendPath(path, 'channel')),
      }),
  )
}

function decodeEntityTable<DTO extends { readonly id: string }>(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
  entityName: string,
  decodeEntity: (entity: unknown, entityPath: ValidationPath, ancestors: Set<object>) => DTO,
): Readonly<Record<string, DTO>> {
  return withDataObject(value, path, ancestors, (fields) => {
    const output: Record<string, DTO> = {}

    for (const tableKey of [...fields.keys()].sort(compareStrings)) {
      const entityPath = appendPath(path, tableKey)
      const entity = decodeEntity(fields.get(tableKey), entityPath, ancestors)

      if (entity.id !== tableKey) {
        const idPath = appendPath(entityPath, 'id')
        return rejectValidation(
          'entity-key-id-mismatch',
          idPath,
          `${entityName} table key ${JSON.stringify(tableKey)} does not match entity ID ${JSON.stringify(entity.id)}`,
          {
            actual: entity.id,
            entityId: entity.id,
            expected: tableKey,
            tableKey,
          },
        )
      }

      // Opaque IDs such as "__proto__" must remain ordinary own data properties.
      defineOwnDataProperty(output, tableKey, entity)
    }

    return Object.freeze(output)
  })
}

function decodeMidiSource(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): MidiSourceDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.midiSource,
    ancestors,
    (fields) =>
      Object.freeze({
        id: decodeString(fields.get('id'), appendPath(path, 'id')),
        lengthTick: decodeSafeInteger(fields.get('lengthTick'), appendPath(path, 'lengthTick')),
        notes: decodeEntityTable(
          fields.get('notes'),
          appendPath(path, 'notes'),
          ancestors,
          'MIDI Note',
          decodeMidiNote,
        ),
      }),
  )
}

function decodeTempoEvent(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): TempoEventDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.tempoEvent,
    ancestors,
    (fields) =>
      Object.freeze({
        id: decodeString(fields.get('id'), appendPath(path, 'id')),
        tick: decodeSafeInteger(fields.get('tick'), appendPath(path, 'tick')),
        bpm: decodeFiniteNumber(fields.get('bpm'), appendPath(path, 'bpm')),
      }),
  )
}

function decodeTimeSignatureEvent(
  value: unknown,
  path: ValidationPath,
  ancestors: Set<object>,
): TimeSignatureEventDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.timeSignatureEvent,
    ancestors,
    (fields) =>
      Object.freeze({
        id: decodeString(fields.get('id'), appendPath(path, 'id')),
        tick: decodeSafeInteger(fields.get('tick'), appendPath(path, 'tick')),
        numerator: decodeSafeInteger(fields.get('numerator'), appendPath(path, 'numerator')),
        denominator: decodeSafeInteger(fields.get('denominator'), appendPath(path, 'denominator')),
      }),
  )
}

function decodeDevice(value: unknown, path: ValidationPath, ancestors: Set<object>): DeviceDTO {
  return withStrictDataObject(
    value,
    path,
    PROJECT_FILE_V1_PROTOCOL.fields.device,
    ancestors,
    (fields) =>
      Object.freeze({
        id: decodeString(fields.get('id'), appendPath(path, 'id')),
        typeId: decodeString(fields.get('typeId'), appendPath(path, 'typeId')),
        definitionVersion: decodeSafeInteger(
          fields.get('definitionVersion'),
          appendPath(path, 'definitionVersion'),
        ),
        enabled: decodeBoolean(fields.get('enabled'), appendPath(path, 'enabled')),
        parameters: decodeJsonObject(
          fields.get('parameters'),
          appendPath(path, 'parameters'),
          ancestors,
        ),
        opaqueState: decodeJsonValue(
          fields.get('opaqueState'),
          appendPath(path, 'opaqueState'),
          ancestors,
        ),
      }),
  )
}

function decodeFormatVersion(
  value: unknown,
  path: ValidationPath,
): typeof PROJECT_FILE_V1_PROTOCOL.formatVersion {
  const version = decodeSafeInteger(value, path)

  if (version !== PROJECT_FILE_V1_PROTOCOL.formatVersion) {
    return rejectValidation(
      'unsupported-format-version',
      path,
      `Unsupported project file format version ${version}; this client supports version ${PROJECT_FILE_V1_PROTOCOL.formatVersion}`,
      { actual: String(version), expected: String(PROJECT_FILE_V1_PROTOCOL.formatVersion) },
    )
  }

  return PROJECT_FILE_V1_PROTOCOL.formatVersion
}

/** Decodes untrusted structured data into a detached, deeply frozen current ProjectFileDTO. */
export function decodeProjectFileDTO(input: unknown): ProjectFileDTO {
  const path: ValidationPath = []
  const ancestors = new Set<object>()

  return withDataObject(input, path, ancestors, (fields) => {
    // Route on the header before applying V1 field rules to a potentially newer shape.
    const formatVersion = decodeFormatVersion(
      requireField(fields, 'formatVersion', path),
      appendPath(path, 'formatVersion'),
    )

    validateExactFields(fields, PROJECT_FILE_V1_PROTOCOL.fields.topLevel, path)

    return Object.freeze<ProjectFileDTO>({
      formatVersion,
      requiredFeatures: decodeRequiredFeatures(
        fields.get('requiredFeatures'),
        appendPath(path, 'requiredFeatures'),
        ancestors,
      ),
      projectId: decodeString(fields.get('projectId'), appendPath(path, 'projectId')),
      name: decodeString(fields.get('name'), appendPath(path, 'name')),
      trackOrder: decodeStringArray(
        fields.get('trackOrder'),
        appendPath(path, 'trackOrder'),
        ancestors,
      ),
      tracks: decodeEntityTable(
        fields.get('tracks'),
        appendPath(path, 'tracks'),
        ancestors,
        'Track',
        decodeTrack,
      ),
      clips: decodeEntityTable(
        fields.get('clips'),
        appendPath(path, 'clips'),
        ancestors,
        'Clip',
        decodeClip,
      ),
      midiSources: decodeEntityTable(
        fields.get('midiSources'),
        appendPath(path, 'midiSources'),
        ancestors,
        'MIDI Source',
        decodeMidiSource,
      ),
      tempoEvents: decodeEntityTable(
        fields.get('tempoEvents'),
        appendPath(path, 'tempoEvents'),
        ancestors,
        'Tempo Event',
        decodeTempoEvent,
      ),
      timeSignatureEvents: decodeEntityTable(
        fields.get('timeSignatureEvents'),
        appendPath(path, 'timeSignatureEvents'),
        ancestors,
        'Time Signature Event',
        decodeTimeSignatureEvent,
      ),
      devices: decodeEntityTable(
        fields.get('devices'),
        appendPath(path, 'devices'),
        ancestors,
        'Device',
        decodeDevice,
      ),
      master: decodeMasterChannel(fields.get('master'), appendPath(path, 'master'), ancestors),
    })
  })
}
