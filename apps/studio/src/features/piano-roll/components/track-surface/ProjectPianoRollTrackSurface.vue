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
import { useTrackRenderWindow } from '@/features/piano-roll/components/track-surface/hooks/use-track-render-window'
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
import PianoRollTrackClipHeaders from './PianoRollTrackClipHeaders.vue'
import PianoRollTrackClipRegions from './PianoRollTrackClipRegions.vue'

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
const displayGrid = computed(() =>
  createPianoRollGrid({
    barSpanTick: props.barSpanTick,
    beatSpanTick: parsePositiveTick(props.barSpanTick / props.timeSignatureNumerator),
    originTick: ZERO_TICK,
    subdivisionSpanTick: pianoRollPreferences.subdivisionSpanTick,
  }),
)
const timelineScrollLeft = shallowRef(0)
const renderWindow = useTrackRenderWindow({
  scrollViewport,
  getContentWidth: () => pitchView.geometry.value?.widthCssPixel ?? 0,
  getScrollLeft: () => timelineScrollLeft.value,
})
const layout = useTrackLayout({
  getGeometry: () => pitchView.geometry.value,
  getPresentation: () => props.presentation,
  getTimelineEndTick: () => props.timelineEndTick,
  getBarSpanTick: () => props.barSpanTick,
  getRenderWindow: () => renderWindow.window.value,
})
const {
  timelineBars,
  timelineContentStyle,
  clipRegions,
  clipHeaderRowCount,
  clipHeaderHeight,
  visibleClips,
} = layout
const controllerLane = useControllerLaneLayout(surfaceElement, () => clipHeaderHeight.value)
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
  getViewport: () => layout.renderViewport.value,
  getVisibleClips: () => visibleClips.value,
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
  const noteCount = visibleClips.value.reduce((count, { notes }) => count + notes.length, 0)
  return `${props.presentation.name}, Track time, ${clipCount} MIDI ${clipCount === 1 ? 'clip' : 'clips'}, ${noteCount} visible ${noteCount === 1 ? 'note' : 'notes'}`
})
function handleScroll(event: Event): void {
  timelineScrollLeft.value = scrollViewport.value?.scrollLeft ?? 0
  placement.clearPreview()
  follow.handleScroll(event)
}
function scrollTimeline(left: number): void {
  const viewport = scrollViewport.value
  if (viewport !== null) {
    viewport.scrollLeft = left
    timelineScrollLeft.value = viewport.scrollLeft
  }
}
function dispose(): void {
  follow.dispose()
  renderWindow.dispose()
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
    renderWindow.mount()
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
          '--piano-roll-clip-header-height': `${clipHeaderHeight}px`,
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
          @invoke="invokeTool"
          @toggle-follow="toggleTimelineFollow"
          @select-clip="selectActiveClip"
        />

        <div class="project-piano-roll-track__left-stack">
          <div class="project-piano-roll-track__ruler-corner" aria-hidden="true">PITCH</div>
          <div class="project-piano-roll-track__clip-corner" aria-hidden="true">CLIPS</div>
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
            <div class="project-piano-roll-track__clip-header-space" aria-hidden="true"></div>
            <div
              ref="canvasHost"
              class="project-piano-roll-track__canvas-host"
              @pointerleave="placement.clearPreview"
              @pointermove="handleHover"
              @wheel="pitchView.handleWheel"
            >
              <canvas
                ref="gridCanvas"
                :style="layout.renderWindowStyle.value"
                aria-hidden="true"
              ></canvas>
              <PianoRollTrackClipRegions
                class="project-piano-roll-track__clip-regions"
                :regions="clipRegions"
                :active-clip-id="activeClipId"
              />
              <div
                ref="noteHost"
                class="project-piano-roll-track__note-host"
                :style="layout.renderWindowStyle.value"
              ></div>
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

        <PianoRollTrackClipHeaders
          class="project-piano-roll-track__clip-headers"
          :regions="clipRegions"
          :active-clip-id="activeClipId"
          :row-count="clipHeaderRowCount"
          :content-style="timelineContentStyle"
          :scroll-left="timelineScrollLeft"
          @activate="activateClip"
          @scroll-timeline="scrollTimeline"
          @pointerdown.capture="handleTimelinePointerDown"
          @wheel.passive="handleTimelineWheel"
        />
        <PianoRollControllerHeader
          class="project-piano-roll-track__controller-header"
          :visible="controllerLane.layout.value.visible"
          :can-expand="controllerLane.layout.value.canExpand"
          :maximum="controllerLane.layout.value.maximum"
        />

        <p
          v-if="previewMessage"
          class="project-piano-roll-track__preview-message"
          :data-blocked="
            placementPreview?.placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED
          "
          role="status"
        >
          {{ previewMessage }}
        </p>
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
    var(--piano-roll-clip-header-height)
    var(--project-piano-roll-track-pitch-height, minmax(0, 1fr))
    var(--piano-roll-controller-header-height)
    var(--piano-roll-controller-height);
  border-inline-end: 1px solid var(--sd-color-border-default);
}

.project-piano-roll-track__pitch-scrollbar-stack {
  padding-block-start: calc(var(--piano-roll-ruler-height) + var(--piano-roll-clip-header-height));
  min-block-size: 0;
  overflow: hidden;
}

.project-piano-roll-track__ruler-corner,
.project-piano-roll-track__clip-corner {
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
  grid-row: 5;
}
.project-piano-roll-track__controller-header {
  position: absolute;
  z-index: var(--sd-layer-sticky-raised);
  inset-inline: 0;
  inset-block-start: calc(
    var(--piano-roll-toolbar-height) + var(--piano-roll-ruler-height) +
      var(--piano-roll-clip-header-height) + var(--project-piano-roll-track-pitch-height, 0px)
  );
}
.project-piano-roll-track__sustain-lane {
  grid-row: 5;
}

.project-piano-roll-track__scroll-viewport {
  min-inline-size: 0;
  min-block-size: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: none;
  scrollbar-gutter: stable;
}

.project-piano-roll-track__timeline-content {
  position: relative;
  display: grid;
  min-inline-size: 100%;
  block-size: 100%;
  grid-template-rows:
    var(--piano-roll-ruler-height)
    var(--piano-roll-clip-header-height)
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

.project-piano-roll-track__clip-headers {
  position: absolute;
  z-index: var(--sd-layer-sticky);
  inset-block-start: calc(var(--piano-roll-toolbar-height) + var(--piano-roll-ruler-height));
  inset-inline-start: var(--project-piano-roll-track-keyboard-width);
  inset-inline-end: var(--sd-space-3);
  block-size: var(--piano-roll-clip-header-height);
}

.project-piano-roll-track__clip-regions,
.project-piano-roll-track__clip-preview {
  position: absolute;
  inset-block: 0;
  inset-inline: 0;
  pointer-events: none;
}

.project-piano-roll-track__clip-preview {
  z-index: 2;
  box-sizing: border-box;
  border: 1px dashed var(--sd-color-border-focus);
  background: color-mix(in srgb, var(--sd-color-border-focus) 9%, transparent);
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

.project-piano-roll-track__preview-message {
  position: absolute;
  z-index: var(--sd-layer-sticky);
  inset-inline-start: calc(var(--project-piano-roll-track-keyboard-width) + var(--sd-space-2));
  inset-inline-end: var(--sd-space-5);
  inset-block-end: calc(
    var(--piano-roll-controller-height) + var(--piano-roll-controller-header-height) +
      var(--sd-space-2)
  );
  inline-size: fit-content;
  max-inline-size: calc(100% - var(--project-piano-roll-track-keyboard-width) - var(--sd-space-5));
  margin: 0;
  padding: var(--sd-space-1) var(--sd-space-2);
  overflow: hidden;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-surface-overlay);
  font-size: var(--sd-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
.project-piano-roll-track__preview-message[data-blocked='true'] {
  color: var(--sd-color-state-danger);
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
