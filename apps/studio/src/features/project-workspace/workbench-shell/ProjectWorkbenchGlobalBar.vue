<script setup lang="ts">
import FolderOpenIcon from '~icons/fluent/folder-open-20-regular'
import MenuIcon from '~icons/fluent/line-horizontal-3-20-regular'
import MidiIcon from '~icons/fluent/midi-20-regular'
import PanelBottomIcon from '~icons/fluent/panel-bottom-20-regular'
import SaveIcon from '~icons/fluent/save-20-regular'
import { computed } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'

import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import {
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectSaveStatus,
} from '@/workbench/project/active-project-state'

interface ProjectWorkbenchGlobalBarProps {
  readonly isDirty: boolean
  readonly isMidiImporting?: boolean
  readonly projectId: string
  readonly projectName: string
  readonly saveFailureMessage?: string | null
  readonly saveStatus: ActiveProjectSaveStatus
}

const props = withDefaults(defineProps<ProjectWorkbenchGlobalBarProps>(), {
  isMidiImporting: false,
  saveFailureMessage: null,
})
const emit = defineEmits<{
  importMidiAsNewProject: []
  importMidiAsNewTracks: []
  leaveProject: []
  openContextEditor: []
  save: []
}>()

const isSaving = computed(() => props.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING)
const canSave = computed(() => props.isDirty && !isSaving.value)
const saveStatusLabel = computed(() => {
  if (isSaving.value) return 'Saving…'
  if (props.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.FAILED) return 'Couldn’t save'
  return props.isDirty ? 'Unsaved changes' : 'Saved'
})
const saveActionLabel = computed(() =>
  props.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.FAILED ? 'Retry save' : 'Save',
)
const saveStatusTitle = computed(
  () => props.saveFailureMessage ?? `${props.projectName}: ${saveStatusLabel.value}`,
)
</script>

<template>
  <header class="project-workbench__global-bar">
    <div class="project-workbench__global-start">
      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <UiIconButton :icon="MenuIcon" label="Open project menu" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="project-workbench__menu" align="start" :side-offset="8">
            <DropdownMenuLabel class="project-workbench__menu-label"> Project </DropdownMenuLabel>
            <DropdownMenuItem class="project-workbench__menu-item" @select="emit('leaveProject')">
              <UiIcon :icon="FolderOpenIcon" :size="20" />
              <span>Projects</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="project-workbench__menu-item"
              :disabled="!canSave"
              @select="emit('save')"
            >
              <UiIcon :icon="SaveIcon" :size="20" />
              <span>{{ saveActionLabel }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="project-workbench__menu-item"
              :disabled="props.isMidiImporting"
              @select="emit('importMidiAsNewProject')"
            >
              <UiIcon :icon="MidiIcon" :size="20" />
              <span>
                {{ props.isMidiImporting ? 'Importing MIDI…' : 'Import MIDI as new project…' }}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="project-workbench__menu-item"
              :disabled="props.isMidiImporting"
              @select="emit('importMidiAsNewTracks')"
            >
              <UiIcon :icon="MidiIcon" :size="20" />
              <span>
                {{ props.isMidiImporting ? 'Importing MIDI…' : 'Import MIDI as new tracks…' }}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator class="project-workbench__menu-separator" />
            <DropdownMenuLabel class="project-workbench__menu-label"> View </DropdownMenuLabel>
            <DropdownMenuItem
              class="project-workbench__menu-item"
              @select="emit('openContextEditor')"
            >
              <UiIcon :icon="PanelBottomIcon" :size="20" />
              <span>MIDI editor</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <div class="project-workbench__brand" aria-label="Seele Studio">
        <span aria-hidden="true">S</span>
        <strong>SEELE</strong>
      </div>
    </div>

    <div class="project-workbench__project-identity" :title="props.projectId">
      <h1>{{ props.projectName }}</h1>
      <span>Local project</span>
    </div>

    <div class="project-workbench__global-actions">
      <div
        class="project-workbench__save-status"
        :class="{
          'project-workbench__save-status--dirty': props.isDirty,
          'project-workbench__save-status--failed':
            props.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.FAILED,
        }"
        :title="saveStatusTitle"
        role="status"
      >
        <span aria-hidden="true"></span>
        {{ saveStatusLabel }}
      </div>
      <UiButton
        class="project-workbench__save"
        size="small"
        variant="secondary"
        :busy="isSaving"
        :disabled="!canSave"
        @click="emit('save')"
      >
        <template #leading>
          <UiIcon :icon="SaveIcon" :size="16" />
        </template>
        {{ saveActionLabel }}
      </UiButton>
    </div>
  </header>
</template>

<style scoped>
.project-workbench__global-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding-inline: var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
  background: linear-gradient(
    to bottom,
    var(--sd-color-surface-raised),
    var(--sd-color-surface-panel)
  );
}

.project-workbench__global-start,
.project-workbench__global-actions {
  display: flex;
  align-items: center;
}

.project-workbench__global-start {
  gap: var(--sd-space-3);
  justify-self: start;
}

.project-workbench__brand {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.18em;
}

.project-workbench__brand > span {
  display: grid;
  inline-size: var(--sd-control-height-sm);
  block-size: var(--sd-control-height-sm);
  place-items: center;
  border: 1px solid var(--sd-color-border-focus);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
  font-family: var(--sd-font-family-numeric);
}

.project-workbench__project-identity {
  display: grid;
  min-inline-size: 18rem;
  justify-items: center;
  line-height: var(--sd-line-height-tight);
}

.project-workbench__project-identity h1 {
  max-inline-size: min(32rem, 42vw);
  margin: 0;
  overflow: hidden;
  font-size: var(--sd-font-size-md);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-workbench__project-identity span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__global-actions {
  gap: var(--sd-space-3);
  justify-self: end;
}

.project-workbench__save-status {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  white-space: nowrap;
}

.project-workbench__save-status > span {
  inline-size: var(--sd-space-2);
  block-size: var(--sd-space-2);
  border-radius: var(--sd-radius-pill);
  background: var(--sd-color-state-success);
}

.project-workbench__save-status--dirty {
  color: var(--sd-color-text-secondary);
}

.project-workbench__save-status--dirty > span {
  background: var(--sd-color-state-warning);
}

.project-workbench__save-status--failed {
  color: var(--sd-color-control-danger-text);
}

.project-workbench__save-status--failed > span {
  background: var(--sd-color-state-danger);
}

:global(.project-workbench__menu) {
  z-index: var(--sd-layer-popover);
  min-inline-size: 14rem;
  padding: var(--sd-space-2);
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-lg);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-overlay);
  box-shadow: var(--sd-shadow-overlay);
  outline: none;
  animation: project-workbench-menu-in var(--sd-motion-duration-fast)
    var(--sd-motion-easing-standard);
}

:global(.project-workbench__menu-label) {
  padding: var(--sd-space-2) var(--sd-space-3);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

:global(.project-workbench__menu-item) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sd-space-3);
  align-items: center;
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
  outline: none;
  cursor: pointer;
}

:global(.project-workbench__menu-item[data-highlighted]) {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-ghost-hover);
}

:global(.project-workbench__menu-item[data-disabled]) {
  color: var(--sd-color-text-disabled);
  cursor: not-allowed;
}

:global(.project-workbench__menu-separator) {
  block-size: 1px;
  margin: var(--sd-space-2);
  background: var(--sd-color-border-subtle);
}

@keyframes project-workbench-menu-in {
  from {
    opacity: 0;
    transform: translateY(calc(var(--sd-space-1) * -1));
  }
}

@media (max-width: 71.9375rem) {
  .project-workbench__brand strong {
    display: none;
  }

  .project-workbench__project-identity {
    min-inline-size: 13rem;
  }
}

@media (max-width: 56.1875rem) {
  .project-workbench__global-bar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .project-workbench__project-identity {
    min-inline-size: 0;
  }

  .project-workbench__project-identity h1 {
    max-inline-size: 40vw;
  }

  .project-workbench__save-status {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(.project-workbench__menu) {
    animation: none;
  }
}
</style>
