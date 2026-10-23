import { computed, shallowRef, type ShallowRef } from 'vue'
import type { TrackRenderWindow } from '@/features/piano-roll/components/track-surface/types/track-render-window'

/** Keeps one screen of overscan on each side; scrolling within a page reuses its rendering. */
export function useTrackRenderWindow({
  scrollViewport,
  getContentWidth,
  getScrollLeft,
}: {
  readonly scrollViewport: Readonly<ShallowRef<HTMLElement | null>>
  readonly getContentWidth: () => number
  readonly getScrollLeft: () => number
}) {
  const width = shallowRef(0)
  let observer: ResizeObserver | null = null
  let active = false
  const page = computed(() => Math.floor(Math.max(0, getScrollLeft()) / width.value))
  const renderWindow = computed<TrackRenderWindow | null>(() => {
    const contentWidth = getContentWidth()
    if (width.value <= 0 || contentWidth <= 0) return null
    const left = Math.min(
      Math.max(0, contentWidth - width.value),
      Math.max(0, page.value - 1) * width.value,
    )
    const right = Math.min(contentWidth, (page.value + 2) * width.value)
    return { leftCssPixel: left, widthCssPixel: right - left }
  })

  function measure(): void {
    if (active) width.value = scrollViewport.value?.clientWidth ?? 0
  }
  return {
    window: renderWindow,
    mount() {
      if (active || scrollViewport.value === null) return
      active = true
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(measure)
        observer.observe(scrollViewport.value)
      } else window.addEventListener('resize', measure)
      measure()
    },
    dispose() {
      active = false
      observer?.disconnect()
      observer = null
      window.removeEventListener('resize', measure)
      width.value = 0
    },
  }
}
