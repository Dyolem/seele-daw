import { computed, shallowRef, watch, type Ref } from 'vue'

export const SELECT_CONTENT_SIDE_OFFSET = 6
export const SELECT_CONTENT_COLLISION_PADDING = 8

/** Bounds the list size while leaving placement and collision handling to Reka. */
export function useSelectContentSize(
  trigger: Readonly<Ref<HTMLElement | null>>,
  open: Readonly<Ref<boolean>>,
) {
  const availableHeight = shallowRef<number | null>(null)

  watch(
    [open, trigger],
    ([isOpen, element], _previous, onCleanup) => {
      if (!isOpen || element === null) return
      const ownerWindow = element.ownerDocument.defaultView
      if (ownerWindow === null) return
      const visualViewport = ownerWindow.visualViewport
      let active = true

      function measure(): void {
        if (!active || element === null || ownerWindow === null) return
        const bounds = element.getBoundingClientRect()
        const viewportTop = visualViewport?.offsetTop ?? 0
        const viewportHeight = visualViewport?.height ?? ownerWindow.innerHeight
        const viewportBottom = viewportTop + viewportHeight
        const gap = SELECT_CONTENT_COLLISION_PADDING + SELECT_CONTENT_SIDE_OFFSET
        const above = bounds.top - viewportTop - gap
        const below = viewportBottom - bounds.bottom - gap
        availableHeight.value = Math.max(
          0,
          Math.min(viewportHeight - SELECT_CONTENT_COLLISION_PADDING * 2, Math.max(above, below)),
        )
      }

      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
      observer?.observe(element)
      ownerWindow.addEventListener('resize', measure)
      ownerWindow.addEventListener('scroll', measure, { capture: true, passive: true })
      visualViewport?.addEventListener('resize', measure)
      visualViewport?.addEventListener('scroll', measure)
      measure()

      onCleanup(() => {
        active = false
        observer?.disconnect()
        ownerWindow.removeEventListener('resize', measure)
        ownerWindow.removeEventListener('scroll', measure, true)
        visualViewport?.removeEventListener('resize', measure)
        visualViewport?.removeEventListener('scroll', measure)
      })
    },
    { flush: 'post' },
  )

  return computed(() =>
    availableHeight.value === null
      ? undefined
      : { '--ui-select-available-height': `${availableHeight.value}px` },
  )
}
