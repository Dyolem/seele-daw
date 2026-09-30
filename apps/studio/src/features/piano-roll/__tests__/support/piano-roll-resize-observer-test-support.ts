import { vi } from 'vitest'

/** Delivers callbacks even after disconnect to exercise already queued browser work. */
export function installPianoRollResizeObserver(failingSelector?: string) {
  const observers: TestResizeObserver[] = []
  class TestResizeObserver implements ResizeObserver {
    readonly targets = new Set<Element>()
    readonly disconnect = vi.fn<ResizeObserver['disconnect']>()
    readonly unobserve = vi.fn<ResizeObserver['unobserve']>()
    readonly observe = vi.fn<ResizeObserver['observe']>((target) => {
      this.targets.add(target)
      if (failingSelector !== undefined && target.matches(failingSelector)) {
        throw new Error('Viewport observation failed')
      }
    })

    constructor(private readonly callback: ResizeObserverCallback) {
      observers.push(this)
    }

    deliver(): void {
      this.callback([], this)
    }
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  return {
    forElement(element: Element): TestResizeObserver {
      const observer = observers.find((candidate) => candidate.targets.has(element))
      if (observer === undefined) throw new Error('Expected an observer for the surface')
      return observer
    },
  }
}
