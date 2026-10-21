<script setup lang="ts">
import { computed } from 'vue'
import { PIANO_ROLL_TRACK_CLIP_STATUS, type PianoRollTrackReadModel } from '@seele-daw/editor'
import { parseMidiChannel, type ClipId, type MidiChannel } from '@seele-daw/project-core'
import TargetArrowIcon from '~icons/fluent/target-arrow-20-regular'
import PianoRollToolControls from '@/features/piano-roll/components/PianoRollToolControls.vue'
import PianoRollPitchControls from '@/features/piano-roll/components/pitch-view/PianoRollPitchControls.vue'
import { PIANO_ROLL_MIDI_CHANNEL_OPTIONS } from '@/features/piano-roll/presentation/piano-roll-channel-options'
import type { PianoRollToolControlsProps } from '@/features/piano-roll/types/piano-roll-tool-controls'
import type { StudioActionId } from '@/workbench/actions/studio-action'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import UiSelect from '@/ui/components/UiSelect.vue'

const props = defineProps<
  PianoRollToolControlsProps & {
    readonly activeClipId: ClipId | null
    readonly clips: PianoRollTrackReadModel['clips']
    readonly isPlaying: boolean
    readonly isFollowing: boolean
    readonly followLabel: string
    readonly sustainPedalChannel: MidiChannel
    readonly previewMessage: string | null
    readonly previewBlocked: boolean
  }
>()
const emit = defineEmits<{
  invoke: [actionId: StudioActionId]
  toggleFollow: []
  selectClip: [clipId: ClipId | null]
  selectChannel: [channel: MidiChannel]
}>()
const clipOptions = computed(() => [
  { value: 'none', label: 'None' },
  ...props.clips.map(({ clip }) => ({
    value: `clip:${clip.clipId}`,
    label: `${clip.name}${clip.status === PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED ? ' (looped)' : ''}`,
  })),
])
const fitPitches = computed(() =>
  props.clips.flatMap(({ notes }) => notes.map(({ note }) => note.pitch)),
)
function selectClip(value: string): void {
  if (value === 'none') {
    emit('selectClip', null)
    return
  }
  const entry = props.clips.find(({ clip }) => `clip:${clip.clipId}` === value)
  if (entry !== undefined) emit('selectClip', entry.clip.clipId)
}
</script>

<template>
  <header class="project-piano-roll-track__toolbar" aria-label="Piano Roll controls">
    <PianoRollToolControls
      :active-tool="activeTool"
      :controls="controls"
      :grid-preset="gridPreset"
      :snap-enabled="snapEnabled"
      @invoke="emit('invoke', $event)"
    />
    <span class="project-piano-roll-track__scope-label">TRACK TIME</span>
    <UiIconButton
      class="project-piano-roll-track__follow-control"
      :disabled="!isPlaying"
      :icon="TargetArrowIcon"
      :label="followLabel"
      :pressed="isFollowing"
      size="small"
      @click="emit('toggleFollow')"
    />
    <label class="project-piano-roll-track__active-clip">
      <span>Active Clip</span>
      <UiSelect
        class="project-piano-roll-track__select"
        size="small"
        aria-label="Active Clip"
        :model-value="activeClipId === null ? 'none' : `clip:${activeClipId}`"
        :options="clipOptions"
        @update:model-value="selectClip"
      />
    </label>
    <label class="project-piano-roll-track__channel-control">
      <span>CC64 Ch</span>
      <UiSelect
        size="small"
        aria-label="Sustain Pedal MIDI Channel"
        :model-value="String(sustainPedalChannel)"
        :options="PIANO_ROLL_MIDI_CHANNEL_OPTIONS"
        @update:model-value="emit('selectChannel', parseMidiChannel(Number($event)))"
      />
    </label>
    <PianoRollPitchControls :pitches="fitPitches" />
    <span
      v-if="previewMessage"
      class="project-piano-roll-track__preview-message"
      :data-blocked="previewBlocked"
    >
      {{ previewMessage }}
    </span>
  </header>
</template>

<style scoped>
.project-piano-roll-track__toolbar {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: var(--sd-space-2);
  padding-inline: var(--sd-space-2);
  overflow-x: auto;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__active-clip,
.project-piano-roll-track__channel-control {
  display: flex;
  align-items: center;
  gap: var(--sd-space-1);
}

.project-piano-roll-track__scope-label,
.project-piano-roll-track__active-clip > span,
.project-piano-roll-track__channel-control > span,
.project-piano-roll-track__preview-message {
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll-track__scope-label {
  padding: var(--sd-space-1) var(--sd-space-2);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-pill);
  letter-spacing: 0.08em;
}

.project-piano-roll-track__select {
  max-inline-size: 10rem;
}

.project-piano-roll-track__preview-message {
  min-inline-size: 0;
  margin-inline-start: auto;
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-piano-roll-track__preview-message[data-blocked='true'] {
  color: var(--sd-color-state-danger);
}
</style>
