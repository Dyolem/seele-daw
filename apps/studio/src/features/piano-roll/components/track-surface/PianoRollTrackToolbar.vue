<script setup lang="ts">
import { computed } from 'vue'
import { PIANO_ROLL_TRACK_CLIP_STATUS, type PianoRollTrackReadModel } from '@seele-daw/editor'
import { type ClipId } from '@seele-daw/project-core'
import TargetArrowIcon from '~icons/fluent/target-arrow-20-regular'
import PianoRollToolControls from '@/features/piano-roll/components/PianoRollToolControls.vue'
import PianoRollPitchControls from '@/features/piano-roll/components/pitch-view/PianoRollPitchControls.vue'
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
  }
>()
const emit = defineEmits<{
  invoke: [actionId: StudioActionId]
  toggleFollow: []
  selectClip: [clipId: ClipId | null]
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
        style="inline-size: 10rem"
        size="small"
        aria-label="Active Clip"
        :model-value="activeClipId === null ? 'none' : `clip:${activeClipId}`"
        :options="clipOptions"
        @update:model-value="selectClip"
      />
    </label>
    <PianoRollPitchControls :pitches="fitPitches" />
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
  overflow-y: hidden;
  scrollbar-width: thin;
  overscroll-behavior: none;
  white-space: nowrap;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__toolbar > * {
  flex: 0 0 auto;
}

.project-piano-roll-track__active-clip {
  display: flex;
  align-items: center;
  gap: var(--sd-space-1);
}

.project-piano-roll-track__active-clip > span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}
</style>
