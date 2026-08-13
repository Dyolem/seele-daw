export class StructuredDataError extends TypeError {
  readonly detail: string
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'StructuredDataError'
    this.detail = message
    this.path = path
  }
}

export type DataObject = ReadonlyMap<string, unknown>

export function readDataObject(input: unknown, path: string): DataObject {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new StructuredDataError(path, 'expected an object')
  }

  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new StructuredDataError(path, 'expected a plain object')
  }

  const values = new Map<string, unknown>()
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') {
      throw new StructuredDataError(path, 'symbol properties are not supported')
    }

    const property = Object.getOwnPropertyDescriptor(input, key)
    if (property === undefined || !property.enumerable || !('value' in property)) {
      throw new StructuredDataError(`${path}.${key}`, 'expected an enumerable data property')
    }
    values.set(key, property.value)
  }
  return values
}

export function assertExactKeys(
  object: DataObject,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys])
  for (const key of object.keys()) {
    if (!allowedKeys.has(key)) {
      throw new StructuredDataError(`${path}.${key}`, 'unknown property')
    }
  }
  for (const key of requiredKeys) {
    if (!object.has(key)) {
      throw new StructuredDataError(`${path}.${key}`, 'missing required property')
    }
  }
}

export function readRequiredValue(object: DataObject, key: string, path: string): unknown {
  if (!object.has(key)) {
    throw new StructuredDataError(`${path}.${key}`, 'missing required property')
  }
  return object.get(key)
}

export function readOptionalValue(object: DataObject, key: string): unknown {
  return object.get(key)
}

export function readArray(input: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(input)) throw new StructuredDataError(path, 'expected an array')
  return input
}

export function readBoolean(input: unknown, path: string): boolean {
  if (typeof input !== 'boolean') throw new StructuredDataError(path, 'expected a boolean')
  return input
}

export function readFiniteNumber(input: unknown, path: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw new StructuredDataError(path, 'expected a finite number')
  }
  return input
}

export function readInteger(input: unknown, path: string): number {
  const value = readFiniteNumber(input, path)
  if (!Number.isInteger(value)) throw new StructuredDataError(path, 'expected an integer')
  return value
}

export function readString(input: unknown, path: string): string {
  if (typeof input !== 'string') throw new StructuredDataError(path, 'expected a string')
  return input
}

export function readNonBlankString(input: unknown, path: string): string {
  const value = readString(input, path)
  if (value.length === 0 || value.trim() !== value) {
    throw new StructuredDataError(path, 'expected a trimmed non-blank string')
  }
  return value
}
