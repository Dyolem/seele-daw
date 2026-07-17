declare const typeBrand: unique symbol

/** Adds compile-time nominal identity without changing the runtime representation. */
export type Brand<Value, Name extends string> = Value & {
  readonly [typeBrand]: Name
}
