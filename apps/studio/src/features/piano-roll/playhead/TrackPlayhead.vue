<script setup lang="ts">
import type { ProjectId, Tick } from '@seele-daw/project-core'
import { computed, type StyleValue } from 'vue'

import { timelinePositionRatio } from '@/features/project-workspace/timeline/layout'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'

const props = defineProps<{
  readonly barSpanTick: Tick
  readonly projectId: ProjectId
  readonly timelineEndTick: Tick
}>()
const { visualPosition } = useProjectPlayback()

const playheadStyle = computed((): StyleValue | null => {
  if (visualPosition.value.projectId !== props.projectId) return null

  const timelineBarCount = props.timelineEndTick / props.barSpanTick
  const inlineOffsetRem =
    timelinePositionRatio(visualPosition.value.positionTick, props.timelineEndTick) *
    timelineBarCount *
    PROJECT_TIMELINE_BAR_INLINE_SIZE_REM

  // Transform-only movement keeps high-frequency position updates out of layout.
  return { transform: `translate3d(${inlineOffsetRem}rem, 0, 0)` }
})
</script>

<template>
  <div
    v-if="playheadStyle"
    class="project-piano-roll-track__playhead"
    :style="playheadStyle"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.project-piano-roll-track__playhead {
  position: absolute;
  z-index: var(--sd-layer-sticky-raised);
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 1px;
  background: var(--sd-editor-playhead);
  pointer-events: none;
  will-change: transform;
}

.project-piano-roll-track__playhead::before {
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
