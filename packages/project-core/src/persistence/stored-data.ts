import { DomainValueError } from '#internal/model/domain-value-error'
import { parseJsonValue, type JsonObject, type JsonValue } from '#internal/model/json-value'
import { ModelRevisionError } from '#internal/model/model-revision'
import {
  ProjectFileError,
  type ProjectFileErrorCode,
  type ProjectFilePathSegment,
} from './project-file-error'

export type DataPath = readonly ProjectFilePathSegment[]

/** The fields an object must have, exactly; the compiler checks them against the value's type. */
export type Fields<Value> = { readonly [Field in keyof Value]-?: true }

export function rejectData(
  code: ProjectFileErrorCode,
  detail: string,
  path: DataPath,
  cause?: unknown,
): never {
  throw new ProjectFileError(code, `${detail} at ${JSON.stringify(path)}`, path, cause)
}

/** Copies untrusted input into passive, acyclic JSON data, so reading it can run no code. */
export function readJson(input: unknown): JsonValue {
  try {
    return parseJsonValue(input, 'project data')
  } catch (cause) {
    if (!(cause instanceof DomainValueError)) throw cause
    return rejectData('not-json', 'Expected plain JSON data', [], cause)
  }
}

export function readObject(value: unknown, path: DataPath): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return rejectData('invalid-structure', 'Expected an object', path)
  }

  return value as JsonObject
}

/** Reads one field before the rest of the object is checked, e.g. a format version or a kind. */
export function readField(value: unknown, field: string, path: DataPath): JsonValue | undefined {
  const object = readObject(value, path)
  return Object.hasOwn(object, field) ? object[field] : undefined
}

/**
 * Reads an object with exactly these fields. The result is typed as the record it will become:
 * the factory it is handed to validates every value.
 */
export function readFields<Value>(value: unknown, fields: Fields<Value>, path: DataPath): Value {
  const object = readObject(value, path)

  for (const field of Object.keys(fields)) {
    if (!Object.hasOwn(object, field)) {
      rejectData('invalid-structure', `Missing field ${field}`, [...path, field])
    }
  }

  for (const field of Object.keys(object)) {
    if (!Object.hasOwn(fields, field)) {
      rejectData('invalid-structure', `Unexpected field ${field}`, [...path, field])
    }
  }

  return object as unknown as Value
}

/** Reads an array whose items the receiving factory validates. */
export function readList<Item>(value: unknown, path: DataPath): readonly Item[] {
  if (!Array.isArray(value)) return rejectData('invalid-structure', 'Expected an array', path)
  return value as readonly Item[]
}

/** Runs a factory or parser, reporting a value it rejects at this path. */
export function readValue<Value>(path: DataPath, parse: () => Value): Value {
  try {
    return parse()
  } catch (cause) {
    if (!(cause instanceof DomainValueError || cause instanceof ModelRevisionError)) throw cause
    return rejectData('invalid-value', cause.message, path, cause)
  }
}
