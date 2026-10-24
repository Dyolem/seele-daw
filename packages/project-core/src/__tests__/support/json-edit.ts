type JsonPath = readonly (string | number)[]

/** Passed as a replacement to delete the value at the path instead. */
export const REMOVE = Symbol('remove')

function containerAt(data: unknown, path: JsonPath): Record<string | number, unknown> {
  return path.reduce<unknown>(
    (node, key) => (node as Record<string | number, unknown>)[key],
    data,
  ) as Record<string | number, unknown>
}

/** Changes one value inside JSON test data in place, even into a shape no type allows. */
export function setAt(data: unknown, path: JsonPath, replacement: unknown): void {
  const container = containerAt(data, path.slice(0, -1))
  const key = path[path.length - 1]!

  if (replacement === REMOVE) delete container[key]
  else container[key] = replacement
}

/** Returns a JSON copy of the value with one value replaced, or removed with REMOVE. */
export function editedCopy(value: unknown, path: JsonPath, replacement: unknown): unknown {
  const copy: unknown = JSON.parse(JSON.stringify(value))
  setAt(copy, path, replacement)
  return copy
}
