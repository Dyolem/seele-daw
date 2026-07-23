<script setup lang="ts">
import AddIcon from '~icons/fluent/add-20-regular'
import ArrowRedoIcon from '~icons/fluent/arrow-redo-20-regular'
import ArrowRepeatIcon from '~icons/fluent/arrow-repeat-all-20-regular'
import ArrowUndoIcon from '~icons/fluent/arrow-undo-20-regular'
import DismissIcon from '~icons/fluent/dismiss-16-regular'
import FolderOpenIcon from '~icons/fluent/folder-open-20-regular'
import FullScreenMaximizeIcon from '~icons/fluent/full-screen-maximize-16-regular'
import FullScreenMinimizeIcon from '~icons/fluent/full-screen-minimize-16-regular'
import GridIcon from '~icons/fluent/grid-20-regular'
import MenuIcon from '~icons/fluent/line-horizontal-3-20-regular'
import MaximizeIcon from '~icons/fluent/maximize-16-regular'
import MidiIcon from '~icons/fluent/midi-24-regular'
import MoreIcon from '~icons/fluent/more-horizontal-20-regular'
import MusicNoteIcon from '~icons/fluent/music-note-2-20-regular'
import OptionsIcon from '~icons/fluent/options-20-regular'
import PanelBottomIcon from '~icons/fluent/panel-bottom-20-regular'
import PlayIcon from '~icons/fluent/play-20-regular'
import PreviousIcon from '~icons/fluent/previous-20-regular'
import RecordIcon from '~icons/fluent/record-20-regular'
import SaveIcon from '~icons/fluent/save-20-regular'
import SpeakerIcon from '~icons/fluent/speaker-2-20-regular'
import MinimizeIcon from '~icons/fluent/subtract-16-regular'
import ZoomInIcon from '~icons/fluent/zoom-in-20-regular'
import ZoomOutIcon from '~icons/fluent/zoom-out-20-regular'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
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

const WORKBENCH_DOCK_MODE = {
  CLOSED: 'closed',
  DOCKED: 'docked',
  FULLSCREEN: 'fullscreen',
  MINIMIZED: 'minimized',
} as const

type WorkbenchDockMode = (typeof WORKBENCH_DOCK_MODE)[keyof typeof WORKBENCH_DOCK_MODE]

interface ProjectWorkbenchShellProps {
  readonly canRedo: boolean
  readonly canUndo: boolean
  readonly isDirty: boolean
  readonly projectId: string
  readonly projectName: string
  readonly saveFailureMessage?: string | null
  readonly saveStatus: ActiveProjectSaveStatus
  readonly tempo: number
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
}

interface DockResizeInteraction {
  readonly pointerId: number
  readonly startClientY: number
  readonly startHeight: number
}

const props = withDefaults(defineProps<ProjectWorkbenchShellProps>(), {
  saveFailureMessage: null,
})
const emit = defineEmits<{
  leaveProject: []
  redo: []
  save: []
  undo: []
}>()

const workspaceElement = shallowRef<HTMLElement | null>(null)
const dockMode = shallowRef<WorkbenchDockMode>(WORKBENCH_DOCK_MODE.DOCKED)
const dockHeight = shallowRef(304)
const restoredDockHeight = shallowRef(304)
const isDockMaximized = shallowRef(false)
let resizeInteraction: DockResizeInteraction | null = null

const isSaving = computed(() => props.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING)
const canSave = computed(() => props.isDirty && !isSaving.value)
const isDockOpen = computed(() => dockMode.value !== WORKBENCH_DOCK_MODE.CLOSED)
const workspaceStyle = computed(() => ({
  '--project-workbench-dock-height': `${dockHeight.value}px`,
}))
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

function openDock(): void {
  if (dockMode.value === WORKBENCH_DOCK_MODE.CLOSED) {
    dockMode.value = WORKBENCH_DOCK_MODE.DOCKED
    setDockHeight(restoredDockHeight.value)
    isDockMaximized.value = false
    return
  }

  if (dockMode.value === WORKBENCH_DOCK_MODE.MINIMIZED) restoreDock()
}

function closeDock(): void {
  if (dockMode.value === WORKBENCH_DOCK_MODE.DOCKED) {
    restoredDockHeight.value = dockHeight.value
  }
  resizeInteraction = null
  dockMode.value = WORKBENCH_DOCK_MODE.CLOSED
}

function minimizeDock(): void {
  if (dockMode.value === WORKBENCH_DOCK_MODE.MINIMIZED) {
    restoreDock()
    return
  }

  if (dockMode.value === WORKBENCH_DOCK_MODE.FULLSCREEN) {
    exitDockFullscreen()
  }
  restoredDockHeight.value = dockHeight.value
  resizeInteraction = null
  dockMode.value = WORKBENCH_DOCK_MODE.MINIMIZED
}

function restoreDock(): void {
  dockMode.value = WORKBENCH_DOCK_MODE.DOCKED
  setDockHeight(restoredDockHeight.value)
  isDockMaximized.value = false
}

function toggleDockMaximized(): void {
  if (dockMode.value !== WORKBENCH_DOCK_MODE.DOCKED) return

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
  if (dockMode.value === WORKBENCH_DOCK_MODE.FULLSCREEN) {
    exitDockFullscreen()
    return
  }

  if (dockMode.value === WORKBENCH_DOCK_MODE.DOCKED) {
    restoredDockHeight.value = dockHeight.value
  }
  resizeInteraction = null
  dockMode.value = WORKBENCH_DOCK_MODE.FULLSCREEN
}

function exitDockFullscreen(): void {
  dockMode.value = WORKBENCH_DOCK_MODE.DOCKED
  setDockHeight(restoredDockHeight.value)
  isDockMaximized.value = false
}

function startDockResize(event: PointerEvent): void {
  if (dockMode.value !== WORKBENCH_DOCK_MODE.DOCKED || event.button !== 0) return

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

onMounted(() => {
  setDockHeight(dockHeight.value)
})

onUnmounted(() => {
  resizeInteraction = null
})
</script>

<template>
  <div class="project-workbench">
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
              <DropdownMenuSeparator class="project-workbench__menu-separator" />
              <DropdownMenuLabel class="project-workbench__menu-label"> View </DropdownMenuLabel>
              <DropdownMenuItem class="project-workbench__menu-item" @select="openDock">
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
          :pressed="isDockOpen"
          @click="openDock"
        />
      </div>
    </section>

    <main class="project-workbench__main">
      <section class="project-workbench__compact-warning">
        <UiIcon :icon="OptionsIcon" :size="24" />
        <p>Seele Studio’s editing workspace requires a viewport at least 900 px wide.</p>
        <UiButton variant="secondary" @click="emit('leaveProject')">Back to projects</UiButton>
      </section>

      <section
        ref="workspaceElement"
        class="project-workbench__workspace"
        :data-dock-mode="dockMode"
        :style="workspaceStyle"
        aria-label="Project workbench"
      >
        <div
          v-if="dockMode !== WORKBENCH_DOCK_MODE.FULLSCREEN"
          class="project-workbench__arrangement-layout"
        >
          <aside class="project-workbench__track-panel" aria-label="Tracks">
            <header class="project-workbench__track-heading">
              <strong>Tracks</strong>
              <UiIconButton
                disabled
                :icon="MoreIcon"
                label="Track options — track editing is not available"
                size="small"
              />
            </header>
            <div class="project-workbench__track-actions">
              <UiButton disabled size="small" variant="secondary">
                <template #leading>
                  <UiIcon :icon="AddIcon" :size="16" />
                </template>
                Add track
              </UiButton>
            </div>
            <div class="project-workbench__track-empty">
              <span>
                <UiIcon :icon="MusicNoteIcon" :size="20" />
              </span>
              <strong>No tracks yet</strong>
              <p>Track creation will arrive with the Arrangement editor.</p>
            </div>
          </aside>

          <section class="project-workbench__arrangement" aria-label="Arrangement host">
            <header class="project-workbench__ruler">
              <ol aria-label="Timeline bars">
                <li v-for="bar in 8" :key="bar">{{ bar }}</li>
              </ol>
              <div class="project-workbench__arrangement-tools">
                <UiIconButton
                  disabled
                  :icon="GridIcon"
                  label="Grid settings — Arrangement is not available"
                  size="small"
                />
                <UiIconButton
                  disabled
                  :icon="ZoomOutIcon"
                  label="Zoom out — Arrangement is not available"
                  size="small"
                />
                <UiIconButton
                  disabled
                  :icon="ZoomInIcon"
                  label="Zoom in — Arrangement is not available"
                  size="small"
                />
              </div>
            </header>
            <div class="project-workbench__arrangement-host">
              <div class="project-workbench__surface-empty">
                <span><UiIcon :icon="GridIcon" :size="24" /></span>
                <strong>Arrangement</strong>
                <p>The editor surface will be composed here in the next product slice.</p>
              </div>
            </div>
          </section>
        </div>

        <div
          v-if="dockMode === WORKBENCH_DOCK_MODE.DOCKED"
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

        <section
          v-if="dockMode !== WORKBENCH_DOCK_MODE.CLOSED"
          class="project-workbench__dock"
          aria-label="Context editor dock"
        >
          <aside class="project-workbench__inspector">
            <header>
              <UiIcon :icon="OptionsIcon" :size="20" />
              <strong>Editor tools</strong>
            </header>
            <div v-if="dockMode !== WORKBENCH_DOCK_MODE.MINIMIZED">
              <span><UiIcon :icon="MidiIcon" :size="24" /></span>
              <strong>No clip selected</strong>
              <p>Clip properties and tools will appear here.</p>
            </div>
          </aside>

          <section class="project-workbench__context-editor" aria-label="MIDI editor host">
            <header class="project-workbench__dock-heading">
              <div>
                <UiIcon :icon="MidiIcon" :size="20" />
                <strong>MIDI editor</strong>
                <span>No selection</span>
              </div>
              <div class="project-workbench__dock-controls">
                <UiIconButton
                  :icon="MinimizeIcon"
                  :label="
                    dockMode === WORKBENCH_DOCK_MODE.MINIMIZED
                      ? 'Restore MIDI editor'
                      : 'Minimize MIDI editor'
                  "
                  size="small"
                  @click="minimizeDock"
                />
                <UiIconButton
                  v-if="dockMode === WORKBENCH_DOCK_MODE.DOCKED"
                  :icon="MaximizeIcon"
                  :label="isDockMaximized ? 'Restore MIDI editor height' : 'Maximize MIDI editor'"
                  size="small"
                  @click="toggleDockMaximized"
                />
                <UiIconButton
                  :icon="
                    dockMode === WORKBENCH_DOCK_MODE.FULLSCREEN
                      ? FullScreenMinimizeIcon
                      : FullScreenMaximizeIcon
                  "
                  :label="
                    dockMode === WORKBENCH_DOCK_MODE.FULLSCREEN
                      ? 'Exit workspace fullscreen'
                      : 'Open MIDI editor in workspace fullscreen'
                  "
                  size="small"
                  @click="toggleDockFullscreen"
                />
                <UiIconButton
                  :icon="DismissIcon"
                  label="Close MIDI editor"
                  size="small"
                  @click="closeDock"
                />
              </div>
            </header>

            <div
              v-if="dockMode !== WORKBENCH_DOCK_MODE.MINIMIZED"
              class="project-workbench__context-host"
            >
              <div class="project-workbench__surface-empty">
                <span><UiIcon :icon="MidiIcon" :size="24" /></span>
                <strong>Select a MIDI clip to edit</strong>
                <p>The Piano Roll will mount in this region without changing the Shell layout.</p>
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  </div>
</template>

<style scoped>
.project-workbench {
  --project-workbench-track-width: 16.25rem;
  --project-workbench-ruler-height: 2rem;
  display: grid;
  min-block-size: 100vh;
  block-size: 100vh;
  grid-template-rows: 3.25rem 3rem minmax(0, 1fr);
  overflow: hidden;
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-workspace);
}

.project-workbench__global-bar,
.project-workbench__transport {
  display: grid;
  align-items: center;
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-workbench__global-bar {
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  padding-inline: var(--sd-space-3);
  background: linear-gradient(
    to bottom,
    var(--sd-color-surface-raised),
    var(--sd-color-surface-panel)
  );
}

.project-workbench__global-start,
.project-workbench__global-actions,
.project-workbench__transport-start,
.project-workbench__transport-end,
.project-workbench__control-group,
.project-workbench__playback-group,
.project-workbench__meter-group {
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

.project-workbench__transport {
  position: relative;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  padding-inline: var(--sd-space-3);
  background: var(--sd-color-surface-panel);
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

.project-workbench__main,
.project-workbench__workspace {
  min-block-size: 0;
}

.project-workbench__workspace {
  display: grid;
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

.project-workbench__arrangement-layout,
.project-workbench__dock {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
}

.project-workbench__arrangement-layout {
  grid-row: 1;
}

.project-workbench__track-panel,
.project-workbench__inspector {
  min-block-size: 0;
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-panel {
  display: grid;
  grid-template-rows: var(--project-workbench-ruler-height) auto minmax(0, 1fr);
}

.project-workbench__track-heading,
.project-workbench__ruler,
.project-workbench__inspector > header,
.project-workbench__dock-heading {
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--sd-space-3) var(--sd-space-1);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-actions {
  padding: var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-workbench__track-actions :deep(.ui-button) {
  inline-size: 100%;
}

.project-workbench__track-empty,
.project-workbench__inspector > div {
  display: grid;
  min-block-size: 0;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-5);
  color: var(--sd-color-text-muted);
  text-align: center;
}

.project-workbench__track-empty > span,
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

.project-workbench__track-empty strong,
.project-workbench__inspector > div strong,
.project-workbench__surface-empty strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-empty p,
.project-workbench__inspector > div p,
.project-workbench__surface-empty p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__arrangement {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-rows: var(--project-workbench-ruler-height) minmax(0, 1fr);
  background: var(--sd-color-surface-canvas);
}

.project-workbench__ruler {
  position: relative;
  min-inline-size: 0;
}

.project-workbench__ruler ol {
  display: grid;
  block-size: 100%;
  grid-template-columns: repeat(8, minmax(5rem, 1fr));
  min-inline-size: 40rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-workbench__ruler li {
  padding: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-tools {
  position: absolute;
  inset-block-start: var(--sd-space-0-5);
  inset-inline-end: var(--sd-space-2);
  display: flex;
  gap: var(--sd-space-0-5);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  background: var(--sd-color-surface-panel);
}

.project-workbench__arrangement-host,
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

.project-workbench__dock {
  grid-row: 3;
  overflow: hidden;
  border-top: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-workspace);
}

.project-workbench__workspace[data-dock-mode='fullscreen'] .project-workbench__dock {
  grid-row: 1;
  border-top: 0;
}

.project-workbench__inspector {
  display: grid;
  grid-template-rows: 2.75rem minmax(0, 1fr);
}

.project-workbench__inspector > header,
.project-workbench__dock-heading {
  display: flex;
  align-items: center;
  min-inline-size: 0;
  block-size: 2.75rem;
}

.project-workbench__inspector > header {
  gap: var(--sd-space-2);
  padding-inline: var(--sd-space-3);
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
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

.project-workbench__workspace[data-dock-mode='minimized'] .project-workbench__inspector,
.project-workbench__workspace[data-dock-mode='minimized'] .project-workbench__context-editor {
  grid-template-rows: 2.75rem;
}

.project-workbench__compact-warning {
  display: none;
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
  .project-workbench {
    --project-workbench-track-width: 13.75rem;
  }

  .project-workbench__brand strong,
  .project-workbench__output-level span {
    display: none;
  }

  .project-workbench__project-identity {
    min-inline-size: 13rem;
  }
}

@media (max-width: 56.1875rem) {
  .project-workbench {
    grid-template-rows: 3.25rem minmax(0, 1fr);
  }

  .project-workbench__global-bar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .project-workbench__transport,
  .project-workbench__workspace {
    display: none;
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

  .project-workbench__compact-warning {
    display: grid;
    block-size: 100%;
    place-items: center;
    align-content: center;
    gap: var(--sd-space-4);
    padding: var(--sd-space-8);
    color: var(--sd-color-text-secondary);
    text-align: center;
    background: var(--sd-color-surface-workspace);
  }

  .project-workbench__compact-warning p {
    max-inline-size: 28rem;
    margin: 0;
    line-height: var(--sd-line-height-relaxed);
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(.project-workbench__menu) {
    animation: none;
  }
}
</style>
