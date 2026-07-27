<script setup lang="ts">
import {
  createInitialPianoRollViewport,
  createPianoRollGrid,
  createPianoRollGridCanvasRenderer,
  createPianoRollNoteScene,
  createPianoRollNoteReadModel,
  type PianoRollGridCanvasRenderer,
  type PianoRollGridCanvasTheme,
  type PianoRollNoteRenderer,
  type PianoRollNoteReadModel,
  type PianoRollNoteReadModelState,
} from '@seele-daw/editor'
import {
  PROJECT_PPQ,
  parseMidiPitch,
  parsePositiveTick,
  type ProjectSession,
  type Tick,
} from '@seele-daw/project-core'
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
  watchEffect,
} from 'vue'

import type { ReadyProjectPianoRollPresentation } from '@/features/piano-roll/project-piano-roll-presentation'
import { createProjectPianoRollNoteRenderer } from '@/features/piano-roll/project-piano-roll-note-renderer'

interface ProjectPianoRollSurfaceProps {
  readonly barSpanTick: Tick
  readonly presentation: ReadyProjectPianoRollPresentation
  readonly session: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly timeSignatureNumerator: number
}

const props = defineProps<ProjectPianoRollSurfaceProps>()

const INITIAL_MINIMUM_PITCH = parseMidiPitch(48)
const INITIAL_MAXIMUM_PITCH = parseMidiPitch(72)
const SIXTEENTH_NOTE_SPAN_TICK = parsePositiveTick(PROJECT_PPQ / 4)

const canvasHost = shallowRef<HTMLElement | null>(null)
const surfaceElement = shallowRef<HTMLElement | null>(null)
const gridCanvas = shallowRef<HTMLCanvasElement | null>(null)
const noteHost = shallowRef<HTMLElement | null>(null)
const noteState = shallowRef<PianoRollNoteReadModelState | null>(null)
const failureMessage = shallowRef<string | null>(null)
const gridRenderer = shallowRef<PianoRollGridCanvasRenderer | null>(null)
const noteRenderer = shallowRef<PianoRollNoteRenderer | null>(null)
let readModel: PianoRollNoteReadModel | null = null
let unsubscribeReadModel: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

const pianoKeys = Object.freeze(
  Array.from(
    { length: INITIAL_MAXIMUM_PITCH - INITIAL_MINIMUM_PITCH + 1 },
    (_, index) => {
      const pitch = INITIAL_MAXIMUM_PITCH - index
      const pitchClass = pitch % 12
      return Object.freeze({
        isBlack: [1, 3, 6, 8, 10].includes(pitchClass),
        label: pitchClass === 0 ? `C${Math.floor(pitch / 12) - 1}` : '',
        pitch,
      })
    },
  ),
)
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
const accessibleStatus = computed(() => {
  if (failureMessage.value !== null) return failureMessage.value
  const noteCount = noteState.value?.notes.length ?? 0
  return `${props.presentation.name}, ${noteCount} visible MIDI ${
    noteCount === 1 ? 'note' : 'notes'
  }`
})

function describeFailure(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return 'The Piano Roll could not be rendered.'
}

function readThemeColor(style: CSSStyleDeclaration, token: string): string {
  return style.getPropertyValue(token).trim()
}

interface PianoRollSurfaceThemeSnapshot {
  readonly grid: PianoRollGridCanvasTheme
  readonly noteBorderColor: string
  readonly noteFillColor: string
}

function createThemeSnapshot(): PianoRollSurfaceThemeSnapshot {
  const element = surfaceElement.value
  if (element === null) throw new Error('Piano Roll surface is not mounted')

  const style = getComputedStyle(element)
  return Object.freeze({
    grid: Object.freeze({
      background: readThemeColor(style, '--sd-color-surface-canvas'),
      blackPitchRow: readThemeColor(style, '--sd-editor-pitch-row-black'),
      gridBar: readThemeColor(style, '--sd-editor-grid-bar'),
      gridBeat: readThemeColor(style, '--sd-editor-grid-beat'),
      gridSubdivision: readThemeColor(style, '--sd-editor-grid-subdivision'),
      pitchRowBorder: readThemeColor(style, '--sd-editor-pitch-row-border'),
      whitePitchRow: readThemeColor(style, '--sd-editor-pitch-row-white'),
    }),
    noteBorderColor: readThemeColor(style, '--sd-editor-note-border'),
    noteFillColor:
      props.presentation.color ??
      readThemeColor(style, '--sd-color-border-focus'),
  })
}

function createDisplayGrid() {
  return createPianoRollGrid({
    barSpanTick: props.barSpanTick,
    beatSpanTick: parsePositiveTick(
      props.barSpanTick / props.timeSignatureNumerator,
    ),
    subdivisionSpanTick: SIXTEENTH_NOTE_SPAN_TICK,
  })
}

function render(): void {
  const currentGridRenderer = gridRenderer.value
  const currentNoteRenderer = noteRenderer.value
  const state = noteState.value
  if (
    currentGridRenderer === null ||
    currentNoteRenderer === null ||
    state === null
  ) {
    return
  }

  try {
    const theme = createThemeSnapshot()
    currentGridRenderer.render({
      grid: createDisplayGrid(),
      theme: theme.grid,
      viewport: state.viewport,
    })
    currentNoteRenderer.render(
      createPianoRollNoteScene({
        notes: state.notes,
        style: {
          borderColor: theme.noteBorderColor,
          fillColor: theme.noteFillColor,
          opacity: props.presentation.muted ? 0.46 : 1,
        },
        viewport: state.viewport,
      }),
    )
    failureMessage.value = null
  } catch (cause) {
    failureMessage.value = describeFailure(cause)
  }
}

function disposeReadModel(): void {
  unsubscribeReadModel?.()
  unsubscribeReadModel = null
  readModel?.dispose()
  readModel = null
  noteState.value = null
}

function createOrResizeReadModel(): void {
  const host = canvasHost.value
  if (host === null || host.clientWidth <= 0 || host.clientHeight <= 0) return

  try {
    const viewport = createInitialPianoRollViewport(props.presentation.context, {
      heightCssPixel: host.clientHeight,
      maximumPitch: INITIAL_MAXIMUM_PITCH,
      minimumPitch: INITIAL_MINIMUM_PITCH,
      widthCssPixel: host.clientWidth,
    })

    if (readModel !== null) {
      readModel.setViewport(viewport)
      return
    }

    readModel = createPianoRollNoteReadModel({
      context: props.presentation.context,
      session: props.session,
      viewport,
    })
    noteState.value = readModel.state
    unsubscribeReadModel = readModel.subscribe({
      onError: (failure) => {
        failureMessage.value = describeFailure(failure.cause)
      },
      onStateChange: (state) => {
        noteState.value = state
      },
    })
  } catch (cause) {
    failureMessage.value = describeFailure(cause)
  }
}

function recomposeReadModel(): void {
  disposeReadModel()
  createOrResizeReadModel()
}

function handleWindowResize(): void {
  createOrResizeReadModel()
}

watch(
  () => [
    props.presentation.context.clipId,
    props.presentation.context.clipSpanTick,
    props.presentation.context.sourceId,
    props.presentation.context.sourceStartTick,
    props.session,
  ],
  recomposeReadModel,
)
watchEffect(render)

onMounted(() => {
  const grid = gridCanvas.value
  const notes = noteHost.value
  const host = canvasHost.value
  if (grid === null || notes === null || host === null) return

  try {
    gridRenderer.value = createPianoRollGridCanvasRenderer({
      canvas: grid,
    })
    noteRenderer.value = createProjectPianoRollNoteRenderer({
      container: notes,
    })
  } catch (cause) {
    gridRenderer.value?.dispose()
    gridRenderer.value = null
    noteRenderer.value?.dispose()
    noteRenderer.value = null
    failureMessage.value = describeFailure(cause)
    return
  }

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => createOrResizeReadModel())
    resizeObserver.observe(host)
  } else {
    window.addEventListener('resize', handleWindowResize)
  }
  createOrResizeReadModel()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', handleWindowResize)
  disposeReadModel()
  gridRenderer.value?.dispose()
  gridRenderer.value = null
  noteRenderer.value?.dispose()
  noteRenderer.value = null
})
</script>

<template>
  <section
    ref="surfaceElement"
    class="project-piano-roll"
    role="region"
    :aria-label="`Piano Roll for ${props.presentation.name}`"
    tabindex="0"
  >
    <div class="project-piano-roll__ruler-corner" aria-hidden="true">PITCH</div>
    <div class="project-piano-roll__ruler" :style="rulerStyle" aria-hidden="true">
      <span v-for="bar in barLabels" :key="bar">{{ bar }}</span>
    </div>

    <div class="project-piano-roll__keyboard" aria-label="Piano keyboard">
      <div
        v-for="key in pianoKeys"
        :key="key.pitch"
        class="project-piano-roll__key-row"
      >
        <span :class="{ 'project-piano-roll__key--black': key.isBlack }">
          {{ key.label }}
        </span>
      </div>
    </div>

    <div ref="canvasHost" class="project-piano-roll__canvas-host">
      <canvas ref="gridCanvas" aria-hidden="true"></canvas>
      <div ref="noteHost" class="project-piano-roll__note-host"></div>
    </div>

    <p class="project-piano-roll__accessible-status" aria-live="polite">
      {{ accessibleStatus }}
    </p>
    <ul v-if="noteState" class="project-piano-roll__accessible-status">
      <li v-for="visibleNote in noteState.notes" :key="visibleNote.note.id">
        MIDI note {{ visibleNote.note.pitch }}, starts at
        {{ visibleNote.visibleStartTick }} ticks, duration
        {{ visibleNote.note.durationTick }} ticks
      </li>
    </ul>
  </section>
</template>

<style scoped>
.project-piano-roll {
  --project-piano-roll-keyboard-width: 4.5rem;
  --project-piano-roll-ruler-height: 1.625rem;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-template-columns: var(--project-piano-roll-keyboard-width) minmax(0, 1fr);
  grid-template-rows: var(--project-piano-roll-ruler-height) minmax(0, 1fr);
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-piano-roll__ruler-corner,
.project-piano-roll__ruler {
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
  display: grid;
  min-block-size: 0;
  grid-template-rows: repeat(25, minmax(0, 1fr));
  overflow: hidden;
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-editor-key-white);
}

.project-piano-roll__key-row {
  position: relative;
  min-block-size: 0;
  border-bottom: 1px solid var(--sd-color-border-strong);
  color: var(--sd-color-text-inverse);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll__key-row > span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-inline-end: var(--sd-space-2);
}

.project-piano-roll__key-row > .project-piano-roll__key--black {
  inline-size: 68%;
  z-index: 1;
  justify-content: flex-start;
  border-radius: 0 var(--sd-radius-xs) var(--sd-radius-xs) 0;
  color: var(--sd-color-text-secondary);
  background: var(--sd-editor-key-black);
}

.project-piano-roll__canvas-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background: var(--sd-color-surface-canvas);
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
