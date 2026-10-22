<script setup lang="ts">
import type { ClipId } from '@seele-daw/project-core'
import type { TrackClipRegion } from '@/features/piano-roll/components/track-surface/types/track-clip-region'

const props = defineProps<{
  readonly regions: readonly TrackClipRegion[]
  readonly activeClipId: ClipId | null
}>()
</script>

<template>
  <div class="piano-roll-clip-regions" aria-hidden="true">
    <div
      v-for="region in props.regions"
      :key="region.clip.clipId"
      class="piano-roll-clip-regions__clip"
      :data-clip-id="region.clip.clipId"
      :data-active="props.activeClipId === region.clip.clipId"
      :data-status="region.clip.status"
      :style="region.style"
    ></div>
  </div>
</template>

<style scoped>
.piano-roll-clip-regions {
  position: relative;
  isolation: isolate;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  pointer-events: none;
}
.piano-roll-clip-regions__clip {
  position: absolute;
  inset-block: 0;
  box-sizing: border-box;
  border-inline: 1px solid color-mix(in srgb, var(--piano-roll-clip-color) 28%, transparent);
  background: color-mix(in srgb, var(--piano-roll-clip-color) 4%, transparent);
}
.piano-roll-clip-regions__clip[data-active='true'] {
  z-index: 1;
  border-inline-color: color-mix(in srgb, var(--piano-roll-clip-color) 72%, transparent);
  background: color-mix(in srgb, var(--piano-roll-clip-color) 9%, transparent);
}
.piano-roll-clip-regions__clip[data-status='unsupported'] {
  border-inline-style: dashed;
}
</style>
