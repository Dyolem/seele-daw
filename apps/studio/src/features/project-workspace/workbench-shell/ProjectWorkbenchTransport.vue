<script setup lang="ts">
import ArrowRedoIcon from '~icons/fluent/arrow-redo-20-regular'
import ArrowRepeatIcon from '~icons/fluent/arrow-repeat-all-20-regular'
import ArrowUndoIcon from '~icons/fluent/arrow-undo-20-regular'
import PanelBottomIcon from '~icons/fluent/panel-bottom-20-regular'
import PlayIcon from '~icons/fluent/play-20-regular'
import PreviousIcon from '~icons/fluent/previous-20-regular'
import RecordIcon from '~icons/fluent/record-20-regular'
import SpeakerIcon from '~icons/fluent/speaker-2-20-regular'

import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'

interface ProjectWorkbenchTransportProps {
  readonly canRedo: boolean
  readonly canUndo: boolean
  readonly isContextEditorOpen: boolean
  readonly tempo: number
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
}

const props = defineProps<ProjectWorkbenchTransportProps>()
const emit = defineEmits<{
  openContextEditor: []
  redo: []
  undo: []
}>()
</script>

<template>
  <section class="project-workbench__transport" aria-label="Transport">
    <div class="project-workbench__transport-start">
      <div class="project-workbench__control-group" aria-label="Project history">
        <UiIconButton
          :disabled="!props.canUndo"
          :icon="ArrowUndoIcon"
          label="Undo"
          @click="emit('undo')"
        />
        <UiIconButton
          :disabled="!props.canRedo"
          :icon="ArrowRedoIcon"
          label="Redo"
          @click="emit('redo')"
        />
      </div>

      <div class="project-workbench__meter-group" aria-label="Project meter">
        <span>
          <strong>{{ props.tempo }}</strong>
          BPM
        </span>
        <span aria-label="Time signature">
          <strong>{{ props.timeSignatureNumerator }}</strong>
          /
          <strong>{{ props.timeSignatureDenominator }}</strong>
        </span>
      </div>
    </div>

    <div class="project-workbench__playback-group" aria-label="Playback controls">
      <UiIconButton
        disabled
        :icon="PreviousIcon"
        label="Return to start — playback is not connected"
      />
      <UiIconButton disabled :icon="PlayIcon" label="Play — playback is not connected" />
      <UiIconButton
        class="project-workbench__record-control"
        disabled
        :icon="RecordIcon"
        label="Record — recording is not connected"
      />
      <UiIconButton disabled :icon="ArrowRepeatIcon" label="Loop — playback is not connected" />
      <output class="project-workbench__time" aria-label="Current play time"> 00:00.000 </output>
    </div>

    <div class="project-workbench__transport-end">
      <div class="project-workbench__output-level" title="Audio output is not connected">
        <UiIcon :icon="SpeakerIcon" :size="20" />
        <span>0.0 dB</span>
      </div>
      <UiIconButton
        :icon="PanelBottomIcon"
        label="Open MIDI editor"
        :pressed="props.isContextEditorOpen"
        @click="emit('openContextEditor')"
      />
    </div>
  </section>
</template>

<style scoped>
.project-workbench__transport {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding-inline: var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
  background: var(--sd-color-surface-panel);
}

.project-workbench__transport-start,
.project-workbench__transport-end,
.project-workbench__control-group,
.project-workbench__playback-group,
.project-workbench__meter-group {
  display: flex;
  align-items: center;
}

.project-workbench__transport-start {
  gap: var(--sd-space-4);
  justify-self: start;
}

.project-workbench__transport-end {
  gap: var(--sd-space-3);
  justify-self: end;
}

.project-workbench__control-group,
.project-workbench__playback-group,
.project-workbench__meter-group {
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__control-group {
  padding: var(--sd-space-0-5);
}

.project-workbench__meter-group {
  min-block-size: var(--sd-control-height-md);
}

.project-workbench__meter-group > span {
  display: flex;
  gap: var(--sd-space-1);
  align-items: baseline;
  padding-inline: var(--sd-space-3);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__meter-group > span + span {
  border-inline-start: 1px solid var(--sd-color-border-subtle);
}

.project-workbench__meter-group strong {
  color: var(--sd-color-text-primary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__playback-group {
  gap: var(--sd-space-1);
  padding: var(--sd-space-0-5) var(--sd-space-1);
}

.project-workbench__record-control {
  color: var(--sd-color-state-record);
}

.project-workbench__time {
  min-inline-size: 6.75rem;
  padding-inline: var(--sd-space-3);
  border-inline-start: 1px solid var(--sd-color-border-subtle);
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.project-workbench__output-level {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-muted);
  background: var(--sd-color-surface-sunken);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

@media (max-width: 71.9375rem) {
  .project-workbench__output-level span {
    display: none;
  }
}

@media (max-width: 56.1875rem) {
  .project-workbench__transport {
    display: none;
  }
}
</style>
