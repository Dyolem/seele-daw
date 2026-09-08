<script setup lang="ts">
import AddIcon from '~icons/fluent/add-20-regular'
import GuitarIcon from '~icons/fluent/guitar-20-regular'
import KeyboardIcon from '~icons/fluent/keyboard-20-regular'
import MicIcon from '~icons/fluent/mic-20-regular'
import MusicNoteIcon from '~icons/fluent/music-note-2-20-regular'
import SoundWaveIcon from '~icons/fluent/sound-wave-circle-20-regular'
import SpeakerKeyboardIcon from '~icons/fluent/speaker-box-keyboard-20-regular'
import type { Component } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'

import {
  PROJECT_ADD_TRACK_TYPE,
  type ProjectAddTrackType,
} from '@/features/project-workspace/workbench-shell/project-add-track-option'
import UiMenuSurface from '@/ui/components/UiMenuSurface.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'

interface AddTrackOption {
  readonly description: string
  readonly icon: Component
  readonly label: string
  readonly tone: 'blue' | 'cyan' | 'gold' | 'green' | 'red' | 'violet'
  readonly type: ProjectAddTrackType
  readonly unavailable: boolean
}

const emit = defineEmits<{
  select: [trackType: ProjectAddTrackType]
}>()

const ADD_TRACK_OPTIONS: readonly AddTrackOption[] = Object.freeze([
  Object.freeze({
    description: 'Record and edit audio',
    icon: MicIcon,
    label: 'Voice / audio',
    tone: 'red',
    type: PROJECT_ADD_TRACK_TYPE.AUDIO,
    unavailable: true,
  }),
  Object.freeze({
    description: 'Play sampled and synthesized sounds',
    icon: KeyboardIcon,
    label: 'Virtual instrument',
    tone: 'green',
    type: PROJECT_ADD_TRACK_TYPE.INSTRUMENT,
    unavailable: false,
  }),
  Object.freeze({
    description: 'Build beats with a step sequencer',
    icon: SpeakerKeyboardIcon,
    label: 'Drum machine',
    tone: 'gold',
    type: PROJECT_ADD_TRACK_TYPE.DRUM_MACHINE,
    unavailable: true,
  }),
  Object.freeze({
    description: 'Turn recordings into an instrument',
    icon: SoundWaveIcon,
    label: 'Sampler',
    tone: 'violet',
    type: PROJECT_ADD_TRACK_TYPE.SAMPLER,
    unavailable: true,
  }),
  Object.freeze({
    description: 'Record through amps and effects',
    icon: GuitarIcon,
    label: 'Guitar',
    tone: 'cyan',
    type: PROJECT_ADD_TRACK_TYPE.GUITAR,
    unavailable: true,
  }),
  Object.freeze({
    description: 'Shape a dedicated bass signal chain',
    icon: MusicNoteIcon,
    label: 'Bass',
    tone: 'blue',
    type: PROJECT_ADD_TRACK_TYPE.BASS,
    unavailable: true,
  }),
])
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <UiButton class="project-add-track__trigger" size="small" variant="secondary">
        <template #leading>
          <UiIcon :icon="AddIcon" :size="16" />
        </template>
        Add track
      </UiButton>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        as-child
        prioritize-position
        align="start"
        :side-offset="8"
        :collision-padding="8"
      >
        <UiMenuSurface class="project-add-track">
          <DropdownMenuLabel as-child>
            <div class="project-add-track__heading">
              <strong>Add track</strong>
              <span>Choose a musical source</span>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuItem
            v-for="option in ADD_TRACK_OPTIONS"
            :key="option.type"
            as-child
            @select="emit('select', option.type)"
          >
            <div class="project-add-track__option">
              <span
                class="project-add-track__option-icon"
                :class="`project-add-track__option-icon--${option.tone}`"
                aria-hidden="true"
              >
                <UiIcon :icon="option.icon" :size="24" />
              </span>
              <span class="project-add-track__option-copy">
                <span class="project-add-track__option-title">
                  <strong>{{ option.label }}</strong>
                  <span v-if="option.unavailable">Soon</span>
                </span>
                <span>{{ option.description }}</span>
              </span>
            </div>
          </DropdownMenuItem>
        </UiMenuSurface>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.project-add-track {
  inline-size: 22rem;
}

.project-add-track__heading {
  display: grid;
  gap: var(--sd-space-1);
  padding: var(--sd-space-3) var(--sd-space-3) var(--sd-space-4);
}

.project-add-track__heading strong {
  font-size: var(--sd-font-size-lg);
}

.project-add-track__heading span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-add-track__option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sd-space-3);
  align-items: center;
  min-block-size: 4rem;
  padding: var(--sd-space-2);
  border-radius: var(--sd-radius-md);
  outline: none;
  cursor: pointer;
}

.project-add-track__option:is(:hover, :focus) {
  background: var(--sd-color-control-ghost-hover);
}

.project-add-track__option-icon {
  display: grid;
  inline-size: var(--sd-control-height-md);
  block-size: var(--sd-control-height-md);
  place-items: center;
  border: 1px solid color-mix(in srgb, currentcolor 38%, transparent);
  border-radius: var(--sd-radius-md);
  background: color-mix(in srgb, currentcolor 14%, var(--sd-color-surface-sunken));
}

.project-add-track__option-icon--red {
  color: var(--sd-color-state-record);
}

.project-add-track__option-icon--green {
  color: var(--sd-color-state-success);
}

.project-add-track__option-icon--gold {
  color: var(--sd-color-state-warning);
}

.project-add-track__option-icon--violet {
  color: var(--sd-color-border-focus);
}

.project-add-track__option-icon--cyan,
.project-add-track__option-icon--blue {
  color: var(--sd-color-state-info);
}

.project-add-track__option-copy {
  display: grid;
  gap: var(--sd-space-1);
  min-inline-size: 0;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-tight);
}

.project-add-track__option-title {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
}

.project-add-track__option-title strong {
  overflow: hidden;
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-add-track__option-title > span {
  padding: var(--sd-space-0-5) var(--sd-space-2);
  border-radius: var(--sd-radius-pill);
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-control-secondary);
  font-size: var(--sd-font-size-xs);
}
</style>
