import { computed, shallowRef, type ShallowRef } from 'vue'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { pitchCenterAtScrollTop, resolvePitchViewLayout } from './pitch-viewport-policy'
import type { PianoRollSurfaceGeometry } from '@/features/piano-roll/types/piano-roll-pitch-viewport'

/** Measures the visible surface; pitch scrolling never allocates a full-range Canvas. */
export function usePitchViewport(host: Readonly<ShallowRef<HTMLElement | null>>) {
  const preferences = usePianoRollPreferencesStore()
  const size = shallowRef<{ width: number; height: number } | null>(null)
  let observer: ResizeObserver | null = null
  let active = false
  let checkPointerMapping = () => true
  const layout = computed(() =>
    size.value === null
      ? null
      : resolvePitchViewLayout({
          height: size.value.height,
          centerPitch: preferences.pitchCenter,
          mode: preferences.pitchViewMode,
          rangeSize: preferences.pitchRangeSize,
        }),
  )
  const geometry = computed((): PianoRollSurfaceGeometry | null => {
    if (layout.value === null || size.value === null) return null
    return { ...layout.value.viewport, widthCssPixel: size.value.width }
  })

  function measure(): void {
    if (!active) return
    checkPointerMapping()
    const element = host.value
    if (element === null || element.clientWidth <= 0 || element.clientHeight <= 0) {
      size.value = null
      return
    }
    if (size.value?.width === element.clientWidth && size.value.height === element.clientHeight)
      return
    size.value = { width: element.clientWidth, height: element.clientHeight }
  }
  function scrollTo(scrollTop: number): void {
    if (!active || layout.value === null) return
    preferences.setPitchCenter(pitchCenterAtScrollTop(layout.value, scrollTop))
  }
  function handleWheel(event: WheelEvent): void {
    const current = layout.value
    if (
      current === null ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    )
      return
    let delta = event.deltaY
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE)
      delta *= current.viewport.pitchRowHeightCssPixel
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= current.viewport.heightCssPixel
    event.preventDefault()
    scrollTo(current.scrollTop + delta)
  }
  return {
    layout,
    geometry,
    scrollTo,
    handleWheel,
    mount(checkMapping = () => true) {
      if (active || host.value === null) return
      active = true
      checkPointerMapping = checkMapping
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(measure)
        observer.observe(host.value)
      } else window.addEventListener('resize', measure)
      measure()
    },
    dispose() {
      active = false
      observer?.disconnect()
      observer = null
      window.removeEventListener('resize', measure)
      size.value = null
    },
  }
}
