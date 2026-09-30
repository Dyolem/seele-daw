<script setup lang="ts">
import { useTempoTrackDrag } from '@/features/project-workspace/tempo-track/hooks/use-tempo-track-drag'
import type { ProjectTempoTrackScale } from '@/features/project-workspace/tempo-track/types/tempo-track'
import {
  type TempoBpm,
  type TempoEventId,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import { computed, onMounted, onBeforeUnmount, shallowRef, type StyleValue, watch } from 'vue'

import { useStudioEditorSelectionTarget } from '@/workbench/actions/vue/studio-editor-action-context'
import { STUDIO_ACTION_NOT_APPLIED } from '@/workbench/actions/studio-action'
import { useTempoEventActions } from '@/features/project-workspace/tempo-track/tempo-event-action-context'

import { formatProjectTempoBpm } from '@/features/project-workspace/tempo/tempo-control'
import { useTempoTrackPreview } from '@/features/project-workspace/tempo-track/tempo-track-preview'
import {
  createInitialProjectTempoTrackScale,
  expandProjectTempoTrackScale,
  orderProjectTempoEvents,
  projectTempoTrackBpmPositionRatio,
  resolveNearestProjectTempoTrackEvent,
  resolveProjectTempoTrackBpm,
  resolveProjectTempoTrackTick,
} from '@/features/project-workspace/tempo-track/tempo-track'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'

interface TempoTrackAddIntent {
  readonly bpm: TempoBpm
  readonly tick: Tick
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
  editStart: []
  select: [tempoEventId: TempoEventId]
}>()

const plotElement = shallowRef<HTMLElement | null>(null)
const tempoPreview = useTempoTrackPreview()
const tempoScale = shallowRef<ProjectTempoTrackScale>(
  createInitialProjectTempoTrackScale(props.tempoEvents),
)
const renderedEvents = computed(() => {
  const preview = tempoPreview.preview.value
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

function handlePointClick(tempoEvent: TempoEventRecord, event: MouseEvent): void {
  // Pointer selection uses geometric hit testing; keyboard clicks select the focused point.
  if (event.detail === 0) emit('select', tempoEvent.id)
}

const drag = useTempoTrackDrag({
  props,
  plotElement,
  tempoScale,
  projection: tempoPreview,
  hitTest: (event, bounds) => {
    const nearest = tempoEventAtClientPosition(event.clientX, event.clientY, bounds)
    if (nearest !== null) return nearest
    const point =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.tempo-track-lane__point')
        : null
    return props.tempoEvents.find(({ id }) => id === point?.dataset.tempoEventId) ?? null
  },
  select: (id) => emit('select', id),
  editStart: () => emit('editStart'),
})
const dragState = drag.state

const tempoActions = useTempoEventActions()
const focusedPoint = shallowRef<{ id: TempoEventId; element: HTMLElement } | null>(null)
const selectedPoint = computed(() =>
  props.tempoEvents.find(
    (event) => event.id === focusedPoint.value?.id && event.id === props.selectedTempoEventId,
  ),
)
const selectionTarget = useStudioEditorSelectionTarget(
  {
    isFocused: () => focusedPoint.value?.element === document.activeElement,
    hasSelection: () => selectedPoint.value !== undefined,
    selectionLabel: () => 'Tempo Event',
    deleteDisabledReason: () => {
      if (props.editingDisabled) return 'Tempo editing is unavailable during playback loading.'
      return selectedPoint.value?.tick === 0 ? 'The initial Tempo Event cannot be removed.' : null
    },
    deleteSelection: () =>
      selectedPoint.value
        ? tempoActions.removeTempoEvent(selectedPoint.value.id)
        : STUDIO_ACTION_NOT_APPLIED,
  },
  [() => props.projectId, () => focusedPoint.value?.id, () => props.selectedTempoEventId],
)
function focusPoint(tempoEvent: TempoEventRecord, event: FocusEvent): void {
  if (!(event.currentTarget instanceof HTMLElement)) return
  focusedPoint.value = { id: tempoEvent.id, element: event.currentTarget }
  selectionTarget.activate()
}

watch(
  [() => props.projectId, () => props.tempoEvents],
  ([projectId, events], [previousProjectId]) => {
    tempoScale.value =
      projectId === previousProjectId
        ? expandProjectTempoTrackScale(tempoScale.value, events)
        : createInitialProjectTempoTrackScale(events)
  },
  { flush: 'sync' },
)

onMounted(drag.mount)
onBeforeUnmount(drag.dispose)
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
        :data-tempo-event-id="tempoEvent.id"
        class="tempo-track-lane__point"
        :class="{
          'tempo-track-lane__point--active': dragState.preview?.tempoEventId === tempoEvent.id,
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
        @focus="focusPoint(tempoEvent, $event)"
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
