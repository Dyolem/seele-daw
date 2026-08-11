import { rejectDomainValue } from './domain-value-error'
import {
  parseDeviceId,
  parseDeviceTypeId,
  parseParameterId,
  type DeviceId,
  type DeviceTypeId,
  type ParameterId,
} from './ids'
import {
  jsonValuesHaveSameValues,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from './json-value'
import { ownPropertiesHaveSameValues } from './value-equality'

export const DEVICE_DEFINITION_VERSION_MIN = 1

export interface DeviceDescriptor {
  readonly id: DeviceId
  readonly typeId: DeviceTypeId
  readonly definitionVersion: number
  readonly enabled: boolean
  readonly parameters: Readonly<Record<ParameterId, JsonValue>>
  readonly opaqueState: JsonValue | null
}

export interface CreateDeviceDescriptorInput {
  readonly id: DeviceId
  readonly typeId: DeviceTypeId
  readonly definitionVersion: number
  readonly enabled: boolean
  readonly parameters: Readonly<Record<ParameterId, JsonValue>>
  readonly opaqueState: JsonValue | null
}

function parseDefinitionVersion(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < DEVICE_DEFINITION_VERSION_MIN
  ) {
    rejectDomainValue(
      'DeviceDescriptor.definitionVersion',
      `a safe integer greater than or equal to ${DEVICE_DEFINITION_VERSION_MIN}`,
    )
  }

  return value
}

function parseEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    rejectDomainValue('DeviceDescriptor.enabled', 'a boolean')
  }

  return value
}

function parseParameters(value: unknown): Readonly<Record<ParameterId, JsonValue>> {
  const parsedValue = parseJsonValue(value, 'DeviceDescriptor.parameters')

  if (parsedValue === null || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    rejectDomainValue('DeviceDescriptor.parameters', 'a plain object of ParameterId to JsonValue')
  }

  const parameters: Record<string, JsonValue> = {}

  for (const [key, parameterValue] of Object.entries(parsedValue as JsonObject)) {
    const parameterId = parseParameterId(key)

    Object.defineProperty(parameters, parameterId, {
      configurable: true,
      enumerable: true,
      value: parameterValue,
      writable: true,
    })
  }

  return parameters
}

export function createDeviceDescriptor(input: CreateDeviceDescriptorInput): DeviceDescriptor {
  return {
    id: parseDeviceId(input.id),
    typeId: parseDeviceTypeId(input.typeId),
    definitionVersion: parseDefinitionVersion(input.definitionVersion),
    enabled: parseEnabled(input.enabled),
    parameters: parseParameters(input.parameters),
    opaqueState: parseJsonValue(input.opaqueState, 'DeviceDescriptor.opaqueState'),
  }
}

/** @internal Compares normalized Device facts without relying on caller object identity. */
export function deviceDescriptorsHaveSameValues(
  left: DeviceDescriptor,
  right: DeviceDescriptor,
): boolean {
  return (
    left.id === right.id &&
    left.typeId === right.typeId &&
    left.definitionVersion === right.definitionVersion &&
    left.enabled === right.enabled &&
    ownPropertiesHaveSameValues<JsonValue>(
      left.parameters,
      right.parameters,
      jsonValuesHaveSameValues,
    ) &&
    jsonValuesHaveSameValues(left.opaqueState, right.opaqueState)
  )
}
