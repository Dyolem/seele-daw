<script setup lang="ts">
import ArrowRedoIcon from '~icons/fluent/arrow-redo-20-regular'
import ArrowRepeatIcon from '~icons/fluent/arrow-repeat-all-20-regular'
import ArrowUndoIcon from '~icons/fluent/arrow-undo-20-regular'
import PanelBottomIcon from '~icons/fluent/panel-bottom-20-regular'
import PauseIcon from '~icons/fluent/pause-20-regular'
import PlayIcon from '~icons/fluent/play-20-regular'
import PreviousIcon from '~icons/fluent/previous-20-regular'
import RecordIcon from '~icons/fluent/record-20-regular'
import SpeakerIcon from '~icons/fluent/speaker-2-20-regular'
import SpinnerIcon from '~icons/fluent/spinner-ios-20-regular'
import { computed } from 'vue'
import type { StudioActionId, StudioActionSource } from '@/workbench/actions/studio-action'
import type { ProjectWorkbenchActionControls } from '@/features/project-workspace/actions/project-workbench-action-controls'

import ProjectTempoControl from '@/features/project-workspace/tempo/ProjectTempoControl.vue'
import type { ProjectTempoControlMode } from '@/features/project-workspace/tempo/tempo-control'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'

interface ProjectWorkbenchTransportProps {
  readonly actionControls: ProjectWorkbenchActionControls
  readonly playbackFeedback: string | null
  readonly playbackTime: string
  readonly tempoDisplayBpm: string
  readonly tempoEditable: boolean
  readonly tempoMode: ProjectTempoControlMode
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
}

const props = defineProps<ProjectWorkbenchTransportProps>()
const emit = defineEmits<{
  invokeAction: [actionId: StudioActionId, source: StudioActionSource]
  tempoCommit: [input: string]
  tempoEditStart: []
}>()

const playbackIcon = computed(() => {
  if (props.actionControls.togglePlayback.busy) return SpinnerIcon
  if (props.actionControls.togglePlayback.checked) return PauseIcon
  return PlayIcon
})
</script>

<template>
  <section class="project-workbench__transport" aria-label="Transport">
    <div class="project-workbench__transport-start">
      <div class="project-workbench__control-group" aria-label="Project history">
        <UiIconButton
          :disabled="!props.actionControls.undo.enabled"
          :icon="ArrowUndoIcon"
          :label="props.actionControls.undo.label"
          :title="props.actionControls.undo.title"
          :aria-description="props.actionControls.undo.disabledReason ?? undefined"
          @click="emit('invokeAction', props.actionControls.undo.actionId, 'toolbar')"
        />
        <UiIconButton
          :disabled="!props.actionControls.redo.enabled"
          :icon="ArrowRedoIcon"
          :label="props.actionControls.redo.label"
          :title="props.actionControls.redo.title"
          :aria-description="props.actionControls.redo.disabledReason ?? undefined"
          @click="emit('invokeAction', props.actionControls.redo.actionId, 'toolbar')"
        />
      </div>

      <div class="project-workbench__meter-group" aria-label="Project meter">
        <ProjectTempoControl
          :display-bpm="props.tempoDisplayBpm"
          :editable="props.tempoEditable"
          :mode="props.tempoMode"
          @commit="emit('tempoCommit', $event)"
          @edit-start="emit('tempoEditStart')"
        />
        <span aria-label="Time signature">
          <strong>{{ props.timeSignatureNumerator }}</strong>
          /
          <strong>{{ props.timeSignatureDenominator }}</strong>
        </span>
      </div>
    </div>

    <div class="project-workbench__playback-group" aria-label="Playback controls">
      <UiIconButton
        :disabled="!props.actionControls.returnToStart.enabled"
        :icon="PreviousIcon"
        :label="props.actionControls.returnToStart.label"
        :title="props.actionControls.returnToStart.title"
        :aria-description="props.actionControls.returnToStart.disabledReason ?? undefined"
        @click="emit('invokeAction', props.actionControls.returnToStart.actionId, 'toolbar')"
      />
      <UiIconButton
        :disabled="!props.actionControls.togglePlayback.enabled"
        :aria-busy="props.actionControls.togglePlayback.busy || undefined"
        :class="{ 'project-workbench__playback-loading': props.actionControls.togglePlayback.busy }"
        :icon="playbackIcon"
        :label="props.actionControls.togglePlayback.label"
        :title="props.actionControls.togglePlayback.title"
        :aria-description="props.actionControls.togglePlayback.disabledReason ?? undefined"
        :pressed="props.actionControls.togglePlayback.checked"
        @click="emit('invokeAction', props.actionControls.togglePlayback.actionId, 'toolbar')"
      />
      <UiIconButton
        class="project-workbench__record-control"
        disabled
        :icon="RecordIcon"
        label="Record — recording is not connected"
      />
      <UiIconButton disabled :icon="ArrowRepeatIcon" label="Loop — looping is not connected" />
      <output
        class="project-workbench__time"
        aria-label="Current play time"
        :title="props.playbackFeedback ?? undefined"
      >
        {{ props.playbackTime }}
      </output>
    </div>

    <div class="project-workbench__transport-end">
      <div class="project-workbench__output-level" title="Output metering is not available">
        <UiIcon :icon="SpeakerIcon" :size="20" />
        <span>Meter —</span>
      </div>
      <UiIconButton
        :icon="PanelBottomIcon"
        :disabled="!props.actionControls.openMidiEditor.enabled"
        :label="props.actionControls.openMidiEditor.label"
        :title="props.actionControls.openMidiEditor.title"
        :aria-description="props.actionControls.openMidiEditor.disabledReason ?? undefined"
        :pressed="props.actionControls.openMidiEditor.checked"
        @click="emit('invokeAction', props.actionControls.openMidiEditor.actionId, 'toolbar')"
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

.project-workbench__meter-group > * + * {
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

.project-workbench__playback-loading :deep(svg) {
  animation: project-workbench-playback-spin 800ms linear infinite;
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

@keyframes project-workbench-playback-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-workbench__playback-loading :deep(svg) {
    animation-duration: 1.6s;
  }
}

@media (max-width: 56.1875rem) {
  .project-workbench__transport {
    display: none;
  }
}
</style>
