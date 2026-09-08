export interface StudioActionTargetBinding<T> {
  readonly value: T
  isCurrent(): boolean
  onInvalidated(listener: () => void): () => void
}

export interface StudioActionTargetSlot<T> {
  readonly current: StudioActionTargetBinding<T> | null
  bind(target: T): () => void
  dispose(): void
}

/** A replacement invalidates the old capability before publishing the new owner. */
export function createStudioActionTargetSlot<T>(): StudioActionTargetSlot<T> {
  let current: StudioActionTargetBinding<T> | null = null
  let invalidate: (() => void) | null = null
  let disposed = false

  function clear(): void {
    const notify = invalidate
    current = null
    invalidate = null
    notify?.()
  }

  return {
    get current() {
      return current
    },
    bind(target) {
      if (disposed) throw new Error('Cannot bind a disposed Studio Action target')
      clear()
      const listeners = new Set<() => void>()
      const binding: StudioActionTargetBinding<T> = Object.freeze({
        value: target,
        isCurrent: () => current === binding && !disposed,
        onInvalidated(listener: () => void) {
          if (current !== binding || disposed) {
            listener()
            return () => undefined
          }
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      })
      current = binding
      invalidate = () => {
        for (const listener of listeners) listener()
        listeners.clear()
      }
      return () => {
        // Delayed cleanup from a replaced view must not release the new view's capability.
        if (current === binding) clear()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      clear()
    },
  }
}
