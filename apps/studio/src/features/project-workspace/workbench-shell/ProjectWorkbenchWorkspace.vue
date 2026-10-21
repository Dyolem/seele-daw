<script setup lang="ts">
import type {
  ProjectSession,
  TempoBpm,
  TempoEventId,
  TempoEventRecord,
  Tick,
} from '@seele-daw/project-core'
import { computed, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import type { StudioActionId, StudioActionSource } from '@/workbench/actions/studio-action'
import type { StudioActionControl } from '@/workbench/actions/studio-action-control'

import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/types/piano-roll-presentation'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
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

const props = withDefaults(
  defineProps<{
    readonly barSpanTick: Tick
    readonly clips: readonly ProjectMidiClipPresentation[]
    readonly midiImportAction: StudioActionControl
    readonly pianoRollPresentation: ProjectPianoRollPresentation | null
    readonly pianoRollTrackPresentation: ProjectPianoRollTrackPresentation | null
    readonly projectId: string
    readonly projectSession: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
    readonly selectedTempoEventId?: TempoEventId | null
    readonly tempoEditingDisabled?: boolean
    readonly tempoEvents?: readonly TempoEventRecord[]
    readonly timeSignatureNumerator: number
    readonly timelineEndTick: Tick
    readonly tracks: readonly ProjectTrackPresentation[]
  }>(),
  {
    selectedTempoEventId: null,
    tempoEditingDisabled: false,
    tempoEvents: () => Object.freeze([]),
  },
)
const workbenchSelection = useProjectWorkbenchSelectionStore()
const emit = defineEmits<{
  invokeAction: [actionId: StudioActionId, source: StudioActionSource]
  tempoEditStart: []
  tempoEventAdd: [bpm: TempoBpm, tick: Tick]
  tempoEventBpmCommit: [tempoEventId: TempoEventId, input: string]
  tempoEventMove: [tempoEventId: TempoEventId, tick: Tick]
  tempoEventRemove: [tempoEventId: TempoEventId]
  tempoEventSelect: [tempoEventId: TempoEventId]
}>()

const workspaceElement = shallowRef<HTMLElement | null>(null)
const dock = useWorkspaceLayout(workspaceElement)
const { layout, mode: dockMode, maximized: isDockMaximized, style: workspaceStyle } = dock
const isContextEditorOpen = computed(() => dockMode.value !== PROJECT_WORKBENCH_DOCK_MODE.CLOSED)
const selectedTrack = computed(
  () => props.tracks.find((track) => track.id === workbenchSelection.selectedTrackId) ?? null,
)
const selectedClip = computed(
  () => props.clips.find((clip) => clip.id === workbenchSelection.selectedClipId) ?? null,
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
      :bar-span-tick="props.barSpanTick"
      :clips="props.clips"
      :midi-import-action="props.midiImportAction"
      :project-id="props.projectId"
      :selected-tempo-event-id="props.selectedTempoEventId"
      :tempo-editing-disabled="props.tempoEditingDisabled"
      :tempo-events="props.tempoEvents"
      :time-signature-numerator="props.timeSignatureNumerator"
      :timeline-end-tick="props.timelineEndTick"
      :tracks="props.tracks"
      @invoke-action="(actionId, source) => emit('invokeAction', actionId, source)"
      @open-midi-clip="dock.open"
      @tempo-edit-start="emit('tempoEditStart')"
      @tempo-event-add="(bpm, tick) => emit('tempoEventAdd', bpm, tick)"
      @tempo-event-bpm-commit="
        (tempoEventId, input) => emit('tempoEventBpmCommit', tempoEventId, input)
      "
      @tempo-event-move="(tempoEventId, tick) => emit('tempoEventMove', tempoEventId, tick)"
      @tempo-event-remove="emit('tempoEventRemove', $event)"
      @tempo-event-select="emit('tempoEventSelect', $event)"
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
      :piano-roll-presentation="props.pianoRollPresentation"
      :piano-roll-track-presentation="props.pianoRollTrackPresentation"
      :project-session="props.projectSession"
      :selected-clip="selectedClip"
      :selected-track="selectedTrack"
      :bar-span-tick="props.barSpanTick"
      :time-signature-numerator="props.timeSignatureNumerator"
      :timeline-end-tick="props.timelineEndTick"
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
