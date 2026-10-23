<script setup lang="ts">
import { useTemplateRef, type StyleValue } from 'vue'
import { useClipHeaderScroll } from '@/features/piano-roll/components/track-surface/hooks/use-clip-header-scroll'
import type { ClipId } from '@seele-daw/project-core'
import type { TrackClipRegion } from '@/features/piano-roll/components/track-surface/types/track-clip-region'
import { CLIP_HEADER_ROW_HEIGHT } from '@/features/piano-roll/components/track-surface/presentation/clip-regions'

const props = defineProps<{
  readonly regions: readonly TrackClipRegion[]
  readonly activeClipId: ClipId | null
  readonly rowCount: number
  readonly contentStyle: StyleValue
  readonly scrollLeft: number
}>()
const emit = defineEmits<{
  activate: [clipId: ClipId]
  scrollTimeline: [left: number]
}>()
const viewport = useTemplateRef<HTMLElement>('viewport')
const { handleScroll, handleWheel } = useClipHeaderScroll({
  viewport,
  getScrollLeft: () => props.scrollLeft,
  getActiveClipId: () => props.activeClipId,
  getRegions: () => props.regions,
  scrollTimeline: (left) => emit('scrollTimeline', left),
})
</script>

<template>
  <div
    ref="viewport"
    class="piano-roll-clip-headers"
    role="group"
    aria-label="MIDI Clip headers"
    @scroll.passive="handleScroll"
    @wheel="handleWheel"
  >
    <div
      class="piano-roll-clip-headers__content"
      :style="[props.contentStyle, { blockSize: `${props.rowCount * CLIP_HEADER_ROW_HEIGHT}px` }]"
    >
      <button
        v-for="region in props.regions"
        :key="region.clip.clipId"
        class="piano-roll-clip-headers__clip"
        type="button"
        :aria-label="`Use ${region.clip.name} as the Active Clip`"
        :aria-pressed="props.activeClipId === region.clip.clipId"
        :data-active="props.activeClipId === region.clip.clipId"
        :data-status="region.clip.status"
        :data-clip-id="region.clip.clipId"
        :title="`${region.clip.name} · ${region.clip.startTick}–${region.clip.endTick} ticks${region.clip.status === 'unsupported' ? ' · Loop editing unavailable' : ''}`"
        :style="[
          region.style,
          {
            insetBlockStart: `${region.headerRow * CLIP_HEADER_ROW_HEIGHT}px`,
            blockSize: `${CLIP_HEADER_ROW_HEIGHT}px`,
          },
        ]"
        @click="emit('activate', region.clip.clipId)"
      >
        {{ region.clip.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.piano-roll-clip-headers {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: none;
  background: var(--sd-color-surface-panel);
  box-shadow: inset 0 -1px var(--sd-color-border-default);
}
.piano-roll-clip-headers__content {
  position: relative;
  min-inline-size: 100%;
}
.piano-roll-clip-headers__clip {
  position: absolute;
  box-sizing: border-box;
  min-inline-size: 1px;
  padding-inline: var(--sd-space-1);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--piano-roll-clip-color) 60%, transparent);
  border-radius: var(--sd-radius-xs);
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: color-mix(in srgb, var(--piano-roll-clip-color) 18%, var(--sd-color-surface-panel));
  cursor: pointer;
}
.piano-roll-clip-headers__clip:hover {
  color: var(--sd-color-text-primary);
  background: color-mix(in srgb, var(--piano-roll-clip-color) 32%, var(--sd-color-surface-panel));
}
.piano-roll-clip-headers__clip[data-active='true'] {
  color: var(--sd-color-text-primary);
  border-color: var(--piano-roll-clip-color);
  box-shadow: inset 0 2px var(--piano-roll-clip-color);
  background: color-mix(in srgb, var(--piano-roll-clip-color) 32%, var(--sd-color-surface-panel));
}
.piano-roll-clip-headers__clip[data-status='unsupported'] {
  border-style: dashed;
}
.piano-roll-clip-headers__clip:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}
</style>
