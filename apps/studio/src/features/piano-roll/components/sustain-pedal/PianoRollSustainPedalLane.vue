<script setup lang="ts">
import { onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import type { PianoRollSustainPedalLaneProps } from '@/features/piano-roll/components/sustain-pedal/types/sustain-pedal-lane'
import { useSustainPedalViewport } from '@/features/piano-roll/components/sustain-pedal/hooks/use-sustain-pedal-viewport'
import { useSustainPedalSelection } from '@/features/piano-roll/components/sustain-pedal/hooks/use-sustain-pedal-selection'
import { useSustainPedalInteraction } from '@/features/piano-roll/components/sustain-pedal/hooks/use-sustain-pedal-interaction'
import { useSustainPedalProjection } from '@/features/piano-roll/components/sustain-pedal/hooks/use-sustain-pedal-projection'
import { useSustainPedalActions } from '@/features/piano-roll/components/sustain-pedal/hooks/use-sustain-pedal-actions'
import { useProjectMidiSustainPedal } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'

const props = defineProps<PianoRollSustainPedalLaneProps>()
const emit = defineEmits<{
  completed: []
  failure: [cause: unknown, committed?: boolean]
  requestFocus: []
}>()
const { projectMidiSustainPedal } = useProjectMidiSustainPedal()
const laneSurface = useTemplateRef<HTMLElement>('laneSurface')
const reportFailure = (cause: unknown, committed?: boolean) => {
  if (committed) emit('failure', cause, true)
  else emit('failure', cause)
}
const reportSuccess = () => emit('completed')
const requestFocus = () => emit('requestFocus')
const selection = useSustainPedalSelection({
  getReadModel: () => props.readModel,
  getClipContext: () => props.clipContext,
  reportFailure,
})
const layout = useSustainPedalViewport({
  surface: laneSurface,
  getVisibleStartTick: () => props.visibleStartTick,
  getVisibleSpanTick: () => props.visibleSpanTick,
  reportFailure,
})
const interaction = useSustainPedalInteraction({
  laneSurface,
  getSession: () => props.session,
  getReadModel: () => props.readModel,
  getViewport: () => layout.viewport.value,
  getGrid: () => props.grid,
  isSnapEnabled: () => props.snapEnabled,
  isPencilEnabled: () => props.pencilEnabled,
  getSelectedEventIds: () => selection.selectedEventIds.value,
  setSelectedEventIds: selection.setSelectedEventIds,
  resolveEditingScope: selection.resolveEditingScope,
  projectMidiSustainPedal,
  reportFailure,
  reportSuccess,
  requestFocus,
})
const { interactionState } = interaction
const { thresholdStyle, occurrenceWindows, renderedSegments, renderedEvents, accessibleSummary } =
  useSustainPedalProjection({
    getReadModel: () => props.readModel,
    getVisibleStartTick: () => props.visibleStartTick,
    getVisibleSpanTick: () => props.visibleSpanTick,
    getViewport: () => layout.viewport.value,
    getSelectedEventIds: () => selection.selectedEventIds.value,
    getPreview: () => interactionState.value.preview,
  })
const actions = useSustainPedalActions({
  laneSurface,
  getSelectedEventIds: () => selection.selectedEventIds.value,
  setSelectedEventIds: selection.setSelectedEventIds,
  resolveEditingScope: selection.resolveEditingScope,
  hasCancellableInteraction: interaction.hasCancellableInteraction,
  cancelInteraction: interaction.cancelInteraction,
  projectMidiSustainPedal,
  reportFailure,
  reportSuccess,
  requestFocus,
})
defineExpose(actions)

// Coordinate invalidation before projection; only this owner orders cross-hook side effects.
watch(
  [() => props.visibleStartTick, () => props.visibleSpanTick],
  () => {
    interaction.invalidate()
    layout.refresh()
  },
  { flush: 'sync' },
)
watch(layout.viewport, interaction.invalidate, { flush: 'sync' })
watch(
  [
    () => props.session,
    () => props.readModel.projectId,
    () => props.readModel.channel,
    () => ('clipId' in props.readModel ? props.readModel.clipId : props.readModel.trackId),
    () =>
      'activeClipId' in props.readModel ? props.readModel.activeClipId : props.readModel.clipId,
    () => props.clipContext?.clipId ?? null,
    () => props.clipContext?.sourceId ?? null,
  ],
  () => {
    interaction.invalidate()
    selection.setSelectedEventIds([])
  },
  { flush: 'sync' },
)
watch(
  () => props.readModel.modelRevision,
  (revision) => {
    interaction.notifyAuthorityRevision(revision)
    selection.reconcileSelection()
  },
  { flush: 'post' },
)

function dispose(): void {
  layout.dispose()
  interaction.dispose()
}
onMounted(() => {
  try {
    interaction.mount()
    layout.mount()
  } catch (cause) {
    dispose()
    reportFailure(cause)
  }
})
onBeforeUnmount(dispose)
</script>

<template>
  <div
    ref="laneSurface"
    class="piano-roll-sustain-pedal-lane"
    :class="{ 'piano-roll-sustain-pedal-lane--pencil': props.pencilEnabled }"
    :aria-label="props.label"
    :data-interaction-status="interactionState.status"
    role="group"
    tabindex="0"
    @focusin="emit('requestFocus')"
  >
    <span
      v-if="thresholdStyle"
      class="piano-roll-sustain-pedal-lane__threshold"
      :style="thresholdStyle"
      aria-hidden="true"
    ></span>
    <span
      v-for="occurrence in occurrenceWindows"
      :key="`${occurrence.key}:window`"
      class="piano-roll-sustain-pedal-lane__occurrence"
      :class="{
        'piano-roll-sustain-pedal-lane__occurrence--active': occurrence.active,
        'piano-roll-sustain-pedal-lane__occurrence--unsupported': occurrence.unsupported,
      }"
      :style="occurrence.style"
      aria-hidden="true"
    ></span>
    <span
      v-for="segment in renderedSegments"
      :key="segment.key"
      class="piano-roll-sustain-pedal-lane__segment"
      :class="{
        'piano-roll-sustain-pedal-lane__segment--down': segment.pedalDown,
        'piano-roll-sustain-pedal-lane__segment--inactive': !segment.active,
      }"
      :style="segment.style"
      aria-hidden="true"
    ></span>
    <button
      v-for="event in renderedEvents"
      :key="event.key"
      type="button"
      class="piano-roll-sustain-pedal-lane__event"
      :class="{
        'piano-roll-sustain-pedal-lane__event--down': event.pedalDown,
        'piano-roll-sustain-pedal-lane__event--inactive': !event.active,
        'piano-roll-sustain-pedal-lane__event--preview': event.preview,
        'piano-roll-sustain-pedal-lane__event--selected': event.selected,
        'piano-roll-sustain-pedal-lane__event--terminal': !event.affectsPlayback,
      }"
      :data-piano-roll-sustain-pedal-event-id="event.event.id"
      :data-piano-roll-clip-id="event.clipId"
      :style="event.style"
      :aria-label="`Sustain Pedal value ${event.value} at tick ${event.timelineTick}${
        event.affectsPlayback ? '' : ', terminal endpoint'
      }${event.selected ? ', selected' : ''}`"
      :aria-pressed="event.selected"
    ></button>
    <span class="piano-roll-sustain-pedal-lane__accessible-status" aria-live="polite">
      {{ accessibleSummary }}
    </span>
  </div>
</template>

<style scoped>
.piano-roll-sustain-pedal-lane {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  border-block-start: 1px solid var(--sd-color-border-default);
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--sd-color-surface-panel) 54%, transparent),
      transparent
    ),
    var(--sd-color-surface-canvas);
}

.piano-roll-sustain-pedal-lane--pencil {
  cursor: crosshair;
}

.piano-roll-sustain-pedal-lane:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.piano-roll-sustain-pedal-lane__threshold {
  position: absolute;
  z-index: 1;
  inset-inline: 0;
  block-size: 1px;
  pointer-events: none;
  border-block-start: 1px dashed var(--sd-color-border-strong);
  opacity: 0.72;
}

.piano-roll-sustain-pedal-lane__occurrence {
  position: absolute;
  z-index: 0;
  inset-block: 0;
  inset-inline-start: 0;
  box-sizing: border-box;
  pointer-events: none;
  border-inline: 1px solid color-mix(in srgb, var(--sd-color-border-focus) 36%, transparent);
  background: color-mix(in srgb, var(--sd-color-border-focus) 4%, transparent);
  opacity: 0.4;
}

.piano-roll-sustain-pedal-lane__occurrence--active {
  background: color-mix(in srgb, var(--sd-color-border-focus) 9%, transparent);
  opacity: 1;
}

.piano-roll-sustain-pedal-lane__occurrence--unsupported {
  border-inline-style: dashed;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 4px,
    color-mix(in srgb, var(--sd-color-border-strong) 12%, transparent) 4px,
    color-mix(in srgb, var(--sd-color-border-strong) 12%, transparent) 8px
  );
}

.piano-roll-sustain-pedal-lane__segment {
  position: absolute;
  z-index: 2;
  inset-block-start: 0;
  inset-inline-start: 0;
  box-sizing: border-box;
  min-block-size: 1px;
  pointer-events: none;
  border-block-start: 2px solid var(--sd-color-text-muted);
  background: color-mix(in srgb, var(--sd-color-text-muted) 12%, transparent);
  opacity: 0.76;
}

.piano-roll-sustain-pedal-lane__segment--down {
  border-block-start-color: var(--sd-color-border-focus);
  background: color-mix(in srgb, var(--sd-color-border-focus) 22%, transparent);
  opacity: 1;
}

.piano-roll-sustain-pedal-lane__segment--inactive {
  opacity: 0.42;
}

.piano-roll-sustain-pedal-lane__event {
  position: absolute;
  z-index: 3;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: 0.625rem;
  block-size: 0.625rem;
  padding: 0;
  border: 2px solid var(--sd-color-surface-canvas);
  border-radius: 50%;
  background: var(--sd-color-text-muted);
  box-shadow: 0 0 0 1px var(--sd-color-text-muted);
  transform-origin: center;
  translate: -50% -50%;
}

.piano-roll-sustain-pedal-lane__event--down {
  background: var(--sd-color-border-focus);
  box-shadow: 0 0 0 1px var(--sd-color-border-focus);
}

.piano-roll-sustain-pedal-lane__event--inactive {
  opacity: 0.54;
}

.piano-roll-sustain-pedal-lane__event--preview {
  z-index: 4;
}

.piano-roll-sustain-pedal-lane__event--selected {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}

.piano-roll-sustain-pedal-lane__event--terminal {
  border-radius: 0;
  rotate: 45deg;
  background: transparent;
}

.piano-roll-sustain-pedal-lane__accessible-status {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
