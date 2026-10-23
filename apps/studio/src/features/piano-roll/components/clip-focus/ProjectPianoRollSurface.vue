<script setup lang="ts">
import PianoRollControllerHeader from '@/features/piano-roll/components/controller-lane/PianoRollControllerHeader.vue'
import PianoRollControllerScale from '@/features/piano-roll/components/controller-lane/PianoRollControllerScale.vue'
import { useControllerLaneLayout } from '@/features/piano-roll/layout/use-controller-lane-layout'

import { createPianoRollInteractionSession, createPianoRollGrid } from '@seele-daw/editor'
import { ZERO_TICK, parsePositiveTick } from '@seele-daw/project-core'
import { ContextMenuRoot } from 'reka-ui'
import { computed, onMounted, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import PianoRollPlayhead from '@/features/piano-roll/playhead/PianoRollPlayhead.vue'
import PianoRollContextMenu from '@/features/piano-roll/actions/PianoRollContextMenu.vue'
import PianoRollSustainPedalLane from '@/features/piano-roll/components/sustain-pedal/PianoRollSustainPedalLane.vue'
import { usePianoRollToolActions } from '@/features/piano-roll/actions/use-piano-roll-tool-actions'
import { useClipNoteModel } from '@/features/piano-roll/components/clip-focus/hooks/use-clip-note-model'
import { useNoteInteraction } from '@/features/piano-roll/components/clip-focus/hooks/use-note-interaction'
import { useNoteRendering } from '@/features/piano-roll/components/clip-focus/hooks/use-note-rendering'
import { useEditingActions } from '@/features/piano-roll/components/clip-focus/hooks/use-editing-actions'
import { useClipSustainPedal } from '@/features/piano-roll/components/clip-focus/hooks/use-clip-sustain-pedal'
import PianoRollKeyboard from '@/features/piano-roll/components/pitch-view/PianoRollKeyboard.vue'
import PianoRollPitchControls from '@/features/piano-roll/components/pitch-view/PianoRollPitchControls.vue'
import PianoRollPitchScrollbar from '@/features/piano-roll/components/pitch-view/PianoRollPitchScrollbar.vue'
import { usePitchViewport } from '@/features/piano-roll/viewport/use-pitch-viewport'
import { describeFailure } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { PIANO_ROLL_TOOL } from '@/features/piano-roll/types/piano-roll-preferences'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import type {
  FocusedPianoRollEditingTarget,
  PianoRollSurfaceElements,
  ProjectPianoRollSurfaceProps,
} from '@/features/piano-roll/components/clip-focus/types/clip-focus'
import type { PianoRollSustainPedalLaneHandle } from '@/features/piano-roll/types/piano-roll-sustain-pedal'
import PianoRollToolControls from '@/features/piano-roll/components/PianoRollToolControls.vue'

const props = defineProps<ProjectPianoRollSurfaceProps>()
const pianoRollPreferences = usePianoRollPreferencesStore()
const canvasHost = useTemplateRef<HTMLElement>('canvasHost')
const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const gridCanvas = useTemplateRef<HTMLCanvasElement>('gridCanvas')
const noteHost = useTemplateRef<HTMLElement>('noteHost')
const sustainPedalLane = useTemplateRef<PianoRollSustainPedalLaneHandle>('sustainPedalLane')
const elements: PianoRollSurfaceElements = {
  canvasHost,
  surfaceElement,
  gridCanvas,
  noteHost,
  sustainPedalLane,
}
const focusedEditingTarget = shallowRef<FocusedPianoRollEditingTarget>('notes')
const interactionFailureMessage = shallowRef<string | null>(null)
const interactionSession = createPianoRollInteractionSession()
const pitchView = usePitchViewport(canvasHost)
const controllerLane = useControllerLaneLayout(surfaceElement)
const fitPitches = computed(() => {
  const context = props.presentation.context
  const partition = props.presentation.snapshot.midiNotePartitions.find(
    ({ sourceId }) => sourceId === context.sourceId,
  )
  return (
    partition?.notes
      .filter(
        (note) =>
          note.startTick < context.sourceEndTick &&
          note.startTick + note.durationTick > context.sourceStartTick,
      )
      .map((note) => note.pitch) ?? []
  )
})
const model = useClipNoteModel({
  props,
  getGeometry: () => pitchView.geometry.value,
  interactionSession,
  interactionFailureMessage,
})
const { noteState, editorState } = model
const displayGrid = computed(() =>
  createPianoRollGrid({
    barSpanTick: props.barSpanTick,
    beatSpanTick: parsePositiveTick(props.barSpanTick / props.timeSignatureNumerator),
    originTick: ZERO_TICK,
    subdivisionSpanTick: pianoRollPreferences.subdivisionSpanTick,
  }),
)
const interaction = useNoteInteraction({
  props,
  elements,
  model,
  interactionSession,
  focusedEditingTarget,
  interactionFailureMessage,
  createDisplayGrid: () => displayGrid.value,
})
const rendering = useNoteRendering({
  props,
  elements,
  model,
  interaction,
  createDisplayGrid: () => displayGrid.value,
})
const { movePreview, resizePreview, snapGuideStyle } = rendering
// Target invalidation must cancel the captured operation before replacing its projections.
watch(
  [
    () => props.presentation.context.clipId,
    () => props.presentation.context.clipSpanTick,
    () => props.presentation.context.sourceId,
    () => props.presentation.context.sourceStartTick,
    () => props.session,
  ],
  () => {
    interaction.cancel()
    model.recompose()
  },
  { flush: 'sync' },
)

const { prepareContextMenu, handleFocusIn, focusSustainPedalLane } = useEditingActions({
  props,
  elements,
  model,
  interaction,
  focusedEditingTarget,
  interactionFailureMessage,
})
const { sustainPedalLaneReadModel, handleSustainPedalFailure, handleSustainPedalCompleted } =
  useClipSustainPedal(props, interactionFailureMessage)
const barLabels = computed(() => {
  const barCount = Math.max(
    1,
    Math.ceil(props.presentation.context.clipSpanTick / props.barSpanTick),
  )
  return Object.freeze(Array.from({ length: barCount }, (_, index) => index + 1))
})
const rulerStyle = computed(() => ({
  gridTemplateColumns: `repeat(${barLabels.value.length}, minmax(0, 1fr))`,
}))
const failureMessage = computed(
  () =>
    interactionFailureMessage.value ?? model.failureMessage.value ?? rendering.failureMessage.value,
)
const accessibleStatus = computed(() => {
  if (failureMessage.value !== null) return failureMessage.value
  const noteCount = noteState.value?.notes.length ?? 0
  const selectedNoteCount = editorState.value?.selectedNoteIds.length ?? 0
  return `${props.presentation.name}, ${noteCount} visible MIDI ${
    noteCount === 1 ? 'note' : 'notes'
  }, ${selectedNoteCount} selected`
})

const { controls: toolControls, invoke: invokeTool } = usePianoRollToolActions({
  isFocused: () => surfaceElement.value?.contains(document.activeElement) ?? false,
  getTool: () => pianoRollPreferences.activeTool,
  activateTool: pianoRollPreferences.activateTool,
  isSnapEnabled: () => pianoRollPreferences.snapEnabled,
  toggleSnap: pianoRollPreferences.toggleSnap,
})

onMounted(() => {
  if (
    gridCanvas.value === null ||
    noteHost.value === null ||
    canvasHost.value === null ||
    surfaceElement.value === null
  )
    return
  try {
    controllerLane.mount()
    rendering.mount()
    interaction.mount()
    model.mount()
    pitchView.mount(interaction.hasStablePointerMapping)
  } catch (cause) {
    dispose()
    rendering.failureMessage.value = describeFailure(cause)
    return
  }
})

function dispose(): void {
  // Release capture and its semantic owner before disposing projections and renderers.
  interaction.dispose()
  model.dispose()
  pitchView.dispose()
  rendering.dispose()
  controllerLane.dispose()
}
onBeforeUnmount(dispose)
</script>

<template>
  <ContextMenuRoot>
    <PianoRollContextMenu :prepare-target="prepareContextMenu">
      <section
        ref="surfaceElement"
        class="project-piano-roll"
        role="region"
        :aria-label="`Piano Roll for ${props.presentation.name}`"
        :data-moving-notes="movePreview !== null"
        :data-resizing-note="resizePreview !== null"
        :data-snap-enabled="pianoRollPreferences.snapEnabled"
        :data-tool="pianoRollPreferences.activeTool"
        :style="controllerLane.style.value"
        tabindex="0"
        @focusin="handleFocusIn"
      >
        <header class="project-piano-roll__toolbar" aria-label="Piano Roll controls">
          <PianoRollToolControls
            :active-tool="pianoRollPreferences.activeTool"
            :controls="toolControls"
            :grid-preset="pianoRollPreferences.gridPreset"
            :snap-enabled="pianoRollPreferences.snapEnabled"
            @invoke="invokeTool"
          />
          <PianoRollPitchControls :pitches="fitPitches" />
        </header>

        <div class="project-piano-roll__ruler-corner" aria-hidden="true">PITCH</div>
        <div class="project-piano-roll__ruler" :style="rulerStyle" aria-hidden="true">
          <span v-for="bar in barLabels" :key="bar">{{ bar }}</span>
        </div>

        <PianoRollKeyboard
          class="project-piano-roll__keyboard"
          :viewport="pitchView.geometry.value"
          @wheel="pitchView.handleWheel"
        />

        <div
          ref="canvasHost"
          class="project-piano-roll__canvas-host"
          @wheel="pitchView.handleWheel"
        >
          <canvas ref="gridCanvas" aria-hidden="true"></canvas>
          <div
            v-if="snapGuideStyle"
            class="project-piano-roll__snap-guide"
            :style="snapGuideStyle"
            aria-hidden="true"
          ></div>
          <div ref="noteHost" class="project-piano-roll__note-host"></div>
        </div>
        <PianoRollPitchScrollbar
          class="project-piano-roll__pitch-scrollbar"
          :layout="pitchView.layout.value"
          @scroll-pitch="pitchView.scrollTo"
        />

        <PianoRollControllerScale
          v-if="controllerLane.layout.value.visible"
          class="project-piano-roll__lane-label"
        />
        <PianoRollSustainPedalLane
          v-if="controllerLane.layout.value.visible"
          :session="props.session"
          class="project-piano-roll__sustain-lane"
          ref="sustainPedalLane"
          :clip-context="props.presentation.context"
          :grid="displayGrid"
          :label="`Sustain Pedal lane for ${props.presentation.name}`"
          :pencil-enabled="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.PENCIL"
          :read-model="sustainPedalLaneReadModel"
          :snap-enabled="pianoRollPreferences.snapEnabled"
          :visible-span-tick="props.presentation.context.clipSpanTick"
          :visible-start-tick="ZERO_TICK"
          @completed="handleSustainPedalCompleted"
          @failure="handleSustainPedalFailure"
          @request-focus="focusSustainPedalLane"
        />

        <PianoRollPlayhead
          v-if="noteState"
          :presentation="props.presentation"
          :viewport="noteState.viewport"
        />

        <PianoRollControllerHeader
          class="project-piano-roll__controller-header"
          :visible="controllerLane.layout.value.visible"
          :can-expand="controllerLane.layout.value.canExpand"
          :maximum="controllerLane.layout.value.maximum"
        />

        <p class="project-piano-roll__accessible-status" aria-live="polite">
          {{ accessibleStatus }}
        </p>
        <ul v-if="noteState" class="project-piano-roll__accessible-status">
          <li v-for="visibleNote in noteState.notes" :key="visibleNote.note.id">
            MIDI note {{ visibleNote.note.pitch }}, starts at
            {{ visibleNote.visibleStartTick }} ticks, duration
            {{ visibleNote.note.durationTick }} ticks{{
              editorState?.selectedNoteIds.includes(visibleNote.note.id) ? ', selected' : ''
            }}
          </li>
        </ul>
      </section>
    </PianoRollContextMenu>
  </ContextMenuRoot>
</template>

<style scoped>
.project-piano-roll {
  --project-piano-roll-keyboard-width: 4.5rem;
  position: relative;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-template-columns: var(--project-piano-roll-keyboard-width) minmax(0, 1fr) var(--sd-space-3);
  grid-template-rows:
    var(--piano-roll-toolbar-height)
    var(--piano-roll-ruler-height)
    minmax(0, 1fr)
    var(--piano-roll-controller-header-height)
    var(--piano-roll-controller-height);
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll__toolbar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--sd-space-2);
  min-inline-size: 0;
  padding-inline: var(--sd-space-2);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  overscroll-behavior: none;
  white-space: nowrap;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll__toolbar > * {
  flex: 0 0 auto;
}

.project-piano-roll:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-piano-roll__ruler-corner,
.project-piano-roll__ruler {
  grid-row: 2;
  grid-column: 2;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll__ruler-corner {
  display: flex;
  align-items: center;
  padding-inline: var(--sd-space-2);
  border-inline-end: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.08em;
}

.project-piano-roll__ruler {
  display: grid;
  min-inline-size: 0;
}

.project-piano-roll__ruler span {
  padding: var(--sd-space-1) var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-editor-grid-bar);
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll__keyboard {
  grid-row: 3;
  grid-column: 1;
}
.project-piano-roll__pitch-scrollbar {
  grid-row: 3;
  grid-column: 3;
}
.project-piano-roll__sustain-lane {
  grid-row: 5;
  grid-column: 2;
}

.project-piano-roll__lane-label {
  grid-row: 5;
  grid-column: 1;
}
.project-piano-roll__controller-header {
  z-index: var(--sd-layer-sticky-raised);
  grid-row: 4;
  grid-column: 1 / -1;
}

.project-piano-roll__canvas-host {
  grid-row: 3;
  grid-column: 2;
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll[data-tool='pencil'] .project-piano-roll__canvas-host {
  cursor: crosshair;
}

.project-piano-roll[data-tool='cursor']
  .project-piano-roll__note-host
  :deep(.sd-piano-roll-dom-note) {
  cursor: grab;
}

.project-piano-roll[data-moving-notes='true']
  .project-piano-roll__note-host
  :deep(.sd-piano-roll-dom-note--selected) {
  cursor: grabbing;
}

.project-piano-roll__canvas-host > canvas,
.project-piano-roll__note-host {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}

.project-piano-roll__canvas-host > canvas {
  display: block;
}

.project-piano-roll__note-host {
  overflow: hidden;
}

.project-piano-roll__snap-guide {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 1;
  inline-size: 1px;
  pointer-events: none;
  background: var(--sd-color-border-focus);
  box-shadow: 0 0 6px color-mix(in srgb, var(--sd-color-border-focus) 55%, transparent);
}

.project-piano-roll__note-host :deep(.sd-piano-roll-dom-note) {
  border-radius: var(--sd-radius-xs);
  will-change: transform;
}

.project-piano-roll__accessible-status {
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
