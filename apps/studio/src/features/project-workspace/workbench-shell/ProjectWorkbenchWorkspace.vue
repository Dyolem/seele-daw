<script setup lang="ts">
import type { ProjectSession, Tick } from '@seele-daw/project-core'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'

import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import ProjectWorkbenchArrangement from '@/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue'
import ProjectWorkbenchContextEditorDock from '@/features/project-workspace/workbench-shell/ProjectWorkbenchContextEditorDock.vue'
import {
  PROJECT_WORKBENCH_DOCK_MODE,
  type ProjectWorkbenchDockMode,
  type ProjectWorkbenchWorkspaceHandle,
} from '@/features/project-workspace/workbench-shell/project-workbench-dock'

interface DockResizeInteraction {
  readonly pointerId: number
  readonly startClientY: number
  readonly startHeight: number
}

const props = defineProps<{
  readonly barSpanTick: Tick
  readonly clips: readonly ProjectMidiClipPresentation[]
  readonly pianoRollPresentation: ProjectPianoRollPresentation | null
  readonly pianoRollTrackPresentation: ProjectPianoRollTrackPresentation | null
  readonly projectId: string
  readonly projectSession: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly timeSignatureNumerator: number
  readonly timelineEndTick: Tick
  readonly tracks: readonly ProjectTrackPresentation[]
}>()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const emit = defineEmits<{
  contextEditorOpenChange: [isOpen: boolean]
}>()

const workspaceElement = shallowRef<HTMLElement | null>(null)
const dockMode = shallowRef<ProjectWorkbenchDockMode>(PROJECT_WORKBENCH_DOCK_MODE.DOCKED)
const dockHeight = shallowRef(304)
const restoredDockHeight = shallowRef(304)
const isDockMaximized = shallowRef(false)
let resizeInteraction: DockResizeInteraction | null = null

const isContextEditorOpen = computed(() => dockMode.value !== PROJECT_WORKBENCH_DOCK_MODE.CLOSED)
const selectedTrack = computed(
  () => props.tracks.find((track) => track.id === workbenchSelection.selectedTrackId) ?? null,
)
const selectedClip = computed(
  () => props.clips.find((clip) => clip.id === workbenchSelection.selectedClipId) ?? null,
)
const workspaceStyle = computed(() => ({
  '--project-workbench-dock-height': `${dockHeight.value}px`,
}))

function dockBounds(): { readonly maximum: number; readonly minimum: number } {
  const measuredHeight = workspaceElement.value?.clientHeight ?? 0
  const workspaceHeight = measuredHeight > 0 ? measuredHeight : 640
  const minimum = Math.min(220, workspaceHeight)
  return {
    minimum,
    maximum: Math.max(minimum, Math.floor(workspaceHeight * 0.72)),
  }
}

function setDockHeight(height: number): void {
  const { maximum, minimum } = dockBounds()
  dockHeight.value = Math.min(maximum, Math.max(minimum, Math.round(height)))
}

function openContextEditor(): void {
  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.CLOSED) {
    dockMode.value = PROJECT_WORKBENCH_DOCK_MODE.DOCKED
    setDockHeight(restoredDockHeight.value)
    isDockMaximized.value = false
    return
  }

  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED) restoreDock()
}

function closeDock(): void {
  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.DOCKED) {
    restoredDockHeight.value = dockHeight.value
  }
  resizeInteraction = null
  dockMode.value = PROJECT_WORKBENCH_DOCK_MODE.CLOSED
}

function minimizeDock(): void {
  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED) {
    restoreDock()
    return
  }

  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN) {
    exitDockFullscreen()
  }
  restoredDockHeight.value = dockHeight.value
  resizeInteraction = null
  dockMode.value = PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED
}

function restoreDock(): void {
  dockMode.value = PROJECT_WORKBENCH_DOCK_MODE.DOCKED
  setDockHeight(restoredDockHeight.value)
  isDockMaximized.value = false
}

function toggleDockMaximized(): void {
  if (dockMode.value !== PROJECT_WORKBENCH_DOCK_MODE.DOCKED) return

  if (isDockMaximized.value) {
    setDockHeight(restoredDockHeight.value)
    isDockMaximized.value = false
    return
  }

  restoredDockHeight.value = dockHeight.value
  setDockHeight(dockBounds().maximum)
  isDockMaximized.value = true
}

function toggleDockFullscreen(): void {
  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN) {
    exitDockFullscreen()
    return
  }

  if (dockMode.value === PROJECT_WORKBENCH_DOCK_MODE.DOCKED) {
    restoredDockHeight.value = dockHeight.value
  }
  resizeInteraction = null
  dockMode.value = PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN
}

function exitDockFullscreen(): void {
  dockMode.value = PROJECT_WORKBENCH_DOCK_MODE.DOCKED
  setDockHeight(restoredDockHeight.value)
  isDockMaximized.value = false
}

function startDockResize(event: PointerEvent): void {
  if (dockMode.value !== PROJECT_WORKBENCH_DOCK_MODE.DOCKED || event.button !== 0) return

  resizeInteraction = {
    pointerId: event.pointerId,
    startClientY: event.clientY,
    startHeight: dockHeight.value,
  }
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function continueDockResize(event: PointerEvent): void {
  if (resizeInteraction?.pointerId !== event.pointerId) return

  setDockHeight(resizeInteraction.startHeight + resizeInteraction.startClientY - event.clientY)
  isDockMaximized.value = false
  event.preventDefault()
}

function finishDockResize(event: PointerEvent): void {
  if (resizeInteraction?.pointerId !== event.pointerId) return

  restoredDockHeight.value = dockHeight.value
  resizeInteraction = null
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}

function handleSplitterKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      setDockHeight(dockHeight.value - 16)
      isDockMaximized.value = false
      break
    case 'ArrowUp':
      setDockHeight(dockHeight.value + 16)
      isDockMaximized.value = false
      break
    case 'End':
      restoredDockHeight.value = dockHeight.value
      setDockHeight(dockBounds().maximum)
      isDockMaximized.value = true
      event.preventDefault()
      return
    case 'Home':
      setDockHeight(dockBounds().minimum)
      isDockMaximized.value = false
      break
    default:
      return
  }

  restoredDockHeight.value = dockHeight.value
  event.preventDefault()
}

watch(
  isContextEditorOpen,
  (isOpen) => {
    emit('contextEditorOpenChange', isOpen)
  },
  { immediate: true },
)

onMounted(() => {
  setDockHeight(dockHeight.value)
})

onUnmounted(() => {
  resizeInteraction = null
})

defineExpose<ProjectWorkbenchWorkspaceHandle>({ openContextEditor })
</script>

<template>
  <section
    ref="workspaceElement"
    class="project-workbench__workspace"
    :data-dock-mode="dockMode"
    :style="workspaceStyle"
    aria-label="Project workbench"
  >
    <ProjectWorkbenchArrangement
      v-if="dockMode !== PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN"
      :bar-span-tick="props.barSpanTick"
      :clips="props.clips"
      :project-id="props.projectId"
      :time-signature-numerator="props.timeSignatureNumerator"
      :timeline-end-tick="props.timelineEndTick"
      :tracks="props.tracks"
      @open-midi-clip="openContextEditor"
    />

    <div
      v-if="dockMode === PROJECT_WORKBENCH_DOCK_MODE.DOCKED"
      class="project-workbench__splitter"
      role="separator"
      aria-label="Resize MIDI editor"
      aria-orientation="horizontal"
      :aria-valuemin="dockBounds().minimum"
      :aria-valuemax="dockBounds().maximum"
      :aria-valuenow="dockHeight"
      tabindex="0"
      @keydown="handleSplitterKeydown"
      @pointerdown="startDockResize"
      @pointermove="continueDockResize"
      @pointerup="finishDockResize"
      @pointercancel="finishDockResize"
    >
      <span></span>
    </div>

    <ProjectWorkbenchContextEditorDock
      v-if="dockMode !== PROJECT_WORKBENCH_DOCK_MODE.CLOSED"
      :dock-mode="dockMode"
      :is-maximized="isDockMaximized"
      :piano-roll-presentation="props.pianoRollPresentation"
      :piano-roll-track-presentation="props.pianoRollTrackPresentation"
      :project-session="props.projectSession"
      :selected-clip="selectedClip"
      :selected-track="selectedTrack"
      :bar-span-tick="props.barSpanTick"
      :time-signature-numerator="props.timeSignatureNumerator"
      :timeline-end-tick="props.timelineEndTick"
      @close="closeDock"
      @minimize="minimizeDock"
      @toggle-fullscreen="toggleDockFullscreen"
      @toggle-maximized="toggleDockMaximized"
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
  grid-template-rows: minmax(13.75rem, 1fr) 0 0;
  overflow: hidden;
}

.project-workbench__workspace[data-dock-mode='docked'] {
  grid-template-rows:
    minmax(13.75rem, 1fr) var(--sd-space-3)
    var(--project-workbench-dock-height);
}

.project-workbench__workspace[data-dock-mode='minimized'] {
  grid-template-rows: minmax(13.75rem, 1fr) 0 2.75rem;
}

.project-workbench__workspace[data-dock-mode='fullscreen'] {
  grid-template-rows: minmax(0, 1fr);
}

.project-workbench__splitter {
  display: grid;
  grid-row: 2;
  place-items: center;
  border-block: 1px solid transparent;
  background: var(--sd-color-surface-sunken);
  cursor: ns-resize;
  touch-action: none;
}

.project-workbench__splitter > span {
  inline-size: 3.5rem;
  block-size: var(--sd-space-1);
  border-radius: var(--sd-radius-pill);
  background: var(--sd-color-border-default);
}

.project-workbench__splitter:hover > span,
.project-workbench__splitter:focus-visible > span {
  background: var(--sd-color-border-focus);
}

.project-workbench__splitter:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
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
