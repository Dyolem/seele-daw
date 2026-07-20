import { vi } from 'vitest'

const nativeMapSet = Map.prototype.set

/** Intercepts Map.set calls selected by a test without exposing private writer capabilities. */
export function withMapSetInterceptor<Result>(
  intercept: (key: unknown, value: unknown) => void,
  operation: () => Result,
): Result {
  const setSpy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (
    this: Map<unknown, unknown>,
    key: unknown,
    value: unknown,
  ) {
    intercept(key, value)
    nativeMapSet.call(this, key, value)
    return this
  })

  try {
    return operation()
  } finally {
    setSpy.mockRestore()
  }
}

/**
 * Filters projection, index, and fixture writes out of a fault-injection test. The
 * stack check stays test-only so production code does not expose its private tables.
 */
export function withAuthoritativeMapSetInterceptor<Result>(
  intercept: (key: unknown, value: unknown) => void,
  operation: () => Result,
): Result {
  return withMapSetInterceptor((key, value) => {
    const stack = new Error().stack

    if (stack?.includes('/src/model/model-store.ts:')) intercept(key, value)
  }, operation)
}
