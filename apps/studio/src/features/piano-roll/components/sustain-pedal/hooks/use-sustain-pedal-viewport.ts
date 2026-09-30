import { computed, shallowRef, type ShallowRef } from 'vue'
import {
  createPianoRollValueLaneViewport,
  type PianoRollValueLaneViewport,
} from '@seele-daw/editor'
import type { Tick } from '@seele-daw/project-core'

export function useSustainPedalViewport({
  surface,
  getVisibleStartTick,
  getVisibleSpanTick,
  reportFailure,
}: {
  readonly surface: Readonly<ShallowRef<HTMLElement | null>>
  readonly getVisibleStartTick: () => Tick
  readonly getVisibleSpanTick: () => Tick
  readonly reportFailure: (cause: unknown) => void
}) {
  const viewport = shallowRef<PianoRollValueLaneViewport | null>(null)
  let resizeObserver: ResizeObserver | null = null
  let observing = false

  function refresh(): void {
    if (!observing) return
    const element = surface.value
    if (element === null || element.clientWidth <= 0 || element.clientHeight <= 0) {
      viewport.value = null
      return
    }
    try {
      const previous = viewport.value
      if (
        previous !== null &&
        previous.widthCssPixel === element.clientWidth &&
        previous.heightCssPixel === element.clientHeight &&
        previous.visibleStartTick === getVisibleStartTick() &&
        previous.visibleSpanTick === getVisibleSpanTick()
      )
        return
      viewport.value = createPianoRollValueLaneViewport({
        heightCssPixel: element.clientHeight,
        visibleSpanTick: getVisibleSpanTick(),
        visibleStartTick: getVisibleStartTick(),
        widthCssPixel: element.clientWidth,
      })
    } catch (cause) {
      viewport.value = null
      reportFailure(cause)
    }
  }

  function dispose(): void {
    observing = false
    resizeObserver?.disconnect()
    resizeObserver = null
    window.removeEventListener('resize', refresh)
    viewport.value = null
  }

  return {
    viewport: computed(() => viewport.value),
    refresh,
    mount() {
      const element = surface.value
      if (element === null || observing) return
      observing = true
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(refresh)
        resizeObserver.observe(element)
      } else {
        window.addEventListener('resize', refresh)
      }
      refresh()
    },
    dispose,
  }
}
