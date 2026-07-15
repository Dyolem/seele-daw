declare const domainBrand: unique symbol

/** Compile-time nominal typing without adding data at runtime. */
export type Brand<Value, Name extends string> = Value & {
  readonly [domainBrand]: Name
}
