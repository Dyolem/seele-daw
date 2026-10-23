import type { StudioContext, StudioContextReader } from '@/workbench/actions/studio-action'

export interface StudioContextBinding<Target> {
  readonly target: Target
  isCurrent(): boolean
  onInvalidated(listener: () => void): () => void
}

/** The bound target of every context. Views bind targets; actions and the keyboard read them. */
export interface StudioContextRegistry extends StudioContextReader {
  /**
   * Makes `target` the context's target after invalidating the previous one. Releasing a replaced
   * binding does nothing, so a view's delayed cleanup cannot unbind its successor.
   */
  bind<Target>(context: StudioContext<Target>, target: Target): () => void
  current<Target>(context: StudioContext<Target>): StudioContextBinding<Target> | null
  dispose(): void
}

interface Entry {
  readonly binding: StudioContextBinding<unknown>
  readonly invalidate: () => void
}

export function createStudioContextRegistry(): StudioContextRegistry {
  const entries = new Map<StudioContext, Entry>()
  let disposed = false

  function clear(context: StudioContext): void {
    const entry = entries.get(context)
    if (entry === undefined) return
    entries.delete(context)
    entry.invalidate()
  }

  function current<Target>(context: StudioContext<Target>): StudioContextBinding<Target> | null {
    const binding = entries.get(context)?.binding
    return (binding as StudioContextBinding<Target> | undefined) ?? null
  }

  return {
    bind(context, target) {
      if (disposed) throw new Error(`Cannot bind the ${context.label} context after disposal`)
      clear(context)
      const listeners = new Set<() => void>()
      const binding: StudioContextBinding<typeof target> = Object.freeze({
        target,
        isCurrent: () => entries.get(context)?.binding === binding,
        onInvalidated(listener: () => void) {
          if (!binding.isCurrent()) {
            listener()
            return () => undefined
          }
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      })
      entries.set(context, {
        binding,
        invalidate() {
          for (const listener of listeners) listener()
          listeners.clear()
        },
      })
      return () => {
        if (binding.isCurrent()) clear(context)
      }
    },
    current,
    isActive(context) {
      const binding = current(context)
      return binding !== null && context.isActive(binding.target)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const context of entries.keys()) clear(context)
    },
  }
}
