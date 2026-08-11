export type OwnValueComparator<Value> = (left: Value, right: Value) => boolean

function valuesAreIdentical(left: unknown, right: unknown): boolean {
  return Object.is(left, right)
}

/** @internal Compares an object's complete own-key set through one caller-selected value rule. */
export function ownPropertiesHaveSameValues<Value = unknown>(
  left: object,
  right: object,
  valuesHaveSameValue: OwnValueComparator<Value> = valuesAreIdentical,
): boolean {
  const leftKeys = Reflect.ownKeys(left)
  const rightKeys = Reflect.ownKeys(right)

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        valuesHaveSameValue(Reflect.get(left, key) as Value, Reflect.get(right, key) as Value),
    )
  )
}
