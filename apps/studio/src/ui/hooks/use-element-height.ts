import { shallowRef, type ShallowRef } from 'vue'

/** Measures available layout space without storing the user's preferred size. */
export function useElementHeight(element: Readonly<ShallowRef<HTMLElement | null>>) {
  const height = shallowRef(0)
  let observer: ResizeObserver | null = null
  let active = false
  function measure(): void {
    if (active && element.value !== null) height.value = element.value.clientHeight
  }
  function dispose(): void {
    active = false
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', measure)
  }
  return {
    height,
    mount() {
      if (active || element.value === null) return
      active = true
      try {
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(measure)
          observer.observe(element.value)
        } else window.addEventListener('resize', measure)
        measure()
      } catch (cause) {
        dispose()
        throw cause
      }
    },
    dispose,
  }
}
