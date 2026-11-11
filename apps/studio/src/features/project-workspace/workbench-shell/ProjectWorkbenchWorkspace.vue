<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, shallowRef } from 'vue'

import { useProjectWorkbenchSelectionStore } from '@/workbench/project/project-workbench-selection-store'
import { useProjectWorkspace } from '@/features/project-workspace/project-workspace'
import ProjectWorkbenchArrangement from '@/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue'
import ProjectWorkbenchContextEditorDock from '@/features/project-workspace/workbench-shell/ProjectWorkbenchContextEditorDock.vue'
import {
  PROJECT_WORKBENCH_DOCK_MODE,
  type ProjectWorkbenchWorkspaceHandle,
} from '@/features/project-workspace/workbench-shell/project-workbench-dock'

import UiButton from '@/ui/components/UiButton.vue'
import UiHeightResizeHandle from '@/ui/components/UiHeightResizeHandle.vue'
import { useWorkspaceLayout } from './layout/use-workspace-layout'
import { WORKSPACE_MINIMUM_DOCK_HEIGHT } from './layout/workspace-layout-policy'

const { clips, tracks } = useProjectWorkspace()
const workbenchSelection = useProjectWorkbenchSelectionStore()

const workspaceElement = shallowRef<HTMLElement | null>(null)
const dock = useWorkspaceLayout(workspaceElement)
const { layout, mode: dockMode, maximized: isDockMaximized, style: workspaceStyle } = dock
const isContextEditorOpen = computed(() => dockMode.value !== PROJECT_WORKBENCH_DOCK_MODE.CLOSED)
const selectedTrack = computed(
  () => tracks.value.find((track) => track.id === workbenchSelection.selectedTrackId) ?? null,
)
const selectedClip = computed(
  () => clips.value.find((clip) => clip.id === workbenchSelection.selectedClipId) ?? null,
)
onMounted(dock.mount)
onBeforeUnmount(dock.dispose)

const midiEditor = Object.freeze({
  isOpen: () => isContextEditorOpen.value,
  open: dock.open,
})
defineExpose<ProjectWorkbenchWorkspaceHandle>({ getMidiEditor: () => midiEditor })
</script>

<template>
  <section
    ref="workspaceElement"
    class="project-workbench__workspace"
    :data-dock-mode="layout.dockMode"
    :style="workspaceStyle"
    aria-label="Project workbench"
  >
    <ProjectWorkbenchArrangement
      v-show="dockMode !== PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN && !layout.arrangementCompact"
      @pointerdown.capture="dock.activateArrangement"
      @focusin="dock.activateArrangement"
      @open-midi-clip="dock.open"
    />

    <UiButton
      v-if="layout.arrangementCompact"
      class="project-workbench__arrangement-restore"
      size="small"
      variant="ghost"
      @click="dock.activateArrangement"
    >
      Show Arrangement
    </UiButton>
    <UiHeightResizeHandle
      v-if="layout.splitterHeight > 0"
      class="project-workbench__splitter"
      label="Resize MIDI editor"
      :model-value="isDockMaximized ? layout.dockHeight : dock.preferredHeight.value"
      :minimum="WORKSPACE_MINIMUM_DOCK_HEIGHT"
      :maximum="layout.maximum"
      @update:model-value="dock.resize"
      @resize-start="dock.beginResize"
      @resize-end="dock.endResize"
    />

    <ProjectWorkbenchContextEditorDock
      v-if="dockMode !== PROJECT_WORKBENCH_DOCK_MODE.CLOSED"
      :dock-mode="layout.dockMode"
      @pointerdown.capture="dock.activateMidi"
      @focusin="dock.activateMidi"
      :is-maximized="isDockMaximized"
      :selected-clip="selectedClip"
      :selected-track="selectedTrack"
      @close="dock.close"
      @minimize="dock.toggleMinimized"
      @toggle-fullscreen="dock.toggleFullscreen"
      @toggle-maximized="dock.toggleMaximized"
    />
  </section>
</template>

<style scoped>
.project-workbench__workspace {
  --project-workbench-track-width: 16.25rem;
  --project-workbench-ruler-height: 2rem;
  --project-workbench-track-actions-height: 3.3125rem;
  --project-workbench-track-row-height: 4.75rem;
  display: grid;
  min-block-size: 0;
  block-size: 100%;
  overflow: hidden;
}

.project-workbench__splitter {
  grid-row: 2;
}
.project-workbench__arrangement-restore {
  grid-row: 1;
  justify-self: start;
  margin-inline: var(--sd-space-2);
}

@media (max-width: 71.9375rem) {
  .project-workbench__workspace {
    --project-workbench-track-width: 13.75rem;
  }
}

@media (max-width: 56.1875rem) {
  .project-workbench__workspace {
    display: none;
  }
}
</style>
