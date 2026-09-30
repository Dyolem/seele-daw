<script setup lang="ts">
import CursorIcon from '~icons/fluent/cursor-20-regular'
import GridIcon from '~icons/fluent/grid-20-regular'
import PenIcon from '~icons/fluent/pen-20-regular'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { PIANO_ROLL_TOOL } from '@/features/piano-roll/types/piano-roll-preferences'
import type { PianoRollToolControlsProps } from '@/features/piano-roll/types/piano-roll-tool-controls'
import { STUDIO_ACTION, type StudioActionId } from '@/workbench/actions/studio-action'

defineProps<PianoRollToolControlsProps>()
const emit = defineEmits<{ invoke: [actionId: StudioActionId] }>()
</script>

<template>
  <div class="piano-roll-tool-controls">
    <div class="piano-roll-tool-controls__tools" role="group" aria-label="Editing tool">
      <UiIconButton
        :icon="PenIcon"
        :label="controls.pencil.label"
        :title="controls.pencil.title"
        :pressed="activeTool === PIANO_ROLL_TOOL.PENCIL"
        size="small"
        @click="emit('invoke', STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL)"
      />
      <UiIconButton
        :icon="CursorIcon"
        :label="controls.cursor.label"
        :title="controls.cursor.title"
        :pressed="activeTool === PIANO_ROLL_TOOL.CURSOR"
        size="small"
        @click="emit('invoke', STUDIO_ACTION.PIANO_ROLL_TOOL_CURSOR)"
      />
    </div>
    <span class="piano-roll-tool-controls__divider" aria-hidden="true"></span>
    <div class="piano-roll-tool-controls__snap">
      <UiIconButton
        :icon="GridIcon"
        :title="controls.snap.title"
        :label="`Snap to ${gridPreset} grid — ${snapEnabled ? 'on' : 'off'}`"
        :pressed="snapEnabled"
        size="small"
        @click="emit('invoke', STUDIO_ACTION.PIANO_ROLL_SNAP_TOGGLE)"
      />
      <span aria-hidden="true">{{ gridPreset }}</span>
    </div>
  </div>
</template>

<style scoped>
.piano-roll-tool-controls,
.piano-roll-tool-controls__tools,
.piano-roll-tool-controls__snap {
  display: flex;
  align-items: center;
  gap: var(--sd-space-1);
}
.piano-roll-tool-controls {
  flex: 0 0 auto;
  gap: var(--sd-space-2);
}
.piano-roll-tool-controls__divider {
  inline-size: 1px;
  block-size: 1rem;
  background: var(--sd-color-border-default);
}
.piano-roll-tool-controls__snap > span {
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}
</style>
