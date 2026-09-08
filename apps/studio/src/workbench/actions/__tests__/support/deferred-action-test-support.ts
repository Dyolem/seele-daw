export function createDeferredActionResult<T>() {
  let resolve!: (result: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}
