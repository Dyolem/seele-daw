<script setup lang="ts">
import type { MidiPitch } from '@seele-daw/project-core'
import { shallowRef } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import ChevronDownIcon from '~icons/fluent/chevron-down-16-regular'
import AddIcon from '~icons/fluent/add-16-regular'
import SubtractIcon from '~icons/fluent/subtract-16-regular'
import UiSelect from '@/ui/components/UiSelect.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiMenuSurface from '@/ui/components/UiMenuSurface.vue'
import { useStudioKeyboardLayer } from '@/workbench/actions/vue/studio-action-context'
import { PIANO_ROLL_PITCH_VIEW_MODE } from '@/features/piano-roll/types/piano-roll-preferences'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import {
  PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE,
  PIANO_ROLL_PITCH_COUNT,
} from '@/features/piano-roll/viewport/pitch-viewport-policy'

defineProps<{ readonly pitches: readonly MidiPitch[] }>()
const preferences = usePianoRollPreferencesStore()
const open = shallowRef(false)
useStudioKeyboardLayer(() => open.value)
const modes = [
  { value: PIANO_ROLL_PITCH_VIEW_MODE.STANDARD, label: 'Standard keys' },
  { value: PIANO_ROLL_PITCH_VIEW_MODE.RANGE, label: 'Pitch range' },
]
</script>

<template>
  <div class="piano-roll-pitch-controls" role="group" aria-label="Pitch view">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger as-child>
        <UiButton
          size="small"
          aria-label="Pitch view settings"
          title="Pitch display mode and vertical zoom"
        >
          <span class="piano-roll-pitch-controls__trigger-label"
            >Pitch <UiIcon :icon="ChevronDownIcon" :size="16"
          /></span>
        </UiButton>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent as-child align="end" :side-offset="6" :collision-padding="8">
          <UiMenuSurface class="piano-roll-pitch-controls__panel" aria-label="Pitch view settings">
            <strong>Pitch view</strong>
            <label class="piano-roll-pitch-controls__mode">
              <span>Display mode</span>
              <UiSelect
                size="small"
                aria-label="Pitch display mode"
                :model-value="preferences.pitchViewMode"
                :options="modes"
                @update:model-value="preferences.selectPitchViewMode"
              />
            </label>
            <div
              v-if="preferences.pitchViewMode === PIANO_ROLL_PITCH_VIEW_MODE.RANGE"
              class="piano-roll-pitch-controls__zoom"
              role="group"
              aria-label="Pitch range zoom"
            >
              <UiIconButton
                :icon="SubtractIcon"
                size="small"
                label="Zoom out pitch range"
                :disabled="preferences.pitchRangeSize >= PIANO_ROLL_PITCH_COUNT"
                @click="preferences.zoomPitchRange('out')"
              />
              <span
                class="piano-roll-pitch-controls__range"
                aria-live="polite"
                title="Preferred visible range. Scroll when the panel is too short to keep keys readable."
                >Target {{ preferences.pitchRangeSize }} keys</span
              >
              <UiIconButton
                :icon="AddIcon"
                size="small"
                label="Zoom in pitch range"
                :disabled="preferences.pitchRangeSize <= PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE"
                @click="preferences.zoomPitchRange('in')"
              />
            </div>
            <p>
              Scroll vertically to reach all pitches. Standard keys keep a fixed height; Pitch range
              adapts to the panel height.
            </p>
          </UiMenuSurface>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <UiButton
      size="small"
      title="Center on this scope's notes. Scroll if the full range cannot fit at a readable key height."
      :disabled="pitches.length === 0"
      @click="preferences.fitPitchRange(pitches)"
      >Fit notes</UiButton
    >
  </div>
</template>

<style scoped>
.piano-roll-pitch-controls {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: var(--sd-space-1);
}
.piano-roll-pitch-controls__trigger-label {
  display: inline-flex;
  align-items: center;
  gap: var(--sd-space-2);
}
.piano-roll-pitch-controls__range {
  min-inline-size: 7ch;
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  text-align: center;
  white-space: nowrap;
}
.piano-roll-pitch-controls__panel {
  display: grid;
  gap: var(--sd-space-3);
  inline-size: 20rem;
}
.piano-roll-pitch-controls__mode,
.piano-roll-pitch-controls__zoom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sd-space-2);
  font-size: var(--sd-font-size-sm);
}
.piano-roll-pitch-controls__panel p {
  margin: 0;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}
</style>
