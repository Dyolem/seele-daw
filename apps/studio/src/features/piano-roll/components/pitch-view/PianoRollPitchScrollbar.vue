<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import type { PianoRollPitchViewLayout } from '@/features/piano-roll/types/piano-roll-pitch-viewport'

const props = defineProps<{ readonly layout: PianoRollPitchViewLayout | null }>()
const emit = defineEmits<{ scrollPitch: [scrollTop: number] }>()
const element = useTemplateRef<HTMLElement>('element')
let observedScrollTop = 0
watch(
  [() => props.layout, element],
  () => {
    if (element.value === null || props.layout === null) return
    element.value.scrollTop = props.layout.scrollTop
    // Native scroll events also report programmatic positioning and pixel rounding.
    observedScrollTop = element.value.scrollTop
  },
  { flush: 'post' },
)

function handleScroll(): void {
  if (element.value === null || element.value.scrollTop === observedScrollTop) return
  observedScrollTop = element.value.scrollTop
  emit('scrollPitch', observedScrollTop)
}
</script>

<template>
  <div
    ref="element"
    class="piano-roll-pitch-scrollbar"
    role="region"
    aria-label="Pitch scroll"
    tabindex="0"
    :style="{ blockSize: layout ? `${layout.viewport.heightCssPixel}px` : undefined }"
    @scroll.passive="handleScroll"
  >
    <div aria-hidden="true" :style="{ blockSize: `${layout?.contentHeight ?? 0}px` }"></div>
  </div>
</template>

<style scoped>
.piano-roll-pitch-scrollbar {
  min-block-size: 0;
  overflow-y: scroll;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--sd-color-border-strong) var(--sd-color-surface-panel);
  background: var(--sd-color-surface-panel);
}
.piano-roll-pitch-scrollbar:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}
</style>
