<script setup lang="ts">
import {
  parseTick,
  type TempoBpm,
  type TempoEventId,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import { computed, onMounted, onUnmounted, shallowRef, type StyleValue, watch } from 'vue'

import { formatProjectTempoBpm } from '@/features/project-workspace/tempo/tempo-control'
import {
  type TempoTrackEventPreview,
  useTempoTrackInteraction,
} from '@/features/project-workspace/tempo-track/interaction'
import {
  createInitialProjectTempoTrackScale,
  expandProjectTempoTrackScale,
  orderProjectTempoEvents,
  projectTempoTrackBpmPositionRatio,
  resolveDraggedProjectTempoBpm,
  resolveNearestProjectTempoTrackEvent,
  resolveProjectTempoTrackBpm,
  resolveProjectTempoTrackDragAxis,
  resolveProjectTempoTrackTick,
  type ProjectTempoTrackDragAxis,
  type ProjectTempoTrackScale,
} from '@/features/project-workspace/tempo-track/tempo-track'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'

interface TempoTrackAddIntent {
  readonly bpm: TempoBpm
  readonly tick: Tick
}

interface ActiveTempoPointGesture {
  readonly axis: ProjectTempoTrackDragAxis | null
  readonly grabOffsetTick: number
  readonly laneBounds: DOMRect
  readonly pointerId: number
  readonly scale: ProjectTempoTrackScale
  readonly startBpm: TempoBpm
  readonly startClientX: number
  readonly startClientY: number
  readonly startTick: Tick
  readonly surface: HTMLElement
  readonly tempoEventId: TempoEventId
}

const props = defineProps<{
  readonly barSpanTick: Tick
  readonly editingDisabled: boolean
  readonly projectId: string
  readonly selectedTempoEventId: TempoEventId | null
  readonly tempoEvents: readonly TempoEventRecord[]
  readonly timelineEndTick: Tick
}>()
const emit = defineEmits<{
  add: [intent: TempoTrackAddIntent]
  bpmChange: [tempoEventId: TempoEventId, bpm: TempoBpm]
  editStart: []
  move: [tempoEventId: TempoEventId, tick: Tick]
  remove: [tempoEventId: TempoEventId]
  select: [tempoEventId: TempoEventId]
}>()

const plotElement = shallowRef<HTMLElement | null>(null)
// A captured gesture mutates only this preview. Axis lock happens once, and Pointer Up emits one
// semantic intent for the Page-owned command coordinator; cancellation discards the preview.
const activeGesture = shallowRef<ActiveTempoPointGesture | null>(null)
const tempoTrackInteraction = useTempoTrackInteraction()
const tempoScale = shallowRef<ProjectTempoTrackScale>(
  createInitialProjectTempoTrackScale(props.tempoEvents),
)
const renderedEvents = computed(() => {
  const preview = tempoTrackInteraction.preview.value
  return orderProjectTempoEvents(
    preview === null
      ? props.tempoEvents
      : props.tempoEvents.map((tempoEvent) =>
          tempoEvent.id === preview.tempoEventId
            ? Object.freeze({ ...tempoEvent, bpm: preview.bpm, tick: preview.tick })
            : tempoEvent,
        ),
  )
})

function formatPositionPercentage(ratio: number): string {
  return `${Number((ratio * 100).toFixed(6))}%`
}

function eventStyle(tempoEvent: TempoEventRecord): StyleValue {
  const inlineOffsetRem =
    (tempoEvent.tick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
  const blockRatio = projectTempoTrackBpmPositionRatio(tempoEvent.bpm, tempoScale.value)
  return {
    insetBlockStart: formatPositionPercentage(blockRatio),
    transform: `translate3d(calc(${inlineOffsetRem}rem - 50%), -50%, 0)`,
  }
}

function segmentStyle(tempoEvent: TempoEventRecord, eventIndex: number): StyleValue {
  const nextEvent = renderedEvents.value[eventIndex + 1]
  const startTick = Math.min(props.timelineEndTick, tempoEvent.tick)
  const endTick = Math.min(props.timelineEndTick, nextEvent?.tick ?? props.timelineEndTick)
  return {
    inlineSize: `${
      (Math.max(0, endTick - startTick) / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
    }rem`,
    insetBlockStart: formatPositionPercentage(
      projectTempoTrackBpmPositionRatio(tempoEvent.bpm, tempoScale.value),
    ),
    transform: `translate3d(${(startTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM}rem, -50%, 0)`,
  }
}

function transitionStyle(tempoEvent: TempoEventRecord, eventIndex: number): StyleValue {
  const previousEvent = renderedEvents.value[eventIndex - 1]
  if (previousEvent === undefined) return { display: 'none' }

  const previousRatio = projectTempoTrackBpmPositionRatio(previousEvent.bpm, tempoScale.value)
  const currentRatio = projectTempoTrackBpmPositionRatio(tempoEvent.bpm, tempoScale.value)
  return {
    blockSize: formatPositionPercentage(Math.abs(currentRatio - previousRatio)),
    insetBlockStart: formatPositionPercentage(Math.min(previousRatio, currentRatio)),
    transform: `translate3d(${(tempoEvent.tick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM}rem, 0, 0)`,
  }
}

function pointLabel(tempoEvent: TempoEventRecord): string {
  const initial =
    tempoEvent.tick === 0 ? ' Initial point; Position cannot be moved or removed.' : ''
  return `Tempo ${formatProjectTempoBpm(tempoEvent.bpm)} BPM at Project Tick ${tempoEvent.tick}.${initial}`
}

function tickAtClientX(clientX: number, bounds: DOMRect): Tick {
  return resolveProjectTempoTrackTick({
    clientX,
    laneLeft: bounds.left,
    laneWidth: bounds.width,
    timelineEndTick: props.timelineEndTick,
  })
}

function tempoEventAtClientPosition(
  clientX: number,
  clientY: number,
  bounds: DOMRect,
): TempoEventRecord | null {
  return resolveNearestProjectTempoTrackEvent({
    clientX,
    clientY,
    laneHeight: bounds.height,
    laneLeft: bounds.left,
    laneTop: bounds.top,
    laneWidth: bounds.width,
    scale: tempoScale.value,
    tempoEvents: renderedEvents.value,
    timelineEndTick: props.timelineEndTick,
  })
}

function selectNearestTempoEvent(event: MouseEvent): void {
  if (event.button !== 0) return
  const plot = plotElement.value
  if (plot === null) return
  const tempoEvent = tempoEventAtClientPosition(
    event.clientX,
    event.clientY,
    plot.getBoundingClientRect(),
  )
  if (tempoEvent === null) return

  emit('select', tempoEvent.id)
  event.preventDefault()
}

function addTempoEvent(event: MouseEvent): void {
  if (props.editingDisabled || event.button !== 0) return
  const target = event.target
  if (target instanceof Element && target.closest('.tempo-track-lane__point') !== null) return
  const plot = plotElement.value
  if (plot === null) return
  const bounds = plot.getBoundingClientRect()
  const existingTempoEvent = tempoEventAtClientPosition(event.clientX, event.clientY, bounds)
  if (existingTempoEvent !== null) {
    emit('select', existingTempoEvent.id)
    event.preventDefault()
    return
  }
  emit('add', {
    bpm: resolveProjectTempoTrackBpm({
      clientY: event.clientY,
      laneHeight: bounds.height,
      laneTop: bounds.top,
      scale: tempoScale.value,
    }),
    tick: tickAtClientX(event.clientX, bounds),
  })
  event.preventDefault()
}

function beginPointGesture(tempoEvent: TempoEventRecord, event: PointerEvent): void {
  if (activeGesture.value !== null || event.isPrimary === false || event.button !== 0) return
  const plot = plotElement.value
  const laneBounds = plot?.getBoundingClientRect()
  const targetTempoEvent =
    laneBounds === undefined
      ? tempoEvent
      : (tempoEventAtClientPosition(event.clientX, event.clientY, laneBounds) ?? tempoEvent)
  emit('select', targetTempoEvent.id)
  if (props.editingDisabled || plot === null || laneBounds === undefined) return
  const surface = event.currentTarget as HTMLElement
  if (
    !tempoTrackInteraction.beginPreview({
      bpm: targetTempoEvent.bpm,
      owner: 'lane-drag',
      tempoEventId: targetTempoEvent.id,
      tick: targetTempoEvent.tick,
    })
  ) {
    return
  }
  activeGesture.value = {
    axis: null,
    grabOffsetTick: tickAtClientX(event.clientX, laneBounds) - targetTempoEvent.tick,
    laneBounds,
    pointerId: event.pointerId,
    scale: tempoScale.value,
    startBpm: targetTempoEvent.bpm,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startTick: targetTempoEvent.tick,
    surface,
    tempoEventId: targetTempoEvent.id,
  }
  surface.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function handlePointClick(tempoEvent: TempoEventRecord, event: MouseEvent): void {
  // Pointer selection happens on Pointer Down so dense overlaps can use geometric hit testing.
  // A keyboard-synthesized click has detail 0 and still needs the point's direct selection path.
  if (event.detail === 0) emit('select', tempoEvent.id)
}

function updatePointGesture(event: PointerEvent): void {
  const gesture = activeGesture.value
  if (gesture === null || gesture.pointerId !== event.pointerId) return
  let axis = gesture.axis
  if (axis === null) {
    axis = resolveProjectTempoTrackDragAxis(
      event.clientX - gesture.startClientX,
      event.clientY - gesture.startClientY,
      gesture.startTick !== 0,
    )
    if (axis === null) return
    activeGesture.value = { ...gesture, axis }
    if (axis !== 'blocked-tick') emit('editStart')
  }

  if (axis === 'tick') {
    const targetTick = tickAtClientX(event.clientX, gesture.laneBounds) - gesture.grabOffsetTick
    tempoTrackInteraction.updatePreview({
      bpm: gesture.startBpm,
      owner: 'lane-drag',
      tempoEventId: gesture.tempoEventId,
      tick: parseTick(Math.min(props.timelineEndTick, Math.max(0, targetTick))),
    })
  } else if (axis === 'bpm') {
    tempoTrackInteraction.updatePreview({
      bpm: resolveDraggedProjectTempoBpm({
        currentClientY: event.clientY,
        laneHeight: gesture.laneBounds.height,
        scale: gesture.scale,
        startBpm: gesture.startBpm,
        startClientY: gesture.startClientY,
      }),
      owner: 'lane-drag',
      tempoEventId: gesture.tempoEventId,
      tick: gesture.startTick,
    })
  }
  event.preventDefault()
}

function releasePointGesture(pointerId: number): {
  readonly gesture: ActiveTempoPointGesture
  readonly preview: TempoTrackEventPreview
} | null {
  const gesture = activeGesture.value
  if (gesture === null || gesture.pointerId !== pointerId) return null
  const preview = tempoTrackInteraction.finishPreview('lane-drag', gesture.tempoEventId)
  activeGesture.value = null
  if (gesture.surface.hasPointerCapture?.(pointerId))
    gesture.surface.releasePointerCapture(pointerId)
  if (preview === null) return null
  return { gesture, preview }
}

function commitPointGesture(event: PointerEvent): void {
  const released = releasePointGesture(event.pointerId)
  if (released === null) return
  const { gesture, preview } = released
  if (gesture.axis === 'tick' && preview.tick !== gesture.startTick) {
    emit('move', gesture.tempoEventId, preview.tick)
  } else if (gesture.axis === 'bpm' && preview.bpm !== gesture.startBpm) {
    emit('bpmChange', gesture.tempoEventId, preview.bpm)
  }
  event.preventDefault()
}

function cancelPointGesture(event?: PointerEvent): void {
  const gesture = activeGesture.value
  if (gesture === null || (event !== undefined && gesture.pointerId !== event.pointerId)) return
  activeGesture.value = null
  tempoTrackInteraction.cancelPreview('lane-drag', gesture.tempoEventId)
  if (gesture.surface.hasPointerCapture?.(gesture.pointerId))
    gesture.surface.releasePointerCapture(gesture.pointerId)
  event?.preventDefault()
}

function handlePointKeydown(tempoEvent: TempoEventRecord, event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeGesture.value !== null) {
    cancelPointGesture()
    event.preventDefault()
    return
  }
  if (
    (event.key !== 'Delete' && event.key !== 'Backspace') ||
    props.editingDisabled ||
    tempoEvent.id !== props.selectedTempoEventId ||
    tempoEvent.tick === 0
  ) {
    return
  }
  emit('remove', tempoEvent.id)
  event.preventDefault()
  event.stopPropagation()
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || activeGesture.value === null) return
  cancelPointGesture()
  event.preventDefault()
}

function handleWindowBlur(): void {
  cancelPointGesture()
}

watch(
  [() => props.projectId, () => props.tempoEvents],
  ([projectId, tempoEvents], [previousProjectId, previousTempoEvents]) => {
    if (
      activeGesture.value !== null &&
      (projectId !== previousProjectId || tempoEvents !== previousTempoEvents)
    ) {
      cancelPointGesture()
    }
    if (projectId !== previousProjectId) {
      tempoScale.value = createInitialProjectTempoTrackScale(tempoEvents)
      return
    }

    tempoScale.value = expandProjectTempoTrackScale(tempoScale.value, tempoEvents)
  },
)

watch(
  () => props.selectedTempoEventId,
  (selectedTempoEventId) => {
    if (activeGesture.value !== null && activeGesture.value.tempoEventId !== selectedTempoEventId) {
      cancelPointGesture()
    }
  },
)

watch(
  () => props.tempoEvents.some(({ id }) => id === activeGesture.value?.tempoEventId),
  (stillExists) => {
    if (!stillExists) cancelPointGesture()
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('blur', handleWindowBlur)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('blur', handleWindowBlur)
  cancelPointGesture()
})
</script>

<template>
  <section
    class="tempo-track-lane"
    :class="{ 'tempo-track-lane--disabled': props.editingDisabled }"
    aria-label="Project Tempo Track"
    title="Double-click empty space to add a Tempo Event"
  >
    <div
      ref="plotElement"
      class="tempo-track-lane__plot"
      @click="selectNearestTempoEvent"
      @dblclick="addTempoEvent"
    >
      <span class="tempo-track-lane__scale-layer" aria-hidden="true">
        <span class="tempo-track-lane__scale tempo-track-lane__scale--maximum">
          {{ tempoScale.maximumBpm }}
        </span>
        <span class="tempo-track-lane__scale tempo-track-lane__scale--minimum">
          {{ tempoScale.minimumBpm }}
        </span>
      </span>
      <span
        v-for="(tempoEvent, eventIndex) in renderedEvents"
        :key="`segment-${tempoEvent.id}`"
        class="tempo-track-lane__segment"
        :class="{
          'tempo-track-lane__segment--selected': props.selectedTempoEventId === tempoEvent.id,
        }"
        :style="segmentStyle(tempoEvent, eventIndex)"
        aria-hidden="true"
        :title="pointLabel(tempoEvent)"
        @click.stop="emit('select', tempoEvent.id)"
        @dblclick.stop
      ></span>
      <span
        v-for="(tempoEvent, transitionIndex) in renderedEvents.slice(1)"
        :key="`transition-${tempoEvent.id}`"
        class="tempo-track-lane__transition"
        :class="{
          'tempo-track-lane__transition--selected': props.selectedTempoEventId === tempoEvent.id,
        }"
        :style="transitionStyle(tempoEvent, transitionIndex + 1)"
        aria-hidden="true"
        :title="pointLabel(tempoEvent)"
        @click.stop="emit('select', tempoEvent.id)"
        @dblclick.stop
      ></span>
      <button
        v-for="tempoEvent in renderedEvents"
        :key="tempoEvent.id"
        class="tempo-track-lane__point"
        :class="{
          'tempo-track-lane__point--active': activeGesture?.tempoEventId === tempoEvent.id,
          'tempo-track-lane__point--initial': tempoEvent.tick === 0,
          'tempo-track-lane__point--selected': props.selectedTempoEventId === tempoEvent.id,
        }"
        :style="eventStyle(tempoEvent)"
        type="button"
        :aria-label="pointLabel(tempoEvent)"
        :aria-pressed="props.selectedTempoEventId === tempoEvent.id"
        :title="pointLabel(tempoEvent)"
        @click.stop="handlePointClick(tempoEvent, $event)"
        @dblclick.stop
        @keydown="handlePointKeydown(tempoEvent, $event)"
        @lostpointercapture="cancelPointGesture"
        @pointercancel="cancelPointGesture"
        @pointerdown.stop="beginPointGesture(tempoEvent, $event)"
        @pointermove.stop="updatePointGesture"
        @pointerup.stop="commitPointGesture"
      ></button>
    </div>
  </section>
</template>

<style scoped>
.tempo-track-lane {
  position: relative;
  box-sizing: border-box;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  border-block-end: 1px solid var(--sd-color-border-default);
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(25% - 1px),
      var(--sd-color-border-subtle) 25%
    ),
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    color-mix(in srgb, var(--sd-color-surface-canvas) 84%, var(--sd-color-border-focus));
  background-size:
    100% 100%,
    5rem 100%,
    100% 100%;
  cursor: crosshair;
}

.tempo-track-lane--disabled {
  cursor: not-allowed;
}

.tempo-track-lane__plot {
  position: absolute;
  inset: var(--sd-space-3) 0;
}

.tempo-track-lane__scale-layer {
  position: sticky;
  z-index: 1;
  inset-inline-start: var(--sd-space-2);
  display: block;
  inline-size: 2.5rem;
  block-size: 100%;
  pointer-events: none;
}

.tempo-track-lane__scale {
  position: absolute;
  color: var(--sd-color-text-disabled);
  font-family: var(--sd-font-family-numeric);
  font-size: 0.625rem;
}

.tempo-track-lane__scale--maximum {
  inset-block-start: calc(-1 * var(--sd-space-2));
}

.tempo-track-lane__scale--minimum {
  inset-block-end: calc(-1 * var(--sd-space-2));
}

.tempo-track-lane__segment {
  position: absolute;
  z-index: 0;
  inset-inline-start: 0;
  block-size: 1px;
  background: color-mix(in srgb, var(--sd-color-border-focus) 72%, transparent);
  cursor: pointer;
  transform-origin: left center;
}

.tempo-track-lane__segment::after {
  position: absolute;
  inset: -0.375rem 0;
  content: '';
}

.tempo-track-lane__transition {
  position: absolute;
  z-index: 1;
  inset-inline-start: 0;
  inline-size: 1px;
  background: color-mix(in srgb, var(--sd-color-border-focus) 38%, transparent);
  cursor: pointer;
  transform-origin: left top;
}

.tempo-track-lane__transition::after {
  position: absolute;
  inset: 0 -0.375rem;
  content: '';
}

.tempo-track-lane__segment--selected {
  z-index: 2;
  background: var(--sd-color-text-primary);
}

.tempo-track-lane__segment--selected {
  block-size: 2px;
}

.tempo-track-lane__transition--selected {
  z-index: 2;
  background: color-mix(in srgb, var(--sd-color-text-primary) 64%, transparent);
}

.tempo-track-lane__point {
  position: absolute;
  z-index: 2;
  inset-inline-start: 0;
  inline-size: 0.75rem;
  block-size: 0.75rem;
  appearance: none;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: move;
  touch-action: none;
  transform-origin: center;
  will-change: transform;
}

.tempo-track-lane__point::before {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  box-sizing: border-box;
  inline-size: 0.4375rem;
  block-size: 0.4375rem;
  border: 1px solid var(--sd-color-surface-canvas);
  border-radius: 1px;
  background: var(--sd-color-border-focus);
  content: '';
  transform: translate(-50%, -50%) rotate(45deg);
  transition:
    box-shadow var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    transform var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.tempo-track-lane__point::after {
  position: absolute;
  inset: -0.45rem;
  content: '';
}

.tempo-track-lane__point--initial {
  cursor: ns-resize;
}

.tempo-track-lane__point:hover::before,
.tempo-track-lane__point:focus-visible::before {
  transform: translate(-50%, -50%) rotate(45deg) scale(1.18);
}

.tempo-track-lane__point--selected {
  z-index: 3;
}

.tempo-track-lane__point--selected::before {
  background: var(--sd-color-text-primary);
  box-shadow: 0 0 0 2px var(--sd-color-border-focus);
  transform: translate(-50%, -50%) rotate(45deg) scale(1.18);
}

.tempo-track-lane__point--active {
  z-index: 4;
  transition: none;
}

.tempo-track-lane__point:focus-visible {
  outline: 2px solid var(--sd-color-text-primary);
  outline-offset: 3px;
}

.tempo-track-lane--disabled .tempo-track-lane__point {
  cursor: default;
}
</style>
