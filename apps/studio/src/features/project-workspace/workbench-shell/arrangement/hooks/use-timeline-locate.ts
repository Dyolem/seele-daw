import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  shallowRef,
  watch,
  type ShallowRef,
} from 'vue'
import {
  EDITOR_POINTER_INPUT_PHASE,
  createEditorPointerInputAdapter,
  type EditorPointerInputAdapter,
} from '@seele-daw/editor'
import { parseTick, type Tick } from '@seele-daw/project-core'
import { TimelineLocateSession } from '@/features/project-workspace/workbench-shell/arrangement/interaction/timeline-locate-session'
import type {
  TimelineLocateCompletion,
  TimelineLocateInput,
} from '@/features/project-workspace/workbench-shell/arrangement/types/timeline-locate'
import {
  resolveTimelineEdgeScrollVelocity,
  resolveTimelineLocateTick,
} from '@/features/project-workspace/timeline/layout'
import {
  PROJECT_TIMELINE_LOCATE_EDGE_INLINE_SIZE_PX,
  PROJECT_TIMELINE_LOCATE_MAXIMUM_SCROLL_VELOCITY_PX_PER_SECOND,
} from '@/features/project-workspace/timeline/scale'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import { useStudioInteractionTarget } from '@/workbench/actions/vue/studio-editor-action-context'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
} from '@/workbench/actions/studio-action'

const MAXIMUM_EDGE_SCROLL_FRAME_DURATION_SECOND = 0.05

/** Owns browser capture and scrolling; the Locate session owns completion and Playback. */
export function useTimelineLocate({
  surface,
  viewport,
  projectPlayback,
  getProjectId,
  getTimelineEndTick,
  isPlaying,
  followSuspended,
  setScrollLeft,
  followPlayback,
  reportFailure,
}: {
  readonly surface: ShallowRef<HTMLElement | null>
  readonly viewport: ShallowRef<HTMLElement | null>
  readonly projectPlayback: Pick<ProjectPlaybackCoordinator, 'beginTimelineLocate'>
  readonly getProjectId: () => string
  readonly getTimelineEndTick: () => Tick
  readonly isPlaying: Readonly<ShallowRef<boolean>>
  readonly followSuspended: ShallowRef<boolean>
  readonly setScrollLeft: (left: number) => boolean
  readonly followPlayback: () => void
  readonly reportFailure: (cause: unknown) => void
}) {
  const state = shallowRef<TimelineLocateSession['state']>({
    interactionId: null,
    previewTick: null,
  })
  let adapter: EditorPointerInputAdapter | null = null
  let observer: ResizeObserver | null = null
  let frame: number | null = null
  let previousTimestamp: number | null = null
  let clientX = 0
  let disposed = false
  let callbackEpoch = 0
  let pendingFollowSuspension: boolean | null = null
  let mapping: Readonly<{ left: number; width: number; scrollWidth: number }> | null = null
  const session = new TimelineLocateSession((next) => {
    state.value = next
    if (next.interactionId === null) {
      mapping = null
      stopEdgeScroll()
      adapter?.cancel()
    }
  }, complete)

  function scheduleFollow(): void {
    const epoch = callbackEpoch
    void nextTick(() => {
      if (!disposed && callbackEpoch === epoch && session.state.interactionId === null)
        followPlayback()
    })
  }
  function complete(completion: TimelineLocateCompletion): void {
    const { accepted, committed, startedWhilePlaying, wasFollowSuspended } = completion
    const suspended = committed && accepted && startedWhilePlaying ? false : wasFollowSuspended
    pendingFollowSuspension = accepted && startedWhilePlaying ? suspended : null
    followSuspended.value = suspended
    if (accepted && startedWhilePlaying && !suspended) scheduleFollow()
  }
  function cancel(): void {
    callbackEpoch += 1
    try {
      session.cancel()
    } finally {
      stopEdgeScroll()
      mapping = null
      adapter?.cancel()
    }
  }
  function fail(cause: unknown): void {
    try {
      cancel()
    } finally {
      reportFailure(cause)
    }
  }
  function tickAtPointer(): Tick {
    const element = viewport.value
    if (element === null) return parseTick(0)
    return resolveTimelineLocateTick({
      clientX,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
      timelineEndTick: getTimelineEndTick(),
      viewportLeft: element.getBoundingClientRect().left,
    })
  }
  function readMapping() {
    const element = viewport.value
    if (element === null) return null
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, width: bounds.width, scrollWidth: element.scrollWidth }
  }
  function stableMapping(): boolean {
    if (mapping === null) return true
    const current = readMapping()
    if (
      current?.left === mapping.left &&
      current.width === mapping.width &&
      current.scrollWidth === mapping.scrollWidth
    )
      return true
    cancel()
    return false
  }
  function velocity(): number {
    const element = viewport.value
    if (element === null) return 0
    const bounds = element.getBoundingClientRect()
    return resolveTimelineEdgeScrollVelocity({
      clientX,
      edgeInlineSize: PROJECT_TIMELINE_LOCATE_EDGE_INLINE_SIZE_PX,
      maximumVelocity: PROJECT_TIMELINE_LOCATE_MAXIMUM_SCROLL_VELOCITY_PX_PER_SECOND,
      viewportLeft: bounds.left,
      viewportRight: bounds.right,
    })
  }
  function stopEdgeScroll(): void {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
    previousTimestamp = null
  }
  function requestEdgeScroll(): void {
    const interactionId = session.state.interactionId
    if (interactionId === null || velocity() === 0) {
      stopEdgeScroll()
      return
    }
    if (frame !== null) return
    const handle = window.requestAnimationFrame((timestamp) => {
      // A cancelled frame must not clear or advance the next gesture's frame.
      if (disposed || frame !== handle || session.state.interactionId !== interactionId) return
      frame = null
      try {
        const element = viewport.value
        if (element === null || !stableMapping()) return
        const speed = velocity()
        if (speed === 0) {
          previousTimestamp = null
          return
        }
        const elapsed =
          previousTimestamp === null
            ? 1 / 60
            : Math.min(
                MAXIMUM_EDGE_SCROLL_FRAME_DURATION_SECOND,
                Math.max(0, (timestamp - previousTimestamp) / 1000),
              )
        previousTimestamp = timestamp
        const didScroll = setScrollLeft(element.scrollLeft + speed * elapsed)
        session.update(interactionId, tickAtPointer())
        if (didScroll) requestEdgeScroll()
        else previousTimestamp = null
      } catch (cause) {
        fail(cause)
      }
    })
    frame = handle
  }
  function remap(): void {
    if (disposed || session.state.interactionId === null) return
    try {
      if (!stableMapping()) return
      const interactionId = session.state.interactionId
      if (interactionId === null) return
      session.update(interactionId, tickAtPointer())
      requestEdgeScroll()
    } catch (cause) {
      fail(cause)
    }
  }
  function onInput(input: TimelineLocateInput): void {
    if (disposed) return
    if (input.phase === EDITOR_POINTER_INPUT_PHASE.CANCEL) {
      cancel()
      return
    }
    if (!stableMapping()) return
    clientX = input.position.xCssPixel
    if (input.phase === EDITOR_POINTER_INPUT_PHASE.BEGIN) {
      callbackEpoch += 1
      pendingFollowSuspension = null
      mapping = readMapping()
      const wasPlaying = isPlaying.value
      session.handlePointerInput(input, tickAtPointer(), {
        beginPlayback: () => projectPlayback.beginTimelineLocate(),
        wasFollowSuspended: followSuspended.value,
      })
      if (session.state.interactionId === null) {
        adapter?.cancel()
        return
      }
      if (wasPlaying) followSuspended.value = true
    } else session.handlePointerInput(input, tickAtPointer())
    requestEdgeScroll()
  }
  const stopTarget = watch([getProjectId, getTimelineEndTick, viewport, surface], cancel, {
    flush: 'sync',
  })
  const stopPlayback = watch(
    isPlaying,
    (playing, previous) => {
      if (!playing || previous) return
      followSuspended.value = pendingFollowSuspension ?? false
      pendingFollowSuspension = null
      if (!followSuspended.value) scheduleFollow()
    },
    { immediate: true },
  )
  useStudioInteractionTarget({
    isActive: () => state.value.interactionId !== null,
    cancel: () => {
      if (state.value.interactionId === null) return STUDIO_ACTION_NOT_APPLIED
      cancel()
      return STUDIO_ACTION_COMPLETED
    },
  })
  function dispose(): void {
    if (disposed) return
    disposed = true
    stopTarget()
    stopPlayback()
    window.removeEventListener('scroll', remap, true)
    window.removeEventListener('resize', remap)
    observer?.disconnect()
    observer = null
    try {
      cancel()
    } finally {
      adapter?.dispose()
      adapter = null
      session.dispose()
    }
  }
  onMounted(() => {
    const element = surface.value
    if (element === null) return
    try {
      adapter = createEditorPointerInputAdapter<never>({
        surface: element,
        positionSpace: 'client',
        resolveHit: (event) => {
          event.preventDefault()
          element.focus({ preventScroll: true })
          return null
        },
        observer: { onInput, onError: ({ cause }) => fail(cause) },
      })
      window.addEventListener('scroll', remap, true)
      window.addEventListener('resize', remap)
      if (typeof ResizeObserver !== 'undefined' && viewport.value !== null) {
        observer = new ResizeObserver(remap)
        observer.observe(viewport.value)
      }
    } catch (cause) {
      dispose()
      reportFailure(cause)
    }
  })
  onBeforeUnmount(dispose)
  return { previewTick: computed(() => state.value.previewTick) }
}
