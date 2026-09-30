import { computed, nextTick, shallowRef, watch, type ShallowRef } from 'vue'
import type { ProjectId, Tick } from '@seele-daw/project-core'
import {
  resolvePagedFollowScrollLeft,
  timelinePositionRatio,
} from '@/features/project-workspace/timeline/layout'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'

export function useTrackFollow({
  scrollViewport,
  getProjectId,
  getTimelineEndTick,
}: {
  readonly scrollViewport: Readonly<ShallowRef<HTMLElement | null>>
  readonly getProjectId: () => ProjectId
  readonly getTimelineEndTick: () => Tick
}) {
  const { state: playbackState, visualPosition: playbackVisualPosition } = useProjectPlayback()
  const isTimelineFollowSuspended = shallowRef(false)
  let observedScrollLeft = 0
  let disposed = false
  let queuedFollow = 0
  function queueFollow(): void {
    const request = ++queuedFollow
    void nextTick(() => {
      if (!disposed && request === queuedFollow) followCurrentPlaybackPosition()
    })
  }
  const isCurrentProjectPlaying = computed(
    () =>
      playbackState.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING &&
      playbackState.value.projectId === getProjectId(),
  )
  const isTimelineFollowActive = computed(
    () => isCurrentProjectPlaying.value && !isTimelineFollowSuspended.value,
  )
  const timelineFollowLabel = computed(() => {
    if (!isCurrentProjectPlaying.value) return 'Track timeline follow — starts with playback'
    return isTimelineFollowSuspended.value
      ? 'Resume Track timeline follow'
      : 'Pause Track timeline follow'
  })
  const currentPlaybackPositionTick = computed(() =>
    playbackVisualPosition.value.projectId === getProjectId()
      ? playbackVisualPosition.value.positionTick
      : 0,
  )

  function setScrollLeft(nextScrollLeft: number): void {
    const element = scrollViewport.value
    if (element === null) return

    const maximumScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth)
    element.scrollLeft = Math.min(maximumScrollLeft, Math.max(0, nextScrollLeft))
    // Consume the ensuing native scroll event as this page jump, not as user navigation.
    observedScrollLeft = element.scrollLeft
  }

  function followCurrentPlaybackPosition(): void {
    const element = scrollViewport.value
    if (disposed || element === null || !isTimelineFollowActive.value) return

    setScrollLeft(
      resolvePagedFollowScrollLeft({
        clientWidth: element.clientWidth,
        positionRatio: timelinePositionRatio(
          currentPlaybackPositionTick.value,
          getTimelineEndTick(),
        ),
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      }),
    )
  }

  function suspendTimelineFollow(): void {
    if (isCurrentProjectPlaying.value) isTimelineFollowSuspended.value = true
  }

  function toggleTimelineFollow(): void {
    if (!isCurrentProjectPlaying.value) return

    isTimelineFollowSuspended.value = !isTimelineFollowSuspended.value
    if (!isTimelineFollowSuspended.value) queueFollow()
  }

  function isFollowControlTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest('.project-piano-roll-track__follow-control') !== null
    )
  }

  function handleTimelinePointerDown(event: PointerEvent): void {
    if (!isFollowControlTarget(event.target)) suspendTimelineFollow()
  }

  function handleTimelineWheel(event: WheelEvent): void {
    if (event.deltaX !== 0 || (event.shiftKey && event.deltaY !== 0)) suspendTimelineFollow()
  }

  function handleScroll(event: Event): void {
    const element = event.currentTarget as HTMLElement
    if (element.scrollLeft === observedScrollLeft) return

    observedScrollLeft = element.scrollLeft
    suspendTimelineFollow()
  }

  watch(
    isCurrentProjectPlaying,
    (isPlaying, wasPlaying) => {
      if (!isPlaying || wasPlaying) return

      isTimelineFollowSuspended.value = false
      queueFollow()
    },
    { immediate: true },
  )

  watch(currentPlaybackPositionTick, followCurrentPlaybackPosition, { flush: 'post' })

  watch(
    () => getTimelineEndTick(),
    () => queueFollow(),
  )

  return {
    isCurrentProjectPlaying,
    isTimelineFollowActive,
    timelineFollowLabel,
    suspendTimelineFollow,
    toggleTimelineFollow,
    handleTimelinePointerDown,
    handleTimelineWheel,
    handleScroll,
    dispose() {
      disposed = true
      queuedFollow += 1
    },
  }
}
