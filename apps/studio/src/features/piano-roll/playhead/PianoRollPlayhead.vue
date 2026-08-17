<script setup lang="ts">
import type { PianoRollViewport } from '@seele-daw/editor'
import { computed, type StyleValue } from 'vue'

import { projectPianoRollPlayheadCssPixel } from '@/features/piano-roll/playhead/playhead-projection'
import type { ReadyProjectPianoRollPresentation } from '@/features/piano-roll/project-piano-roll-presentation'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'

const props = defineProps<{
  readonly presentation: ReadyProjectPianoRollPresentation
  readonly viewport: PianoRollViewport
}>()
const { visualPosition } = useProjectPlayback()

const playheadStyle = computed((): StyleValue | null => {
  if (visualPosition.value.projectId !== props.presentation.projectId) return null

  const inlineOffsetCssPixel = projectPianoRollPlayheadCssPixel({
    clipSpanTick: props.presentation.context.clipSpanTick,
    clipStartTick: props.presentation.startTick,
    globalTick: visualPosition.value.positionTick,
    viewport: props.viewport,
  })
  if (inlineOffsetCssPixel === null) return null

  // Transform-only movement keeps high-frequency position updates out of layout.
  return { transform: `translate3d(${inlineOffsetCssPixel}px, 0, 0)` }
})
</script>

<template>
  <div
    v-if="playheadStyle"
    class="project-piano-roll__playhead"
    :style="playheadStyle"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.project-piano-roll__playhead {
  position: absolute;
  z-index: var(--sd-layer-sticky-raised);
  inset-block-start: var(--project-piano-roll-toolbar-height);
  inset-block-end: 0;
  inset-inline-start: var(--project-piano-roll-keyboard-width);
  inline-size: 1px;
  background: var(--sd-editor-playhead);
  pointer-events: none;
  will-change: transform;
}

.project-piano-roll__playhead::before {
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
