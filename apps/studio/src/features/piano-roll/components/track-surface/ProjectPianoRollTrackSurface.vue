<script setup lang="ts">
import PianoRollControllerHeader from '@/features/piano-roll/components/controller-lane/PianoRollControllerHeader.vue'
import PianoRollControllerScale from '@/features/piano-roll/components/controller-lane/PianoRollControllerScale.vue'
import { useControllerLaneLayout } from '@/features/piano-roll/layout/use-controller-lane-layout'

import { computed, onMounted, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { ContextMenuRoot } from 'reka-ui'
import { createPianoRollGrid, PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS } from '@seele-daw/editor'
import {
  ZERO_TICK,
  parsePositiveTick,
  type ProjectSession,
  type Tick,
} from '@seele-daw/project-core'
import PianoRollKeyboard from '@/features/piano-roll/components/pitch-view/PianoRollKeyboard.vue'
import PianoRollPitchScrollbar from '@/features/piano-roll/components/pitch-view/PianoRollPitchScrollbar.vue'
import { usePitchViewport } from '@/features/piano-roll/viewport/use-pitch-viewport'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { PIANO_ROLL_TOOL } from '@/features/piano-roll/types/piano-roll-preferences'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import type { PianoRollSustainPedalLaneHandle } from '@/features/piano-roll/types/piano-roll-sustain-pedal'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { usePianoRollToolActions } from '@/features/piano-roll/actions/use-piano-roll-tool-actions'
import { useTrackLayout } from '@/features/piano-roll/components/track-surface/hooks/use-track-layout'
import { useTrackRendering } from '@/features/piano-roll/components/track-surface/hooks/use-track-rendering'
import { useTrackPlacement } from '@/features/piano-roll/components/track-surface/hooks/use-track-placement'
import { useTrackFollow } from '@/features/piano-roll/components/track-surface/hooks/use-track-follow'
import { useTrackActions } from '@/features/piano-roll/components/track-surface/hooks/use-track-actions'
import { useTrackSustainPedal } from '@/features/piano-roll/components/track-surface/hooks/use-track-sustain-pedal'
import TrackPlayhead from '@/features/piano-roll/playhead/TrackPlayhead.vue'
import PianoRollContextMenu from '@/features/piano-roll/actions/PianoRollContextMenu.vue'
import PianoRollSustainPedalLane from '@/features/piano-roll/components/sustain-pedal/PianoRollSustainPedalLane.vue'
import PianoRollTrackToolbar from './PianoRollTrackToolbar.vue'

interface ProjectPianoRollTrackSurfaceProps {
  readonly barSpanTick: Tick
  readonly presentation: ReadyProjectPianoRollTrackPresentation
  readonly session: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly timelineEndTick: Tick
  readonly timeSignatureNumerator: number
}
const props = defineProps<ProjectPianoRollTrackSurfaceProps>()
const pianoRollPreferences = usePianoRollPreferencesStore()
const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const canvasHost = useTemplateRef<HTMLElement>('canvasHost')
const gridCanvas = useTemplateRef<HTMLCanvasElement>('gridCanvas')
const noteHost = useTemplateRef<HTMLElement>('noteHost')
const scrollViewport = useTemplateRef<HTMLElement>('scrollViewport')
const sustainPedalLane = useTemplateRef<PianoRollSustainPedalLaneHandle>('sustainPedalLane')
const failureMessage = shallowRef<string | null>(null)
const pitchView = usePitchViewport(canvasHost)
const controllerLane = useControllerLaneLayout(surfaceElement)
const displayGrid = computed(() =>
  createPianoRollGrid({
    barSpanTick: props.barSpanTick,
    beatSpanTick: parsePositiveTick(props.barSpanTick / props.timeSignatureNumerator),
    originTick: ZERO_TICK,
    subdivisionSpanTick: pianoRollPreferences.subdivisionSpanTick,
  }),
)
const layout = useTrackLayout({
  getGeometry: () => pitchView.geometry.value,
  getPresentation: () => props.presentation,
  getTimelineEndTick: () => props.timelineEndTick,
  getBarSpanTick: () => props.barSpanTick,
})
const { timelineBars, timelineContentStyle, clipWindows, visibleNotes } = layout
const follow = useTrackFollow({
  scrollViewport,
  getProjectId: () => props.presentation.projectId,
  getTimelineEndTick: () => props.timelineEndTick,
})
const {
  isCurrentProjectPlaying,
  isTimelineFollowActive,
  timelineFollowLabel,
  toggleTimelineFollow,
  handleTimelinePointerDown,
  handleTimelineWheel,
} = follow
const {
  activeClipId,
  activateClip,
  acceptPlacedClip,
  selectActiveClip,
  handleFocusIn,
  prepareContextMenu,
} = useTrackActions({
  sustainPedalLane,
  getPresentation: () => props.presentation,
  getSession: () => props.session,
  getSustainPedalChannel: () => pianoRollPreferences.sustainPedalChannel,
  suspendTimelineFollow: follow.suspendTimelineFollow,
})
const rendering = useTrackRendering({
  surfaceElement,
  gridCanvas,
  noteHost,
  getPresentation: () => props.presentation,
  getViewport: () => layout.viewport.value,
  getVisibleNotes: () => visibleNotes.value,
  createDisplayGrid: () => displayGrid.value,
  failureMessage,
})
const placement = useTrackPlacement({
  getSession: () => props.session,
  canvasHost,
  surfaceElement,
  getViewport: () => layout.viewport.value,
  getPresentation: () => props.presentation,
  getTimelineEndTick: () => props.timelineEndTick,
  getBarSpanTick: () => props.barSpanTick,
  createDisplayGrid: () => displayGrid.value,
  activateClip,
  acceptPlacedClip,
  failureMessage,
})
const { placementPreview, previewNoteStyle, previewClipStyle, previewMessage, handleHover } =
  placement
const { sustainPedalLaneReadModel, reportSustainPedalFailure, handleSustainPedalCompleted } =
  useTrackSustainPedal({
    getPresentation: () => props.presentation,
    failureMessage,
  })
const { controls: toolControls, invoke: invokeTool } = usePianoRollToolActions({
  isFocused: () => surfaceElement.value?.contains(document.activeElement) ?? false,
  getTool: () => pianoRollPreferences.activeTool,
  activateTool: pianoRollPreferences.activateTool,
  isSnapEnabled: () => pianoRollPreferences.snapEnabled,
  toggleSnap: pianoRollPreferences.toggleSnap,
})
const accessibleStatus = computed(() => {
  if (failureMessage.value !== null) return failureMessage.value
  const clipCount = props.presentation.readModel.clips.length
  const noteCount = visibleNotes.value.length
  return `${props.presentation.name}, Track time, ${clipCount} MIDI ${clipCount === 1 ? 'clip' : 'clips'}, ${noteCount} visible ${noteCount === 1 ? 'note' : 'notes'}`
})
function handleScroll(event: Event): void {
  placement.clearPreview()
  follow.handleScroll(event)
}
function dispose(): void {
  follow.dispose()
  pitchView.dispose()
  placement.dispose()
  rendering.dispose()
  controllerLane.dispose()
}
onMounted(() => {
  try {
    controllerLane.mount()
    rendering.mount()
    placement.mount()
    pitchView.mount()
  } catch (cause) {
    dispose()
    failureMessage.value = describeCause(cause, 'The Track Piano Roll could not be composed.')
  }
})
onBeforeUnmount(dispose)
</script>

<template>
  <ContextMenuRoot>
    <PianoRollContextMenu :prepare-target="prepareContextMenu">
      <section
        ref="surfaceElement"
        class="project-piano-roll-track"
        role="region"
        :aria-label="`Track Piano Roll for ${props.presentation.name}`"
        :data-placement-status="placementPreview?.placement.status ?? 'idle'"
        :data-snap-enabled="pianoRollPreferences.snapEnabled"
        :data-tool="pianoRollPreferences.activeTool"
        :style="{
          ...controllerLane.style.value,
          '--project-piano-roll-track-pitch-height': pitchView.geometry.value
            ? `${pitchView.geometry.value.heightCssPixel}px`
            : undefined,
        }"
        tabindex="0"
        @focusin="handleFocusIn"
      >
        <PianoRollTrackToolbar
          class="project-piano-roll-track__toolbar-placement"
          :active-tool="pianoRollPreferences.activeTool"
          :controls="toolControls"
          :grid-preset="pianoRollPreferences.gridPreset"
          :snap-enabled="pianoRollPreferences.snapEnabled"
          :active-clip-id="activeClipId"
          :clips="props.presentation.readModel.clips"
          :is-playing="isCurrentProjectPlaying"
          :is-following="isTimelineFollowActive"
          :follow-label="timelineFollowLabel"
          :sustain-pedal-channel="pianoRollPreferences.sustainPedalChannel"
          :preview-message="previewMessage"
          :preview-blocked="
            placementPreview?.placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED
          "
          @invoke="invokeTool"
          @toggle-follow="toggleTimelineFollow"
          @select-clip="selectActiveClip"
          @select-channel="pianoRollPreferences.selectSustainPedalChannel"
        />

        <div class="project-piano-roll-track__left-stack">
          <div class="project-piano-roll-track__ruler-corner" aria-hidden="true">PITCH</div>
          <PianoRollKeyboard :viewport="pitchView.geometry.value" @wheel="pitchView.handleWheel" />
          <PianoRollControllerScale
            v-if="controllerLane.layout.value.visible"
            class="project-piano-roll-track__lane-label"
          />
        </div>

        <div
          ref="scrollViewport"
          class="project-piano-roll-track__scroll-viewport"
          @pointerdown.capture="handleTimelinePointerDown"
          @scroll.passive="handleScroll"
          @wheel.passive="handleTimelineWheel"
        >
          <div class="project-piano-roll-track__timeline-content" :style="timelineContentStyle">
            <ol class="project-piano-roll-track__ruler" aria-label="Track timeline bars">
              <li v-for="bar in timelineBars" :key="bar.number" :style="bar.style">
                {{ bar.number }}
              </li>
            </ol>
            <div
              ref="canvasHost"
              class="project-piano-roll-track__canvas-host"
              @pointerleave="placement.clearPreview"
              @pointermove="handleHover"
              @wheel="pitchView.handleWheel"
            >
              <canvas ref="gridCanvas" aria-hidden="true"></canvas>
              <div ref="noteHost" class="project-piano-roll-track__note-host"></div>
              <div class="project-piano-roll-track__clip-windows" aria-label="MIDI Clip windows">
                <button
                  v-for="window in clipWindows"
                  :key="window.clipReadModel.clip.clipId"
                  type="button"
                  :aria-label="`Use ${window.clipReadModel.clip.name} as the Active Clip`"
                  :aria-pressed="activeClipId === window.clipReadModel.clip.clipId"
                  :data-active="activeClipId === window.clipReadModel.clip.clipId"
                  :data-status="window.clipReadModel.clip.status"
                  :style="window.style"
                  @click.stop="activateClip(window.clipReadModel.clip.clipId)"
                >
                  <span>{{ window.clipReadModel.clip.name }}</span>
                </button>
              </div>
              <div
                v-if="previewClipStyle"
                class="project-piano-roll-track__clip-preview"
                :style="previewClipStyle"
                aria-hidden="true"
              ></div>
              <div
                v-if="previewNoteStyle"
                class="project-piano-roll-track__note-preview"
                :class="{
                  'project-piano-roll-track__note-preview--blocked':
                    placementPreview?.placement.status ===
                    PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED,
                }"
                :style="previewNoteStyle"
                aria-hidden="true"
              ></div>
            </div>
            <PianoRollSustainPedalLane
              class="project-piano-roll-track__sustain-lane"
              v-if="controllerLane.layout.value.visible"
              :session="props.session"
              ref="sustainPedalLane"
              :clip-context="null"
              :grid="displayGrid"
              :label="`Sustain Pedal lane for ${props.presentation.name}`"
              :pencil-enabled="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.PENCIL"
              :read-model="sustainPedalLaneReadModel"
              :snap-enabled="pianoRollPreferences.snapEnabled"
              :visible-span-tick="props.timelineEndTick"
              :visible-start-tick="ZERO_TICK"
              @completed="handleSustainPedalCompleted"
              @failure="reportSustainPedalFailure"
            />
            <TrackPlayhead
              :bar-span-tick="props.barSpanTick"
              :project-id="props.presentation.projectId"
              :timeline-end-tick="props.timelineEndTick"
            />
          </div>
        </div>
        <div class="project-piano-roll-track__pitch-scrollbar-stack">
          <PianoRollPitchScrollbar
            :layout="pitchView.layout.value"
            @scroll-pitch="pitchView.scrollTo"
          />
        </div>

        <PianoRollControllerHeader
          class="project-piano-roll-track__controller-header"
          :visible="controllerLane.layout.value.visible"
          :can-expand="controllerLane.layout.value.canExpand"
          :maximum="controllerLane.layout.value.maximum"
        />

        <p class="project-piano-roll-track__accessible-status" aria-live="polite">
          {{ accessibleStatus }}
        </p>
        <ul class="project-piano-roll-track__accessible-status">
          <li
            v-for="clipReadModel in props.presentation.readModel.clips"
            :key="clipReadModel.clip.clipId"
          >
            {{ clipReadModel.clip.name }}, starts at {{ clipReadModel.clip.startTick }} ticks, ends
            at {{ clipReadModel.clip.endTick }} ticks, {{ clipReadModel.notes.length }} visible
            notes
          </li>
        </ul>
      </section>
    </PianoRollContextMenu>
  </ContextMenuRoot>
</template>

<style scoped>
.project-piano-roll-track {
  --project-piano-roll-track-keyboard-width: 4.5rem;
  position: relative;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-template-columns: var(--project-piano-roll-track-keyboard-width) minmax(0, 1fr) var(
      --sd-space-3
    );
  grid-template-rows: var(--piano-roll-toolbar-height) minmax(0, 1fr);
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll-track:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-piano-roll-track__toolbar-placement {
  grid-column: 1 / -1;
}

.project-piano-roll-track__left-stack {
  display: grid;
  min-block-size: 0;
  grid-template-rows:
    var(--piano-roll-ruler-height)
    var(--project-piano-roll-track-pitch-height, minmax(0, 1fr))
    var(--piano-roll-controller-header-height)
    var(--piano-roll-controller-height);
  border-inline-end: 1px solid var(--sd-color-border-default);
}

.project-piano-roll-track__pitch-scrollbar-stack {
  padding-block-start: var(--piano-roll-ruler-height);
  min-block-size: 0;
  overflow: hidden;
}

.project-piano-roll-track__ruler-corner {
  display: flex;
  align-items: center;
  padding-inline: var(--sd-space-2);
  border-bottom: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.08em;
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__lane-label {
  grid-row: 4;
}
.project-piano-roll-track__controller-header {
  position: absolute;
  z-index: var(--sd-layer-sticky-raised);
  inset-inline: 0;
  inset-block-start: calc(
    var(--piano-roll-toolbar-height) + var(--piano-roll-ruler-height) +
      var(--project-piano-roll-track-pitch-height, 0px)
  );
}
.project-piano-roll-track__sustain-lane {
  grid-row: 4;
}

.project-piano-roll-track__scroll-viewport {
  min-inline-size: 0;
  min-block-size: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  scrollbar-gutter: stable;
}

.project-piano-roll-track__timeline-content {
  position: relative;
  display: grid;
  min-inline-size: 100%;
  block-size: 100%;
  grid-template-rows:
    var(--piano-roll-ruler-height)
    minmax(0, 1fr)
    var(--piano-roll-controller-header-height)
    var(--piano-roll-controller-height);
}

.project-piano-roll-track__ruler {
  display: flex;
  min-inline-size: 0;
  block-size: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border-bottom: 1px solid var(--sd-color-border-default);
  list-style: none;
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__ruler li {
  box-sizing: border-box;
  flex: 0 0 auto;
  padding: var(--sd-space-1) var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-editor-grid-bar);
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll-track__canvas-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll-track[data-tool='pencil'] .project-piano-roll-track__canvas-host {
  cursor: crosshair;
}

.project-piano-roll-track[data-tool='cursor']
  .project-piano-roll-track__note-host
  :deep(.sd-piano-roll-dom-note) {
  cursor: pointer;
}

.project-piano-roll-track__canvas-host > canvas,
.project-piano-roll-track__note-host {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}

.project-piano-roll-track__canvas-host > canvas {
  display: block;
}

.project-piano-roll-track__note-host {
  z-index: 1;
  overflow: hidden;
}

.project-piano-roll-track__note-host :deep(.sd-piano-roll-dom-note) {
  border-radius: var(--sd-radius-xs);
  will-change: transform;
}

.project-piano-roll-track__note-host :deep(.sd-piano-roll-dom-note__resize-handle) {
  display: none;
}

.project-piano-roll-track__clip-windows,
.project-piano-roll-track__clip-preview {
  position: absolute;
  z-index: 2;
  inset-block-start: var(--sd-space-1);
  inset-inline: 0;
  block-size: 1.25rem;
  pointer-events: none;
}

.project-piano-roll-track__clip-windows > button {
  position: absolute;
  inset-block: 0;
  min-inline-size: 2px;
  padding-inline: var(--sd-space-1);
  overflow: hidden;
  border: 1px solid var(--project-piano-roll-track-clip-color);
  border-radius: var(--sd-radius-xs);
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-xs);
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: color-mix(
    in srgb,
    var(--project-piano-roll-track-clip-color) 32%,
    var(--sd-color-surface-panel)
  );
  opacity: 0.78;
}

.project-piano-roll-track[data-tool='cursor'] .project-piano-roll-track__clip-windows > button {
  pointer-events: auto;
  cursor: pointer;
}

.project-piano-roll-track__clip-windows > button[data-active='true'] {
  z-index: 1;
  border-width: 2px;
  opacity: 1;
  box-shadow: 0 0 0 1px var(--sd-color-surface-canvas);
}

.project-piano-roll-track__clip-windows > button[data-status='unsupported'] {
  border-style: dashed;
  opacity: 0.58;
}

.project-piano-roll-track__clip-preview {
  border: 1px dashed var(--sd-color-border-focus);
  background: color-mix(in srgb, var(--sd-color-border-focus) 18%, transparent);
}

.project-piano-roll-track__note-preview {
  position: absolute;
  z-index: 3;
  inset-block-start: 0;
  inset-inline-start: 0;
  box-sizing: border-box;
  pointer-events: none;
  border: 1px dashed var(--sd-color-border-focus);
  border-radius: var(--sd-radius-xs);
  background: color-mix(in srgb, var(--sd-color-border-focus) 45%, transparent);
}

.project-piano-roll-track__note-preview--blocked {
  border-color: var(--sd-color-state-danger);
  background: color-mix(in srgb, var(--sd-color-state-danger) 35%, transparent);
}

.project-piano-roll-track__accessible-status {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
