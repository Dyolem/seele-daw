import { rejectDomainValue } from './domain-value-error'
import { ownPropertiesHaveSameValues } from './value-equality'

export type JsonPrimitive = string | number | boolean | null
export type JsonArray = readonly JsonValue[]
export interface JsonObject {
  readonly [key: string]: JsonValue
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject

const JSON_VALUE_CONSTRAINT =
  'an acyclic JSON value composed of null, strings, finite numbers, booleans, dense arrays, and plain objects'

function rejectJsonValue(valueName: string): never {
  return rejectDomainValue(valueName, JSON_VALUE_CONSTRAINT)
}

function appendObjectKey(valueName: string, key: string): string {
  return `${valueName}[${JSON.stringify(key)}]`
}

function parseJsonArray(
  value: readonly unknown[],
  valueName: string,
  ancestors: Set<object>,
): JsonArray {
  if (ancestors.has(value)) {
    rejectJsonValue(valueName)
  }

  ancestors.add(value)

  try {
    const ownKeys = Reflect.ownKeys(value)

    for (const key of ownKeys) {
      if (typeof key !== 'string') {
        rejectJsonValue(valueName)
      }

      if (key === 'length') {
        continue
      }

      const index = Number(key)

      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
        rejectJsonValue(valueName)
      }
    }

    const output: JsonValue[] = []

    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))

      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        rejectJsonValue(`${valueName}[${index}]`)
      }

      output.push(parseJsonValueInternal(descriptor.value, `${valueName}[${index}]`, ancestors))
    }

    return output
  } finally {
    ancestors.delete(value)
  }
}

function parseJsonObject(value: object, valueName: string, ancestors: Set<object>): JsonObject {
  const prototype = Object.getPrototypeOf(value)

  if (prototype !== Object.prototype && prototype !== null) {
    rejectJsonValue(valueName)
  }

  if (ancestors.has(value)) {
    rejectJsonValue(valueName)
  }

  ancestors.add(value)

  try {
    const output: Record<string, JsonValue> = {}

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        rejectJsonValue(valueName)
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key)

      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        rejectJsonValue(appendObjectKey(valueName, key))
      }

      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: parseJsonValueInternal(descriptor.value, appendObjectKey(valueName, key), ancestors),
        writable: true,
      })
    }

    return output
  } finally {
    ancestors.delete(value)
  }
}

function parseJsonValueInternal(
  value: unknown,
  valueName: string,
  ancestors: Set<object>,
): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      rejectJsonValue(valueName)
    }

    return value
  }

  if (Array.isArray(value)) {
    return parseJsonArray(value, valueName, ancestors)
  }

  if (typeof value === 'object') {
    return parseJsonObject(value, valueName, ancestors)
  }

  return rejectJsonValue(valueName)
}

export function parseJsonValue(value: unknown, valueName = 'JsonValue'): JsonValue {
  return parseJsonValueInternal(value, valueName, new Set())
}

/** @internal Compares normalized, acyclic JSON values independently of object key order. */
export function jsonValuesHaveSameValues(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesHaveSameValues(value, right[index]!))
    )
  }

  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  return ownPropertiesHaveSameValues<JsonValue>(left, right, jsonValuesHaveSameValues)
}
