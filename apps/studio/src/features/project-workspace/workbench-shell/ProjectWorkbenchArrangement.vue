<script setup lang="ts">
import { parseTick, type Tick, type TrackId } from '@seele-daw/project-core'
import GridIcon from '~icons/fluent/grid-20-regular'
import MoreIcon from '~icons/fluent/more-horizontal-20-regular'
import MidiIcon from '~icons/fluent/midi-20-regular'
import MusicNoteIcon from '~icons/fluent/music-note-2-20-regular'
import TargetArrowIcon from '~icons/fluent/target-arrow-20-regular'
import ZoomInIcon from '~icons/fluent/zoom-in-20-regular'
import ZoomOutIcon from '~icons/fluent/zoom-out-20-regular'
import { computed, nextTick, onUnmounted, shallowRef, type StyleValue, watch } from 'vue'

import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import ProjectAddTrackMenu from '@/features/project-workspace/workbench-shell/ProjectAddTrackMenu.vue'
import ProjectWorkbenchMidiClip from '@/features/project-workspace/workbench-shell/ProjectWorkbenchMidiClip.vue'
import ProjectWorkbenchTrackRow from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTrackRow.vue'
import {
  resolvePagedFollowScrollLeft,
  resolveTimelineEdgeScrollVelocity,
  resolveTimelineLocateTick,
  timelinePositionRatio,
} from '@/features/project-workspace/timeline/layout'
import {
  PROJECT_TIMELINE_BAR_INLINE_SIZE_REM,
  PROJECT_TIMELINE_LOCATE_EDGE_INLINE_SIZE_PX,
  PROJECT_TIMELINE_LOCATE_MAXIMUM_SCROLL_VELOCITY_PX_PER_SECOND,
} from '@/features/project-workspace/timeline/scale'
import ArrangementPlayhead from '@/features/project-workspace/workbench-shell/arrangement/ArrangementPlayhead.vue'
import LocatePreview from '@/features/project-workspace/workbench-shell/arrangement/LocatePreview.vue'
import {
  PROJECT_ADD_TRACK_TYPE,
  type ProjectAddTrackType,
} from '@/features/project-workspace/workbench-shell/project-add-track-option'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { useProjectClips } from '@/workbench/project/clip/vue/project-clip-context'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackLocateSession } from '@/workbench/project/playback/project-playback-coordinator'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'
import { useProjectTracks } from '@/workbench/project/track/vue/project-track-context'

const WHEEL_DELTA_MODE_LINE = 1
const WHEEL_DELTA_MODE_PAGE = 2
const WHEEL_LINE_BLOCK_SIZE_PX = 16
const MAXIMUM_LOCATE_EDGE_SCROLL_FRAME_DURATION_SECOND = 0.05
const EMPTY_CLIPS: readonly ProjectMidiClipPresentation[] = Object.freeze([])
const TIMELINE_INTERACTION_KEYS = new Set([
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'End',
  'Enter',
  'Home',
  'PageDown',
  'PageUp',
])

interface TimelineBarPresentation {
  readonly number: number
  readonly startTick: Tick
  readonly style: StyleValue
}

interface ActiveTimelineLocateGesture {
  readonly pointerId: number
  readonly session: ProjectPlaybackLocateSession
  readonly surface: HTMLElement
  readonly wasTimelineFollowSuspended: boolean
}

const props = withDefaults(
  defineProps<{
    readonly barSpanTick: Tick
    readonly clips: readonly ProjectMidiClipPresentation[]
    readonly isMidiImporting?: boolean
    readonly projectId: string
    readonly timeSignatureNumerator: number
    readonly timelineEndTick: Tick
    readonly tracks: readonly ProjectTrackPresentation[]
  }>(),
  {
    isMidiImporting: false,
  },
)
const emit = defineEmits<{
  importMidiAsNewTracks: []
  openMidiClip: []
}>()

const { projectClips } = useProjectClips()
const {
  projectPlayback,
  state: playbackState,
  visualPosition: playbackVisualPosition,
} = useProjectPlayback()
const { projectTracks } = useProjectTracks()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const toasts = useUiToastStore()
const arrangementViewportElement = shallowRef<HTMLElement | null>(null)
const trackViewportElement = shallowRef<HTMLElement | null>(null)
const trackFollowerElement = shallowRef<HTMLElement | null>(null)
const isTimelineFollowSuspended = shallowRef(false)
const locatePreviewTick = shallowRef<Tick | null>(null)
let observedArrangementScrollLeft = 0
let activeTimelineLocateGesture: ActiveTimelineLocateGesture | null = null
let locateEdgeScrollFrameHandle: number | null = null
let locateEdgeScrollPreviousTimestamp: number | null = null
let locatePointerClientX = 0
let pendingPlaybackStartFollowSuspension: boolean | null = null

const isCurrentProjectPlaying = computed(
  () =>
    playbackState.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING &&
    playbackState.value.projectId === props.projectId,
)
const isTimelineFollowActive = computed(
  () => isCurrentProjectPlaying.value && !isTimelineFollowSuspended.value,
)
const timelineFollowLabel = computed(() => {
  if (!isCurrentProjectPlaying.value) return 'Timeline follow — starts with playback'
  return isTimelineFollowSuspended.value ? 'Resume timeline follow' : 'Pause timeline follow'
})
const currentPlaybackPositionTick = computed(() =>
  playbackVisualPosition.value.projectId === props.projectId
    ? playbackVisualPosition.value.positionTick
    : 0,
)
const rulerPositionTick = computed(() =>
  Math.round(
    Math.min(
      props.timelineEndTick,
      Math.max(0, locatePreviewTick.value ?? currentPlaybackPositionTick.value),
    ),
  ),
)

const timelineBars = computed((): readonly TimelineBarPresentation[] => {
  const barCount = Math.ceil(props.timelineEndTick / props.barSpanTick)

  return Object.freeze(
    Array.from({ length: barCount }, (_, barIndex) => {
      const startTick = parseTick(barIndex * props.barSpanTick)
      const spanTick = Math.min(props.barSpanTick, props.timelineEndTick - startTick)
      return Object.freeze({
        number: barIndex + 1,
        startTick,
        style: {
          '--project-workbench-bar-inline-size': `${
            (spanTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
          }rem`,
        } as StyleValue,
      })
    }),
  )
})
const timelineStyle = computed(
  (): StyleValue =>
    ({
      '--project-workbench-timeline-inline-size': `${
        (props.timelineEndTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
      }rem`,
    }) as StyleValue,
)
const visibleClipsByTrack = computed(() => {
  const clipsByTrack = new Map<TrackId, ProjectMidiClipPresentation[]>()

  for (const clip of props.clips) {
    if (clip.startTick >= props.timelineEndTick) continue

    const clips = clipsByTrack.get(clip.trackId)
    if (clips === undefined) {
      clipsByTrack.set(clip.trackId, [clip])
    } else {
      clips.push(clip)
    }
  }

  return clipsByTrack
})

const UNAVAILABLE_TRACK_LABELS: Readonly<
  Record<Exclude<ProjectAddTrackType, 'instrument'>, string>
> = Object.freeze({
  [PROJECT_ADD_TRACK_TYPE.AUDIO]: 'Voice / audio',
  [PROJECT_ADD_TRACK_TYPE.BASS]: 'Bass',
  [PROJECT_ADD_TRACK_TYPE.DRUM_MACHINE]: 'Drum machine',
  [PROJECT_ADD_TRACK_TYPE.GUITAR]: 'Guitar',
  [PROJECT_ADD_TRACK_TYPE.SAMPLER]: 'Sampler',
})

function handleTrackTypeSelection(trackType: ProjectAddTrackType): void {
  if (trackType !== PROJECT_ADD_TRACK_TYPE.INSTRUMENT) {
    toasts.info(
      `${UNAVAILABLE_TRACK_LABELS[trackType]} is in development`,
      'This track type will become available in a later product slice.',
    )
    return
  }

  try {
    const result = projectTracks.addInstrumentTrack()
    workbenchSelection.selectTrack(result.trackId)
  } catch (cause) {
    toasts.danger(
      'Instrument track could not be added',
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : 'The Project rejected the Track command. Please try again.',
    )
  }
}

function createTrackStyle(track: ProjectTrackPresentation): StyleValue {
  return {
    '--project-track-color': track.color ?? 'var(--sd-color-border-focus)',
  }
}

function selectTrack(track: ProjectTrackPresentation): void {
  workbenchSelection.selectTrack(track.id)
}

function clipsForTrack(trackId: TrackId): readonly ProjectMidiClipPresentation[] {
  return visibleClipsByTrack.value.get(trackId) ?? EMPTY_CLIPS
}

function createEmptyMidiClip(track: ProjectTrackPresentation, targetTick: Tick): void {
  try {
    const result = projectClips.addEmptyMidiClip({
      targetTick,
      trackId: track.id,
    })
    workbenchSelection.selectClip(result.trackId, result.clipId)
    emit('openMidiClip')
  } catch (cause) {
    toasts.danger(
      'MIDI clip could not be added',
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : 'The Project rejected the Clip command. Please try again.',
    )
  }
}

function selectClip(clip: ProjectMidiClipPresentation): void {
  workbenchSelection.selectClip(clip.trackId, clip.id)
}

// Arrangement owns the only scroll position. Track controls mirror its vertical offset on a
// clipped compositor layer so the native horizontal scrollbar stays inside the Timeline column.
function synchronizeTrackFollower(scrollTop: number): void {
  trackFollowerElement.value?.style.setProperty(
    '--project-workbench-track-scroll-offset',
    `${-scrollTop}px`,
  )
}

function maximumArrangementScrollTop(viewport: HTMLElement): number {
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight)
}

function setArrangementScrollTop(nextScrollTop: number): void {
  const viewport = arrangementViewportElement.value
  if (viewport === null) return

  viewport.scrollTop = Math.min(maximumArrangementScrollTop(viewport), Math.max(0, nextScrollTop))
  synchronizeTrackFollower(viewport.scrollTop)
}

function handleArrangementScroll(event: Event): void {
  const viewport = event.currentTarget as HTMLElement
  synchronizeTrackFollower(viewport.scrollTop)
  if (viewport.scrollLeft === observedArrangementScrollLeft) return

  observedArrangementScrollLeft = viewport.scrollLeft
  suspendTimelineFollow()
}

function setArrangementScrollLeft(nextScrollLeft: number): boolean {
  const viewport = arrangementViewportElement.value
  if (viewport === null) return false

  const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  const previousScrollLeft = viewport.scrollLeft
  viewport.scrollLeft = Math.min(maximumScrollLeft, Math.max(0, nextScrollLeft))
  // Consume the ensuing native scroll event as this page jump, not as user navigation.
  observedArrangementScrollLeft = viewport.scrollLeft
  return viewport.scrollLeft !== previousScrollLeft
}

function followCurrentPlaybackPosition(): void {
  const viewport = arrangementViewportElement.value
  if (viewport === null || !isTimelineFollowActive.value) return

  setArrangementScrollLeft(
    resolvePagedFollowScrollLeft({
      clientWidth: viewport.clientWidth,
      positionRatio: timelinePositionRatio(
        currentPlaybackPositionTick.value,
        props.timelineEndTick,
      ),
      scrollLeft: viewport.scrollLeft,
      scrollWidth: viewport.scrollWidth,
    }),
  )
}

function suspendTimelineFollow(): void {
  if (isCurrentProjectPlaying.value) isTimelineFollowSuspended.value = true
}

function toggleTimelineFollow(): void {
  if (!isCurrentProjectPlaying.value) return

  isTimelineFollowSuspended.value = !isTimelineFollowSuspended.value
  if (!isTimelineFollowSuspended.value) void nextTick(followCurrentPlaybackPosition)
}

function isFollowControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.project-workbench__follow-control') !== null
}

function isTimelineLocateTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('.project-workbench__ruler-locate-surface') !== null
  )
}

function locateTickAtClientX(clientX: number): Tick {
  const viewport = arrangementViewportElement.value
  if (viewport === null) return parseTick(0)

  return resolveTimelineLocateTick({
    clientX,
    scrollLeft: viewport.scrollLeft,
    scrollWidth: viewport.scrollWidth,
    timelineEndTick: props.timelineEndTick,
    viewportLeft: viewport.getBoundingClientRect().left,
  })
}

function edgeScrollVelocity(clientX: number, viewport: HTMLElement): number {
  const bounds = viewport.getBoundingClientRect()
  return resolveTimelineEdgeScrollVelocity({
    clientX,
    edgeInlineSize: PROJECT_TIMELINE_LOCATE_EDGE_INLINE_SIZE_PX,
    maximumVelocity: PROJECT_TIMELINE_LOCATE_MAXIMUM_SCROLL_VELOCITY_PX_PER_SECOND,
    viewportLeft: bounds.left,
    viewportRight: bounds.right,
  })
}

function stopTimelineLocateEdgeScroll(): void {
  if (locateEdgeScrollFrameHandle !== null) {
    window.cancelAnimationFrame(locateEdgeScrollFrameHandle)
    locateEdgeScrollFrameHandle = null
  }
  locateEdgeScrollPreviousTimestamp = null
}

function requestTimelineLocateEdgeScroll(): void {
  const viewport = arrangementViewportElement.value
  if (
    activeTimelineLocateGesture === null ||
    viewport === null ||
    edgeScrollVelocity(locatePointerClientX, viewport) === 0
  ) {
    stopTimelineLocateEdgeScroll()
    return
  }
  if (locateEdgeScrollFrameHandle !== null) return

  locateEdgeScrollFrameHandle = window.requestAnimationFrame((timestamp) => {
    locateEdgeScrollFrameHandle = null
    const activeViewport = arrangementViewportElement.value
    if (activeTimelineLocateGesture === null || activeViewport === null) {
      locateEdgeScrollPreviousTimestamp = null
      return
    }

    const velocity = edgeScrollVelocity(locatePointerClientX, activeViewport)
    if (velocity === 0) {
      locateEdgeScrollPreviousTimestamp = null
      return
    }
    const elapsedSecond =
      locateEdgeScrollPreviousTimestamp === null
        ? 1 / 60
        : Math.min(
            MAXIMUM_LOCATE_EDGE_SCROLL_FRAME_DURATION_SECOND,
            Math.max(0, (timestamp - locateEdgeScrollPreviousTimestamp) / 1_000),
          )
    locateEdgeScrollPreviousTimestamp = timestamp
    const didScroll = setArrangementScrollLeft(activeViewport.scrollLeft + velocity * elapsedSecond)
    locatePreviewTick.value = locateTickAtClientX(locatePointerClientX)
    if (didScroll) {
      requestTimelineLocateEdgeScroll()
    } else {
      locateEdgeScrollPreviousTimestamp = null
    }
  })
}

function releaseTimelineLocateGesture(
  gesture: ActiveTimelineLocateGesture,
): ActiveTimelineLocateGesture | null {
  if (activeTimelineLocateGesture !== gesture) return null
  activeTimelineLocateGesture = null
  locatePreviewTick.value = null
  stopTimelineLocateEdgeScroll()
  if (
    typeof gesture.surface.hasPointerCapture === 'function' &&
    gesture.surface.hasPointerCapture(gesture.pointerId)
  ) {
    gesture.surface.releasePointerCapture(gesture.pointerId)
  }
  return gesture
}

function beginTimelineLocate(event: PointerEvent): void {
  if (activeTimelineLocateGesture !== null || event.isPrimary === false || event.button !== 0) {
    return
  }

  const session = projectPlayback.beginTimelineLocate()
  if (session === null) return
  const surface = event.currentTarget as HTMLElement
  const gesture = Object.freeze({
    pointerId: event.pointerId,
    session,
    surface,
    wasTimelineFollowSuspended: isTimelineFollowSuspended.value,
  })
  activeTimelineLocateGesture = gesture
  locatePointerClientX = event.clientX
  locatePreviewTick.value = locateTickAtClientX(event.clientX)
  if (session.startedWhilePlaying) isTimelineFollowSuspended.value = true
  if (typeof surface.setPointerCapture === 'function') surface.setPointerCapture(event.pointerId)
  requestTimelineLocateEdgeScroll()
  event.preventDefault()
}

function updateTimelineLocate(event: PointerEvent): void {
  const gesture = activeTimelineLocateGesture
  if (gesture === null || gesture.pointerId !== event.pointerId) return

  locatePointerClientX = event.clientX
  locatePreviewTick.value = locateTickAtClientX(event.clientX)
  requestTimelineLocateEdgeScroll()
  event.preventDefault()
}

function commitTimelineLocate(event: PointerEvent): void {
  const gesture = activeTimelineLocateGesture
  if (gesture === null || gesture.pointerId !== event.pointerId) return

  const targetTick = locateTickAtClientX(event.clientX)
  if (releaseTimelineLocateGesture(gesture) === null) return
  if (gesture.session.startedWhilePlaying) pendingPlaybackStartFollowSuspension = false
  const committed = gesture.session.commit(targetTick)
  if (!committed) {
    pendingPlaybackStartFollowSuspension = null
    isTimelineFollowSuspended.value = gesture.wasTimelineFollowSuspended
  } else if (gesture.session.startedWhilePlaying) {
    isTimelineFollowSuspended.value = false
    void nextTick(followCurrentPlaybackPosition)
  }
  event.preventDefault()
}

function cancelTimelineLocate(event?: PointerEvent): void {
  const gesture = activeTimelineLocateGesture
  if (gesture === null || (event !== undefined && gesture.pointerId !== event.pointerId)) return

  if (releaseTimelineLocateGesture(gesture) === null) return
  if (gesture.session.startedWhilePlaying) {
    pendingPlaybackStartFollowSuspension = gesture.wasTimelineFollowSuspended
  }
  const cancelled = gesture.session.cancel()
  if (!cancelled) pendingPlaybackStartFollowSuspension = null
  isTimelineFollowSuspended.value = gesture.wasTimelineFollowSuspended
  if (cancelled && gesture.session.startedWhilePlaying && !gesture.wasTimelineFollowSuspended) {
    void nextTick(followCurrentPlaybackPosition)
  }
  event?.preventDefault()
}

function handleTimelineLocateCaptureLoss(event: PointerEvent): void {
  cancelTimelineLocate(event)
}

function handleTimelinePointerDown(event: PointerEvent): void {
  if (!isFollowControlTarget(event.target) && !isTimelineLocateTarget(event.target)) {
    suspendTimelineFollow()
  }
}

function handleTimelineKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeTimelineLocateGesture !== null) {
    cancelTimelineLocate()
    event.preventDefault()
    return
  }
  if (
    !isFollowControlTarget(event.target) &&
    !isTimelineLocateTarget(event.target) &&
    TIMELINE_INTERACTION_KEYS.has(event.key)
  ) {
    suspendTimelineFollow()
  }
}

function handleRulerKeydown(event: KeyboardEvent): void {
  const currentTick = Math.round(currentPlaybackPositionTick.value)
  const beatSpanTick = Math.max(1, Math.round(props.barSpanTick / props.timeSignatureNumerator))
  let targetTick: number

  switch (event.key) {
    case 'ArrowLeft':
      targetTick = currentTick - beatSpanTick
      break
    case 'ArrowRight':
      targetTick = currentTick + beatSpanTick
      break
    case 'End':
      targetTick = props.timelineEndTick
      break
    case 'Home':
      targetTick = 0
      break
    case 'PageDown':
      targetTick = currentTick + props.barSpanTick
      break
    case 'PageUp':
      targetTick = currentTick - props.barSpanTick
      break
    default:
      return
  }

  const startedWhilePlaying = isCurrentProjectPlaying.value
  const located = projectPlayback.locateAtTick(
    parseTick(Math.min(props.timelineEndTick, Math.max(0, targetTick))),
  )
  if (located && startedWhilePlaying) {
    isTimelineFollowSuspended.value = false
    void nextTick(followCurrentPlaybackPosition)
  }
  event.preventDefault()
  event.stopPropagation()
}

function handleArrangementWheel(event: WheelEvent): void {
  if (event.deltaX !== 0 || (event.shiftKey && event.deltaY !== 0)) {
    suspendTimelineFollow()
  }
}

function wheelBlockDelta(event: WheelEvent, viewport: HTMLElement): number {
  if (event.deltaMode === WHEEL_DELTA_MODE_LINE) {
    return event.deltaY * WHEEL_LINE_BLOCK_SIZE_PX
  }
  if (event.deltaMode === WHEEL_DELTA_MODE_PAGE) return event.deltaY * viewport.clientHeight
  return event.deltaY
}

function handleTrackWheel(event: WheelEvent): void {
  const viewport = arrangementViewportElement.value
  if (viewport === null) return

  const currentScrollTop = viewport.scrollTop
  const nextScrollTop = Math.min(
    maximumArrangementScrollTop(viewport),
    Math.max(0, currentScrollTop + wheelBlockDelta(event, viewport)),
  )
  if (nextScrollTop === currentScrollTop) return

  setArrangementScrollTop(nextScrollTop)
  event.preventDefault()
}

function handleTrackFocusIn(event: FocusEvent): void {
  const target = event.target
  const trackViewport = trackViewportElement.value
  const arrangementViewport = arrangementViewportElement.value
  if (!(target instanceof Element) || trackViewport === null || arrangementViewport === null) {
    return
  }

  const trackRow = target.closest<HTMLElement>('.project-workbench__track-row-slot')
  if (trackRow === null) return

  const trackViewportBounds = trackViewport.getBoundingClientRect()
  const trackRowBounds = trackRow.getBoundingClientRect()
  if (trackRowBounds.top < trackViewportBounds.top) {
    setArrangementScrollTop(
      arrangementViewport.scrollTop + trackRowBounds.top - trackViewportBounds.top,
    )
  } else if (trackRowBounds.bottom > trackViewportBounds.bottom) {
    setArrangementScrollTop(
      arrangementViewport.scrollTop + trackRowBounds.bottom - trackViewportBounds.bottom,
    )
  }
}

watch(
  () => props.tracks.length,
  async () => {
    await nextTick()
    const viewport = arrangementViewportElement.value
    if (viewport !== null) setArrangementScrollTop(viewport.scrollTop)
  },
)

watch(
  isCurrentProjectPlaying,
  (isPlaying, wasPlaying) => {
    if (!isPlaying || wasPlaying) return

    isTimelineFollowSuspended.value = pendingPlaybackStartFollowSuspension ?? false
    pendingPlaybackStartFollowSuspension = null
    if (!isTimelineFollowSuspended.value) void nextTick(followCurrentPlaybackPosition)
  },
  { immediate: true },
)

watch(currentPlaybackPositionTick, followCurrentPlaybackPosition, { flush: 'post' })

watch(
  () => props.timelineEndTick,
  () => void nextTick(followCurrentPlaybackPosition),
)

onUnmounted(() => cancelTimelineLocate())
</script>

<template>
  <div
    class="project-workbench__arrangement-layout"
    role="region"
    aria-label="Arrangement tracks and lanes"
    :style="timelineStyle"
  >
    <aside class="project-workbench__track-column" aria-label="Tracks">
      <div class="project-workbench__track-panel">
        <header class="project-workbench__track-heading">
          <strong>Tracks</strong>
          <UiIconButton
            disabled
            :icon="MoreIcon"
            label="Track options — track editing is not available"
            size="small"
          />
        </header>
        <div class="project-workbench__track-actions">
          <ProjectAddTrackMenu @select="handleTrackTypeSelection" />
        </div>
      </div>
      <div
        ref="trackViewportElement"
        class="project-workbench__track-viewport"
        @focusin="handleTrackFocusIn"
        @wheel="handleTrackWheel"
      >
        <div v-if="props.tracks.length === 0" class="project-workbench__track-empty">
          <span>
            <UiIcon :icon="MusicNoteIcon" :size="20" />
          </span>
          <strong>No tracks yet</strong>
          <p>Add a virtual instrument to start arranging your Project.</p>
        </div>
        <div
          v-else
          ref="trackFollowerElement"
          class="project-workbench__track-list"
          role="list"
          aria-label="Track controls"
        >
          <div
            v-for="track in props.tracks"
            :key="track.id"
            class="project-workbench__track-row-slot"
            role="listitem"
            :data-track-id="track.id"
          >
            <ProjectWorkbenchTrackRow
              :selected="workbenchSelection.selectedTrackId === track.id"
              :track="track"
              @select="selectTrack(track)"
            />
          </div>
        </div>
      </div>
    </aside>

    <section
      ref="arrangementViewportElement"
      class="project-workbench__arrangement-scroll-viewport"
      aria-label="Timeline"
      tabindex="0"
      @keydown.capture="handleTimelineKeydown"
      @pointerdown.capture="handleTimelinePointerDown"
      @scroll.passive="handleArrangementScroll"
      @wheel.passive="handleArrangementWheel"
    >
      <div class="project-workbench__arrangement-content">
        <div class="project-workbench__arrangement">
          <header class="project-workbench__ruler">
            <ol
              class="project-workbench__ruler-locate-surface"
              role="slider"
              aria-label="Timeline play position"
              aria-orientation="horizontal"
              :aria-valuemax="props.timelineEndTick"
              aria-valuemin="0"
              :aria-valuenow="rulerPositionTick"
              :aria-valuetext="`Project Tick ${rulerPositionTick}`"
              tabindex="0"
              title="Click or drag to locate. Arrow keys move by beat; Page keys move by bar."
              @keydown="handleRulerKeydown"
              @lostpointercapture="handleTimelineLocateCaptureLoss"
              @pointercancel="cancelTimelineLocate"
              @pointerdown="beginTimelineLocate"
              @pointermove="updateTimelineLocate"
              @pointerup="commitTimelineLocate"
            >
              <li
                v-for="bar in timelineBars"
                :key="bar.number"
                :style="bar.style"
                role="presentation"
              >
                {{ bar.number }}
              </li>
            </ol>
            <div class="project-workbench__arrangement-tools">
              <UiIconButton
                class="project-workbench__follow-control"
                :disabled="!isCurrentProjectPlaying"
                :icon="TargetArrowIcon"
                :label="timelineFollowLabel"
                :pressed="isTimelineFollowActive"
                size="small"
                @click="toggleTimelineFollow"
              />
              <UiIconButton
                disabled
                :icon="GridIcon"
                label="Grid settings — fixed bar grid is active"
                size="small"
              />
              <UiIconButton
                disabled
                :icon="ZoomOutIcon"
                label="Zoom out — timeline zoom is in development"
                size="small"
              />
              <UiIconButton
                disabled
                :icon="ZoomInIcon"
                label="Zoom in — timeline zoom is in development"
                size="small"
              />
            </div>
          </header>
          <div class="project-workbench__lane-heading" aria-hidden="true">
            <span>Track lanes</span>
          </div>
        </div>

        <div v-if="props.tracks.length === 0" class="project-workbench__surface-empty">
          <div class="project-workbench__surface-empty-message">
            <span><UiIcon :icon="GridIcon" :size="24" /></span>
            <strong>Arrangement</strong>
            <p>Add a Track to prepare the Arrangement surface.</p>
            <UiButton
              class="project-workbench__empty-midi-import"
              size="small"
              variant="secondary"
              :busy="props.isMidiImporting"
              @click="emit('importMidiAsNewTracks')"
            >
              <template #leading><UiIcon :icon="MidiIcon" :size="16" /></template>
              {{ props.isMidiImporting ? 'Importing MIDI…' : 'Import MIDI as new tracks' }}
            </UiButton>
          </div>
        </div>
        <div
          v-else
          class="project-workbench__arrangement-lane-list"
          role="list"
          aria-label="Arrangement lanes"
        >
          <div
            v-for="track in props.tracks"
            :key="track.id"
            class="project-workbench__arrangement-lane"
            :class="{
              'project-workbench__arrangement-lane--selected':
                workbenchSelection.selectedTrackId === track.id,
            }"
            :style="createTrackStyle(track)"
            role="listitem"
            :data-track-id="track.id"
          >
            <div class="project-workbench__lane-grid">
              <button
                v-for="bar in timelineBars"
                :key="bar.number"
                :style="bar.style"
                type="button"
                :aria-label="`Bar ${bar.number} on ${track.name}. Double-click or press Enter to add a MIDI clip.`"
                :aria-pressed="workbenchSelection.selectedTrackId === track.id"
                @click="selectTrack(track)"
                @dblclick="createEmptyMidiClip(track, bar.startTick)"
                @keydown.enter.prevent="createEmptyMidiClip(track, bar.startTick)"
              ></button>
            </div>
            <span class="project-workbench__lane-accent" aria-hidden="true"></span>
            <p v-if="clipsForTrack(track.id).length === 0">Double-click a bar to add a MIDI clip</p>
            <ProjectWorkbenchMidiClip
              v-for="clip in clipsForTrack(track.id)"
              :key="clip.id"
              :clip="clip"
              :selected="workbenchSelection.selectedClipId === clip.id"
              :timeline-span-tick="props.timelineEndTick"
              @open="emit('openMidiClip')"
              @select="selectClip(clip)"
            />
          </div>
          <div class="project-workbench__midi-import-lane" role="listitem">
            <div class="project-workbench__midi-import-lane-content">
              <UiButton
                size="small"
                variant="secondary"
                :busy="props.isMidiImporting"
                @click="emit('importMidiAsNewTracks')"
              >
                <template #leading><UiIcon :icon="MidiIcon" :size="16" /></template>
                {{ props.isMidiImporting ? 'Importing MIDI…' : 'Import MIDI as new tracks' }}
              </UiButton>
            </div>
          </div>
        </div>
        <ArrangementPlayhead
          :bar-span-tick="props.barSpanTick"
          :project-id="props.projectId"
          :timeline-end-tick="props.timelineEndTick"
        />
        <LocatePreview
          v-if="locatePreviewTick !== null"
          :bar-span-tick="props.barSpanTick"
          :position-tick="locatePreviewTick"
          :timeline-end-tick="props.timelineEndTick"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.project-workbench__arrangement-layout {
  --project-workbench-arrangement-tools-width: calc(
    var(--sd-control-height-sm) + var(--sd-control-height-sm) + var(--sd-control-height-sm) +
      var(--sd-control-height-sm) + var(--sd-space-0-5) + var(--sd-space-0-5) +
      var(--sd-space-0-5) + 2px
  );
  --project-workbench-timeline-marker-inline-size: 1px;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-row: 1;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
  overflow: hidden;
  background: var(--sd-color-surface-canvas);
}

.project-workbench__track-column {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-column: 1;
  grid-template-rows:
    calc(var(--project-workbench-ruler-height) + var(--project-workbench-track-actions-height))
    minmax(0, 1fr);
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-panel {
  display: grid;
  min-block-size: 0;
  grid-row: 1;
  grid-template-rows:
    var(--project-workbench-ruler-height)
    var(--project-workbench-track-actions-height);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading,
.project-workbench__ruler {
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--sd-space-3) var(--sd-space-1);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-actions {
  box-sizing: border-box;
  block-size: var(--project-workbench-track-actions-height);
  padding: var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-workbench__track-actions :deep(.ui-button) {
  inline-size: 100%;
}

.project-workbench__track-viewport {
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 2;
  overflow: hidden;
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-empty {
  display: grid;
  block-size: 100%;
  min-block-size: 0;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-5);
  color: var(--sd-color-text-muted);
  background: var(--sd-color-surface-panel);
  text-align: center;
}

.project-workbench__track-list {
  min-block-size: 100%;
  transform: translate3d(0, var(--project-workbench-track-scroll-offset, 0), 0);
  will-change: transform;
}

.project-workbench__track-row-slot {
  block-size: var(--project-workbench-track-row-height);
}

.project-workbench__track-row-slot :deep(.project-track-row) {
  block-size: 100%;
}

.project-workbench__track-empty > span,
.project-workbench__surface-empty-message > span {
  display: grid;
  inline-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  block-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  margin-bottom: var(--sd-space-3);
  place-items: center;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__track-empty strong,
.project-workbench__surface-empty-message strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-empty p,
.project-workbench__surface-empty-message p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__arrangement-scroll-viewport {
  container-type: size;
  min-inline-size: 0;
  min-block-size: 0;
  grid-column: 2;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.project-workbench__arrangement-scroll-viewport:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-workbench__arrangement-content {
  position: relative;
  display: grid;
  inline-size: var(--project-workbench-timeline-inline-size);
  min-block-size: 100%;
  grid-template-rows:
    calc(var(--project-workbench-ruler-height) + var(--project-workbench-track-actions-height))
    minmax(
      calc(
        100% - var(--project-workbench-ruler-height) - var(--project-workbench-track-actions-height)
      ),
      auto
    );
  background: var(--sd-color-surface-canvas);
}

.project-workbench__arrangement {
  position: sticky;
  z-index: var(--sd-layer-sticky);
  inset-block-start: 0;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 1;
  grid-template-rows:
    var(--project-workbench-ruler-height)
    var(--project-workbench-track-actions-height);
  background: var(--sd-color-surface-canvas);
}

.project-workbench__ruler {
  display: grid;
  min-inline-size: 0;
}

.project-workbench__ruler ol {
  z-index: 0;
  display: flex;
  block-size: 100%;
  min-inline-size: 0;
  grid-area: 1 / 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-workbench__ruler-locate-surface {
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
}

.project-workbench__ruler li {
  box-sizing: border-box;
  flex: 0 0 var(--project-workbench-bar-inline-size);
  padding: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-tools {
  position: sticky;
  z-index: 1;
  inset-inline-start: calc(
    100vw - var(--project-workbench-track-width) -
      var(--project-workbench-arrangement-tools-width) - var(--sd-space-2)
  );
  display: flex;
  align-self: start;
  justify-self: start;
  inline-size: var(--project-workbench-arrangement-tools-width);
  margin-block-start: var(--sd-space-0-5);
  grid-area: 1 / 1;
  gap: var(--sd-space-0-5);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  background: var(--sd-color-surface-panel);
}

.project-workbench__lane-heading {
  display: flex;
  align-items: center;
  border-block-end: 1px solid var(--sd-color-border-subtle);
  color: var(--sd-color-text-disabled);
  background: var(--sd-color-surface-panel);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__lane-heading span {
  position: sticky;
  inset-inline-start: var(--sd-space-3);
}

.project-workbench__arrangement-lane-list {
  min-inline-size: 0;
  min-block-size: 100%;
  grid-row: 2;
}

.project-workbench__midi-import-lane {
  display: flex;
  block-size: var(--project-workbench-track-row-height);
  align-items: center;
  border-block-end: 1px solid var(--sd-color-border-subtle);
  background: color-mix(in srgb, var(--sd-color-surface-panel) 54%, transparent);
}

.project-workbench__midi-import-lane-content {
  position: sticky;
  inset-inline-start: var(--sd-space-3);
  display: flex;
  inline-size: max-content;
  align-items: center;
  gap: var(--sd-space-3);
}

.project-workbench__arrangement-lane {
  position: relative;
  block-size: var(--project-workbench-track-row-height);
  inline-size: 100%;
  border-block-end: 1px solid var(--sd-color-border-subtle);
  background: color-mix(in srgb, var(--project-track-color) 3%, transparent);
  transition:
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    box-shadow var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.project-workbench__arrangement-lane:hover {
  background: color-mix(in srgb, var(--project-track-color) 7%, transparent);
}

.project-workbench__arrangement-lane--selected {
  background: color-mix(in srgb, var(--project-track-color) 11%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--project-track-color) 48%, transparent);
}

.project-workbench__lane-accent {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--sd-space-0-5);
  background: color-mix(in srgb, var(--project-track-color) 72%, transparent);
}

.project-workbench__lane-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.project-workbench__lane-grid button {
  box-sizing: border-box;
  flex: 0 0 var(--project-workbench-bar-inline-size);
  padding: 0;
  border: 0;
  border-inline-start: 1px solid var(--sd-color-border-subtle);
  color: inherit;
  background: transparent;
  cursor: crosshair;
}

.project-workbench__lane-grid button:hover {
  background: color-mix(in srgb, var(--project-track-color) 8%, transparent);
}

.project-workbench__lane-grid button:first-child {
  border-inline-start-color: var(--sd-color-border-default);
}

.project-workbench__lane-grid button:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-workbench__arrangement-lane p {
  position: absolute;
  inset: 50% auto auto var(--sd-space-4);
  margin: 0;
  color: var(--sd-color-text-disabled);
  font-size: var(--sd-font-size-xs);
  pointer-events: none;
  transform: translateY(-50%);
  white-space: nowrap;
}

.project-workbench__surface-empty {
  position: relative;
  min-inline-size: 0;
  min-block-size: 100%;
  grid-row: 2;
  color: var(--sd-color-text-muted);
  background:
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    var(--sd-color-surface-canvas);
  background-size: 5rem 100%;
  text-align: center;
}

.project-workbench__surface-empty-message {
  position: sticky;
  inset-inline-start: var(--sd-space-6);
  display: grid;
  inline-size: calc(
    100vw - var(--project-workbench-track-width) - var(--sd-space-6) - var(--sd-space-6)
  );
  block-size: 100%;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-6);
}

.project-workbench__empty-midi-import {
  margin-block-start: var(--sd-space-4);
}
</style>
