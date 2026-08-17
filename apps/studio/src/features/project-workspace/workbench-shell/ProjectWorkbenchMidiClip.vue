<script setup lang="ts">
import { computed, type StyleValue } from 'vue'

import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'

const props = defineProps<{
  readonly clip: ProjectMidiClipPresentation
  readonly selected: boolean
  readonly timelineSpanTick: number
}>()
const emit = defineEmits<{
  open: []
  select: []
}>()

const clipStyle = computed<StyleValue>(() => {
  const clipEndTick = props.clip.startTick + props.clip.spanTick
  const visibleStartTick = Math.max(0, props.clip.startTick)
  const visibleEndTick = Math.min(props.timelineSpanTick, clipEndTick)

  if (visibleEndTick <= visibleStartTick) return { display: 'none' }

  return {
    '--project-clip-color': props.clip.color ?? 'var(--sd-color-border-focus)',
    '--project-clip-offset': `${(visibleStartTick / props.timelineSpanTick) * 100}%`,
    '--project-clip-width': `${((visibleEndTick - visibleStartTick) / props.timelineSpanTick) * 100}%`,
  }
})

function openClip(): void {
  emit('select')
  emit('open')
}
</script>

<template>
  <button
    class="project-midi-clip"
    :class="{
      'project-midi-clip--muted': props.clip.muted,
      'project-midi-clip--selected': props.selected,
    }"
    :style="clipStyle"
    type="button"
    :aria-label="`${props.clip.name} MIDI clip${props.clip.muted ? ', muted' : ''}. Double-click or press Enter to open.`"
    :aria-pressed="props.selected"
    @click.stop="emit('select')"
    @dblclick.stop="openClip"
    @keydown.enter.stop.prevent="openClip"
  >
    <span class="project-midi-clip__accent" aria-hidden="true"></span>
    <strong>{{ props.clip.name }}</strong>
    <span class="project-midi-clip__kind">{{ props.clip.muted ? 'Muted' : 'MIDI' }}</span>
  </button>
</template>

<style scoped>
.project-midi-clip {
  position: absolute;
  inset-block: var(--sd-space-1);
  inset-inline-start: var(--project-clip-offset);
  display: grid;
  min-inline-size: var(--sd-space-6);
  inline-size: var(--project-clip-width);
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sd-space-1);
  padding: var(--sd-space-2);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--project-clip-color) 68%, transparent);
  border-radius: var(--sd-radius-xs);
  color: var(--sd-color-text-primary);
  background: color-mix(in srgb, var(--project-clip-color) 24%, var(--sd-color-surface-sunken));
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition:
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    border-color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    filter var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.project-midi-clip:hover {
  border-color: color-mix(in srgb, var(--project-clip-color) 88%, transparent);
  background: color-mix(in srgb, var(--project-clip-color) 34%, var(--sd-color-surface-sunken));
}

.project-midi-clip:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-midi-clip--selected {
  border-color: var(--sd-color-border-focus);
  outline: 1px solid var(--sd-color-border-focus);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--project-clip-color) 40%, var(--sd-color-surface-sunken));
}

.project-midi-clip--muted {
  filter: saturate(0.36);
  opacity: 0.66;
}

.project-midi-clip__accent {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--sd-space-0-5);
  background: var(--project-clip-color);
}

.project-midi-clip strong,
.project-midi-clip__kind {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-midi-clip strong {
  padding-inline-start: var(--sd-space-1);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-midi-clip__kind {
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.04em;
}
</style>
