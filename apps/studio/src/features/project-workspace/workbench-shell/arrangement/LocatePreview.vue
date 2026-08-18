<script setup lang="ts">
import type { Tick } from '@seele-daw/project-core'
import { computed, type StyleValue } from 'vue'

import { timelinePositionRatio } from '@/features/project-workspace/timeline/layout'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'

const props = defineProps<{
  readonly barSpanTick: Tick
  readonly positionTick: Tick
  readonly timelineEndTick: Tick
}>()

const previewStyle = computed((): StyleValue => {
  const timelineBarCount = props.timelineEndTick / props.barSpanTick
  const inlineOffsetRem =
    timelinePositionRatio(props.positionTick, props.timelineEndTick) *
    timelineBarCount *
    PROJECT_TIMELINE_BAR_INLINE_SIZE_REM

  return { transform: `translate3d(${inlineOffsetRem}rem, 0, 0)` }
})
</script>

<template>
  <div
    class="project-workbench__arrangement-locate-preview"
    :style="previewStyle"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.project-workbench__arrangement-locate-preview {
  position: absolute;
  z-index: var(--sd-layer-sticky-raised);
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--sd-editor-playhead) 0,
    var(--sd-editor-playhead) var(--sd-space-2),
    transparent var(--sd-space-2),
    transparent var(--sd-space-3)
  );
  opacity: 0.72;
  pointer-events: none;
  will-change: transform;
}

.project-workbench__arrangement-locate-preview::before {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 50%;
  inline-size: var(--sd-space-2);
  block-size: var(--sd-space-2);
  background: var(--sd-editor-playhead);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  content: '';
  transform: translateX(-50%);
}
</style>
