<script setup lang="ts">
import type { MidiPitch } from '@seele-daw/project-core'
import AddIcon from '~icons/fluent/add-16-regular'
import SubtractIcon from '~icons/fluent/subtract-16-regular'
import UiSelect from '@/ui/components/UiSelect.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { PIANO_ROLL_PITCH_VIEW_MODE } from '@/features/piano-roll/types/piano-roll-preferences'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import {
  PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE,
  PIANO_ROLL_PITCH_COUNT,
} from '@/features/piano-roll/viewport/pitch-viewport-policy'

defineProps<{ readonly pitches: readonly MidiPitch[] }>()
const preferences = usePianoRollPreferencesStore()
const modes = [
  { value: PIANO_ROLL_PITCH_VIEW_MODE.STANDARD, label: 'Standard keys' },
  { value: PIANO_ROLL_PITCH_VIEW_MODE.RANGE, label: 'Pitch range' },
]
</script>

<template>
  <div class="piano-roll-pitch-controls" role="group" aria-label="Pitch view">
    <UiSelect
      size="small"
      aria-label="Pitch display mode"
      :model-value="preferences.pitchViewMode"
      :options="modes"
      @update:model-value="preferences.selectPitchViewMode"
    />
    <template v-if="preferences.pitchViewMode === PIANO_ROLL_PITCH_VIEW_MODE.RANGE">
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
    </template>
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
.piano-roll-pitch-controls__range {
  min-inline-size: 7ch;
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  text-align: center;
}
</style>
