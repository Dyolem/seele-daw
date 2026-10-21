<script setup lang="ts">
import ChevronDownIcon from '~icons/fluent/chevron-down-16-regular'
import ChevronRightIcon from '~icons/fluent/chevron-right-16-regular'

import UiIcon from '@/ui/components/UiIcon.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiHeightResizeHandle from '@/ui/components/UiHeightResizeHandle.vue'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import {
  CONTROLLER_LANE_MINIMUM_HEIGHT,
  CONTROLLER_LANE_HEADER_HEIGHT,
  CONTROLLER_LANE_SPLITTER_HEIGHT,
} from '@/features/piano-roll/layout/controller-lane-policy'
const props = defineProps<{
  readonly visible: boolean
  readonly canExpand: boolean
  readonly maximum: number
}>()
const preferences = usePianoRollPreferencesStore()
</script>

<template>
  <div
    class="piano-roll-controller-header"
    :style="{
      '--controller-title-height': `${CONTROLLER_LANE_HEADER_HEIGHT}px`,
      '--controller-splitter-height': `${CONTROLLER_LANE_SPLITTER_HEIGHT}px`,
    }"
  >
    <UiHeightResizeHandle
      v-if="visible"
      class="piano-roll-controller-header__splitter"
      label="Resize CC64 lane"
      :model-value="preferences.controllerLaneHeight"
      :minimum="CONTROLLER_LANE_MINIMUM_HEIGHT"
      :maximum="maximum"
      @update:model-value="preferences.setControllerLaneHeight"
    />
    <div class="piano-roll-controller-header__title">
      <UiButton
        size="small"
        variant="ghost"
        :aria-expanded="visible"
        :aria-label="visible ? 'Collapse CC64 lane' : 'Expand CC64 lane'"
        :disabled="!visible && !canExpand"
        :title="canExpand ? 'Sustain Pedal (CC64)' : 'Increase MIDI editor height to show CC64'"
        @click="preferences.setControllerLaneExpanded(!props.visible)"
      >
        <template #leading
          ><UiIcon :icon="visible ? ChevronDownIcon : ChevronRightIcon" :size="16"
        /></template>
        CC64 · Sustain Pedal
      </UiButton>
      <span v-if="!canExpand" class="piano-roll-controller-header__hint">More height needed</span>
    </div>
  </div>
</template>

<style scoped>
.piano-roll-controller-header {
  min-inline-size: 0;
  min-block-size: 0;
  background: var(--sd-color-surface-panel);
}
.piano-roll-controller-header__splitter {
  block-size: var(--controller-splitter-height);
}
.piano-roll-controller-header__title {
  display: flex;
  align-items: center;
  gap: var(--sd-space-3);
  block-size: var(--controller-title-height);
  border-block: 1px solid var(--sd-color-border-strong);
}
.piano-roll-controller-header__hint {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}
</style>
