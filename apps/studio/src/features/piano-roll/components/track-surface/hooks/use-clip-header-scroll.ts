import { nextTick, watch, type ShallowRef } from 'vue'
import type { ClipId } from '@seele-daw/project-core'
import type { TrackClipRegion } from '@/features/piano-roll/components/track-surface/types/track-clip-region'
import { CLIP_HEADER_ROW_HEIGHT } from '@/features/piano-roll/components/track-surface/presentation/clip-regions'

/** Mirrors timeline position while keeping overlapping Header rows independently reachable. */
export function useClipHeaderScroll({
  viewport,
  getScrollLeft,
  getActiveClipId,
  getRegions,
  scrollTimeline,
}: {
  readonly viewport: Readonly<ShallowRef<HTMLElement | null>>
  readonly getScrollLeft: () => number
  readonly getActiveClipId: () => ClipId | null
  readonly getRegions: () => readonly TrackClipRegion[]
  readonly scrollTimeline: (left: number) => void
}) {
  watch(
    [viewport, () => getScrollLeft()],
    ([element, left]) => {
      if (element !== null) element.scrollLeft = left
    },
    { flush: 'post' },
  )
  watch(
    [viewport, () => getActiveClipId(), () => getRegions()],
    ([element]) => {
      const region = getRegions().find(({ clip }) => clip.clipId === getActiveClipId())
      if (element === null || region === undefined) return
      const top = region.headerRow * CLIP_HEADER_ROW_HEIGHT
      if (top < element.scrollTop) element.scrollTop = top
      else if (top + CLIP_HEADER_ROW_HEIGHT > element.scrollTop + element.clientHeight)
        element.scrollTop = top + CLIP_HEADER_ROW_HEIGHT - element.clientHeight
    },
    { flush: 'post' },
  )

  async function requestTimelineScroll(left: number): Promise<void> {
    scrollTimeline(left)
    await nextTick()
    // The timeline can clamp at a different right edge when the Header has a vertical scrollbar.
    if (viewport.value !== null) viewport.value.scrollLeft = getScrollLeft()
  }

  function handleScroll(): void {
    // Focus navigation can reveal an offscreen Header; the timeline remains the horizontal authority.
    const left = viewport.value?.scrollLeft
    if (left !== undefined && left !== getScrollLeft()) void requestTimelineScroll(left)
  }
  function handleWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) return
    const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0)
    if (delta === 0) return
    event.preventDefault()
    void requestTimelineScroll(getScrollLeft() + delta)
  }
  return { handleScroll, handleWheel }
}
