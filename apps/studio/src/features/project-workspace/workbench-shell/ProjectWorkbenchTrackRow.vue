<script setup lang="ts">
import KeyboardIcon from '~icons/fluent/keyboard-20-regular'
import MoreIcon from '~icons/fluent/more-horizontal-20-regular'
import { computed, type StyleValue } from 'vue'

import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'

const props = defineProps<{
  readonly selected: boolean
  readonly track: ProjectTrackPresentation
}>()
const emit = defineEmits<{
  select: []
}>()

const trackStyle = computed<StyleValue>(() => ({
  '--project-track-color': props.track.color ?? 'var(--sd-color-border-focus)',
}))
const trackKindLabel = computed(() => (props.track.kind === 'instrument' ? 'Instrument' : 'Audio'))
</script>

<template>
  <article
    class="project-track-row"
    :class="{ 'project-track-row--selected': props.selected }"
    :style="trackStyle"
  >
    <span class="project-track-row__color" aria-hidden="true"></span>
    <button
      class="project-track-row__select"
      type="button"
      :aria-label="`Select ${props.track.name}`"
      :aria-pressed="props.selected"
      @click="emit('select')"
    >
      <span class="project-track-row__icon" aria-hidden="true">
        <UiIcon :icon="KeyboardIcon" :size="20" />
      </span>
      <span class="project-track-row__identity">
        <strong>{{ props.track.name }}</strong>
        <span>{{ trackKindLabel }}</span>
      </span>
    </button>
    <span class="project-track-row__controls">
      <button type="button" disabled aria-label="Mute — not available">M</button>
      <button type="button" disabled aria-label="Solo — not available">S</button>
      <UiIconButton disabled :icon="MoreIcon" label="Track options — not available" size="small" />
    </span>
  </article>
</template>

<style scoped>
.project-track-row {
  position: relative;
  display: grid;
  min-inline-size: 0;
  min-block-size: var(--project-workbench-track-row-height);
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--sd-space-2);
  align-items: center;
  padding: var(--sd-space-3) var(--sd-space-2) var(--sd-space-3) var(--sd-space-3);
  border-block-end: 1px solid var(--sd-color-border-subtle);
  background: var(--sd-color-surface-panel);
  transition:
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    box-shadow var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.project-track-row:hover {
  background: var(--sd-color-surface-raised);
}

.project-track-row--selected {
  background: color-mix(in srgb, var(--project-track-color) 10%, var(--sd-color-surface-panel));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--project-track-color) 42%, transparent);
}

.project-track-row__color {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--sd-space-1);
  background: var(--project-track-color);
}

.project-track-row__icon {
  display: grid;
  inline-size: var(--sd-control-height-md);
  block-size: var(--sd-control-height-md);
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--project-track-color) 48%, transparent);
  border-radius: var(--sd-radius-md);
  color: var(--project-track-color);
  background: color-mix(in srgb, var(--project-track-color) 14%, var(--sd-color-surface-sunken));
}

.project-track-row__select {
  display: grid;
  min-inline-size: 0;
  grid-column: 1 / 3;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sd-space-2);
  align-items: center;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.project-track-row__select:focus-visible {
  border-radius: var(--sd-radius-sm);
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}

.project-track-row__identity {
  display: grid;
  gap: var(--sd-space-1);
  min-inline-size: 0;
}

.project-track-row__identity strong {
  overflow: hidden;
  font-size: var(--sd-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-track-row__identity span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-track-row__controls {
  display: flex;
  gap: var(--sd-space-0-5);
  align-items: center;
}

.project-track-row__controls > button {
  inline-size: var(--sd-control-height-sm);
  block-size: var(--sd-control-height-sm);
  padding: 0;
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-disabled);
  background: var(--sd-color-surface-raised);
  font-size: var(--sd-font-size-xs);
  font-weight: 700;
}
</style>
