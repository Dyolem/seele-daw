<script setup lang="ts">
import DismissIcon from '~icons/fluent/dismiss-16-regular'
import FullScreenMaximizeIcon from '~icons/fluent/full-screen-maximize-16-regular'
import FullScreenMinimizeIcon from '~icons/fluent/full-screen-minimize-16-regular'
import MaximizeIcon from '~icons/fluent/maximize-16-regular'
import MidiIcon from '~icons/fluent/midi-24-regular'
import OptionsIcon from '~icons/fluent/options-20-regular'
import MinimizeIcon from '~icons/fluent/subtract-16-regular'

import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import {
  PROJECT_WORKBENCH_DOCK_MODE,
  type ProjectWorkbenchDockMode,
} from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'

interface ProjectWorkbenchContextEditorDockProps {
  readonly dockMode: ProjectWorkbenchDockMode
  readonly isMaximized: boolean
  readonly selectedTrack: ProjectTrackPresentation | null
}

const props = defineProps<ProjectWorkbenchContextEditorDockProps>()
const emit = defineEmits<{
  close: []
  minimize: []
  toggleFullscreen: []
  toggleMaximized: []
}>()
</script>

<template>
  <section
    class="project-workbench__dock"
    :data-dock-mode="props.dockMode"
    aria-label="Context editor dock"
  >
    <aside class="project-workbench__inspector">
      <header>
        <UiIcon :icon="OptionsIcon" :size="20" />
        <strong>{{ props.selectedTrack ? 'Track inspector' : 'Editor tools' }}</strong>
      </header>
      <div v-if="props.dockMode !== PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED">
        <span><UiIcon :icon="MidiIcon" :size="24" /></span>
        <strong>{{ props.selectedTrack?.name ?? 'No track selected' }}</strong>
        <p v-if="props.selectedTrack">
          {{ props.selectedTrack.kind === 'instrument' ? 'Instrument' : 'Audio' }} track selected.
          Track properties will appear here as editing capabilities arrive.
        </p>
        <p v-else>Select a track to inspect its editing context.</p>
      </div>
    </aside>

    <section class="project-workbench__context-editor" aria-label="MIDI editor host">
      <header class="project-workbench__dock-heading">
        <div>
          <UiIcon :icon="MidiIcon" :size="20" />
          <strong>MIDI editor</strong>
          <span>{{ props.selectedTrack?.name ?? 'No selection' }}</span>
        </div>
        <div class="project-workbench__dock-controls">
          <UiIconButton
            :icon="MinimizeIcon"
            :label="
              props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED
                ? 'Restore MIDI editor'
                : 'Minimize MIDI editor'
            "
            size="small"
            @click="emit('minimize')"
          />
          <UiIconButton
            v-if="props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.DOCKED"
            :icon="MaximizeIcon"
            :label="props.isMaximized ? 'Restore MIDI editor height' : 'Maximize MIDI editor'"
            size="small"
            @click="emit('toggleMaximized')"
          />
          <UiIconButton
            :icon="
              props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN
                ? FullScreenMinimizeIcon
                : FullScreenMaximizeIcon
            "
            :label="
              props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN
                ? 'Exit workspace fullscreen'
                : 'Open MIDI editor in workspace fullscreen'
            "
            size="small"
            @click="emit('toggleFullscreen')"
          />
          <UiIconButton
            :icon="DismissIcon"
            label="Close MIDI editor"
            size="small"
            @click="emit('close')"
          />
        </div>
      </header>

      <div
        v-if="props.dockMode !== PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED"
        class="project-workbench__context-host"
      >
        <div class="project-workbench__surface-empty">
          <span><UiIcon :icon="MidiIcon" :size="24" /></span>
          <strong>{{ props.selectedTrack ? 'No MIDI clip selected' : 'Select a track' }}</strong>
          <p v-if="props.selectedTrack">
            Add or select a MIDI clip on {{ props.selectedTrack.name }} to open the Piano Roll.
          </p>
          <p v-else>Select an instrument track before creating a MIDI clip.</p>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.project-workbench__dock {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 3;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
  overflow: hidden;
  border-top: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-workspace);
}

.project-workbench__dock[data-dock-mode='fullscreen'] {
  grid-row: 1;
  border-top: 0;
}

.project-workbench__inspector {
  display: grid;
  min-block-size: 0;
  grid-template-rows: 2.75rem minmax(0, 1fr);
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__inspector > header,
.project-workbench__dock-heading {
  display: flex;
  align-items: center;
  min-inline-size: 0;
  block-size: 2.75rem;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__inspector > header {
  gap: var(--sd-space-2);
  padding-inline: var(--sd-space-3);
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__inspector > div {
  display: grid;
  min-block-size: 0;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-5);
  color: var(--sd-color-text-muted);
  text-align: center;
}

.project-workbench__inspector > div > span,
.project-workbench__surface-empty > span {
  display: grid;
  inline-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  block-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  margin-bottom: var(--sd-space-3);
  place-items: center;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__inspector > div strong,
.project-workbench__surface-empty strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__inspector > div p,
.project-workbench__surface-empty p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__context-editor {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-rows: 2.75rem minmax(0, 1fr);
}

.project-workbench__dock-heading {
  justify-content: space-between;
  padding-inline: var(--sd-space-3) var(--sd-space-2);
}

.project-workbench__dock-heading > div,
.project-workbench__dock-controls {
  display: flex;
  align-items: center;
}

.project-workbench__dock-heading > div:first-child {
  gap: var(--sd-space-2);
  min-inline-size: 0;
}

.project-workbench__dock-heading strong {
  font-size: var(--sd-font-size-sm);
}

.project-workbench__dock-heading span {
  padding-inline-start: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__dock-controls {
  gap: var(--sd-space-0-5);
}

.project-workbench__context-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background:
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    var(--sd-color-surface-canvas);
  background-size: calc(100% / 8) 100%;
}

.project-workbench__surface-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-6);
  color: var(--sd-color-text-muted);
  text-align: center;
}

.project-workbench__dock[data-dock-mode='minimized'] .project-workbench__inspector,
.project-workbench__dock[data-dock-mode='minimized'] .project-workbench__context-editor {
  grid-template-rows: 2.75rem;
}
</style>
