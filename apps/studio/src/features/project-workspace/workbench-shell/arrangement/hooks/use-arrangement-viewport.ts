import { parseTick, type Tick } from '@seele-daw/project-core'
import { computed, nextTick, shallowRef, watch } from 'vue'

import {
  resolveCenteredTimelineScrollLeft,
  resolvePagedFollowScrollLeft,
  timelinePositionRatio,
} from '@/workbench/timeline/layout'
import { useTimelineLocate } from '@/features/project-workspace/workbench-shell/arrangement/hooks/use-timeline-locate'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import { useStudio } from '@/workbench/studio-services'

const WHEEL_DELTA_MODE_LINE = 1
const WHEEL_DELTA_MODE_PAGE = 2
const WHEEL_LINE_BLOCK_SIZE_PX = 16

export interface ArrangementViewportLayout {
  readonly projectId: string
  readonly barSpanTick: Tick
  readonly timeSignatureNumerator: number
  readonly timelineEndTick: Tick
  readonly tracks: readonly unknown[]
}

function isInside(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null
}

/**
 * The arrangement's one scroll position. The track column mirrors its vertical offset, playback
 * pages it horizontally until the user scrolls away, and the ruler locates playback.
 */
export function useArrangementViewport(layout: ArrangementViewportLayout) {
  const { projectPlayback, state: playbackState, visualPosition } = useStudio().playback
  const toasts = useUiToastStore()
  const viewportElement = shallowRef<HTMLElement | null>(null)
  const trackViewportElement = shallowRef<HTMLElement | null>(null)
  const trackFollowerElement = shallowRef<HTMLElement | null>(null)
  const locateSurface = shallowRef<HTMLElement | null>(null)
  const followSuspended = shallowRef(false)
  // The last scrollLeft this code set or saw, so programmatic jumps are not read as user scrolls.
  let observedScrollLeft = 0

  const isCurrentProjectPlaying = computed(
    () =>
      playbackState.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING &&
      playbackState.value.projectId === layout.projectId,
  )
  const isFollowActive = computed(() => isCurrentProjectPlaying.value && !followSuspended.value)
  const followLabel = computed(() => {
    if (!isCurrentProjectPlaying.value) return 'Timeline follow — starts with playback'
    return followSuspended.value ? 'Resume timeline follow' : 'Pause timeline follow'
  })
  const playbackTick = computed(() =>
    visualPosition.value.projectId === layout.projectId ? visualPosition.value.positionTick : 0,
  )

  // The track controls mirror the vertical offset on a clipped layer, so the native horizontal
  // scrollbar stays inside the timeline column.
  function syncTrackFollower(scrollTop: number): void {
    trackFollowerElement.value?.style.setProperty(
      '--project-workbench-track-scroll-offset',
      `${-scrollTop}px`,
    )
  }

  function maximumScrollTop(viewport: HTMLElement): number {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  }

  function setScrollTop(next: number): void {
    const viewport = viewportElement.value
    if (viewport === null) return
    viewport.scrollTop = Math.min(maximumScrollTop(viewport), Math.max(0, next))
    syncTrackFollower(viewport.scrollTop)
  }

  function setScrollLeft(next: number): boolean {
    const viewport = viewportElement.value
    if (viewport === null) return false
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const previous = viewport.scrollLeft
    viewport.scrollLeft = Math.min(maximum, Math.max(0, next))
    observedScrollLeft = viewport.scrollLeft
    return viewport.scrollLeft !== previous
  }

  function suspendFollow(): void {
    if (isCurrentProjectPlaying.value) followSuspended.value = true
  }

  function followPlayback(): void {
    const viewport = viewportElement.value
    if (viewport === null || !isFollowActive.value) return
    setScrollLeft(
      resolvePagedFollowScrollLeft({
        clientWidth: viewport.clientWidth,
        positionRatio: timelinePositionRatio(playbackTick.value, layout.timelineEndTick),
        scrollLeft: viewport.scrollLeft,
        scrollWidth: viewport.scrollWidth,
      }),
    )
  }

  const { previewTick: locatePreviewTick } = useTimelineLocate({
    surface: locateSurface,
    viewport: viewportElement,
    projectPlayback,
    getProjectId: () => layout.projectId,
    getTimelineEndTick: () => layout.timelineEndTick,
    isPlaying: isCurrentProjectPlaying,
    followSuspended,
    setScrollLeft,
    followPlayback,
    reportFailure: (cause) =>
      toasts.danger(
        'Timeline locate could not complete',
        cause instanceof Error ? cause.message : 'Please try the gesture again.',
      ),
  })
  const rulerPositionTick = computed(() =>
    Math.round(
      Math.min(layout.timelineEndTick, Math.max(0, locatePreviewTick.value ?? playbackTick.value)),
    ),
  )

  watch(
    () => layout.tracks.length,
    async () => {
      await nextTick()
      const viewport = viewportElement.value
      if (viewport !== null) setScrollTop(viewport.scrollTop)
    },
  )
  watch(playbackTick, followPlayback, { flush: 'post' })
  watch(
    () => layout.timelineEndTick,
    () => void nextTick(followPlayback),
  )

  return {
    viewportElement,
    trackViewportElement,
    trackFollowerElement,
    locateSurface,
    isCurrentProjectPlaying,
    isFollowActive,
    followLabel,
    locatePreviewTick,
    rulerPositionTick,
    suspendFollow,
    toggleFollow(): void {
      if (!isCurrentProjectPlaying.value) return
      followSuspended.value = !followSuspended.value
      if (!followSuspended.value) void nextTick(followPlayback)
    },
    /** Centers `tick` and stops following playback. */
    revealTick(tick: Tick): void {
      const viewport = viewportElement.value
      if (viewport === null) return
      suspendFollow()
      setScrollLeft(
        resolveCenteredTimelineScrollLeft({
          clientWidth: viewport.clientWidth,
          positionRatio: timelinePositionRatio(tick, layout.timelineEndTick),
          scrollWidth: viewport.scrollWidth,
        }),
      )
    },
    handleViewportScroll(event: Event): void {
      const viewport = event.currentTarget as HTMLElement
      syncTrackFollower(viewport.scrollTop)
      if (viewport.scrollLeft === observedScrollLeft) return
      observedScrollLeft = viewport.scrollLeft
      suspendFollow()
    },
    handleViewportWheel(event: WheelEvent): void {
      if (event.deltaX !== 0 || (event.shiftKey && event.deltaY !== 0)) suspendFollow()
    },
    handleTimelinePointerDown(event: PointerEvent): void {
      if (
        !isInside(event.target, '.project-workbench__follow-control') &&
        !isInside(event.target, '.project-workbench__ruler-locate-surface')
      ) {
        suspendFollow()
      }
    },
    handleRulerKeydown(event: KeyboardEvent): void {
      const current = Math.round(playbackTick.value)
      const beatSpanTick = Math.max(
        1,
        Math.round(layout.barSpanTick / layout.timeSignatureNumerator),
      )
      let target: number
      switch (event.key) {
        case 'ArrowLeft':
          target = current - beatSpanTick
          break
        case 'ArrowRight':
          target = current + beatSpanTick
          break
        case 'End':
          target = layout.timelineEndTick
          break
        case 'Home':
          target = 0
          break
        case 'PageDown':
          target = current + layout.barSpanTick
          break
        case 'PageUp':
          target = current - layout.barSpanTick
          break
        default:
          return
      }
      const startedWhilePlaying = isCurrentProjectPlaying.value
      const located = projectPlayback.locateAtTick(
        parseTick(Math.min(layout.timelineEndTick, Math.max(0, target))),
      )
      if (located && startedWhilePlaying) {
        followSuspended.value = false
        void nextTick(followPlayback)
      }
      event.preventDefault()
      event.stopPropagation()
    },
    /** The track column has no scrollbar of its own; its wheel scrolls the arrangement. */
    handleTrackWheel(event: WheelEvent): void {
      const viewport = viewportElement.value
      if (viewport === null) return
      let delta = event.deltaY
      if (event.deltaMode === WHEEL_DELTA_MODE_LINE) delta *= WHEEL_LINE_BLOCK_SIZE_PX
      else if (event.deltaMode === WHEEL_DELTA_MODE_PAGE) delta *= viewport.clientHeight
      const next = Math.min(maximumScrollTop(viewport), Math.max(0, viewport.scrollTop + delta))
      if (next === viewport.scrollTop) return
      setScrollTop(next)
      event.preventDefault()
    },
    /** Keeps a focused track row inside the visible track column. */
    handleTrackFocusIn(event: FocusEvent): void {
      const viewport = viewportElement.value
      const trackViewport = trackViewportElement.value
      if (!(event.target instanceof Element) || viewport === null || trackViewport === null) return
      const row = event.target.closest<HTMLElement>('.project-workbench__track-row-slot')
      if (row === null) return
      const visible = trackViewport.getBoundingClientRect()
      const bounds = row.getBoundingClientRect()
      if (bounds.top < visible.top) setScrollTop(viewport.scrollTop + bounds.top - visible.top)
      else if (bounds.bottom > visible.bottom) {
        setScrollTop(viewport.scrollTop + bounds.bottom - visible.bottom)
      }
    },
  }
}
