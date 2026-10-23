/**
 * Releases owned resources in reverse acquisition order. Every disposer runs even when an earlier
 * one throws; the first failure is rethrown after the stack is empty.
 */
export class DisposalStack {
  #disposers: (() => void)[] = []
  #disposed = false

  defer(dispose: () => void): void {
    if (this.#disposed) {
      dispose()
      return
    }
    this.#disposers.push(dispose)
  }

  own<Resource extends { dispose(): void }>(resource: Resource): Resource {
    this.defer(() => resource.dispose())
    return resource
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    const disposers = this.#disposers.reverse()
    this.#disposers = []
    let failure: { readonly cause: unknown } | null = null
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (cause) {
        failure ??= { cause }
      }
    }
    if (failure !== null) throw failure.cause
  }
}
