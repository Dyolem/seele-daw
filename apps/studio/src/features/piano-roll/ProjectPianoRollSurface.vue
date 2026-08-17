<script setup lang="ts">
import {
  PIANO_ROLL_INTERACTION_STATUS,
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollInteractionSession,
  createPianoRollEditorSession,
  createInitialPianoRollViewport,
  createPianoRollGrid,
  createPianoRollGridCanvasRenderer,
  createPianoRollNoteScene,
  createPianoRollNoteReadModel,
  createPianoRollPointerInputAdapter,
  pianoRollClipTickToCssPixel,
  type PianoRollEditorSession,
  type PianoRollEditorSessionState,
  type PianoRollGridCanvasRenderer,
  type PianoRollGridCanvasTheme,
  type PianoRollInteractionState,
  type PianoRollInteractionTool,
  type PianoRollNoteRenderer,
  type PianoRollNoteReadModel,
  type PianoRollNoteReadModelState,
  type PianoRollPointerInputAdapter,
  type PianoRollPointerInput,
} from '@seele-daw/editor'
import {
  ZERO_TICK,
  parseMidiPitch,
  parsePositiveTick,
  type ProjectSession,
  type Tick,
} from '@seele-daw/project-core'
import CursorIcon from '~icons/fluent/cursor-20-regular'
import GridIcon from '~icons/fluent/grid-20-regular'
import PenIcon from '~icons/fluent/pen-20-regular'
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
  watchEffect,
} from 'vue'

import PianoRollPlayhead from '@/features/piano-roll/playhead/PianoRollPlayhead.vue'
import type { ReadyProjectPianoRollPresentation } from '@/features/piano-roll/project-piano-roll-presentation'
import { createProjectPianoRollIntentHandler } from '@/features/piano-roll/project-piano-roll-intent-handler'
import { createProjectPianoRollNoteRenderer } from '@/features/piano-roll/project-piano-roll-note-renderer'
import {
  PIANO_ROLL_TOOL,
  usePianoRollPreferencesStore,
  type PianoRollTool,
} from '@/features/piano-roll/piano-roll-preferences-store'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  STUDIO_KEYBOARD_ACTION,
  STUDIO_KEYBOARD_SCOPE,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { useStudioKeyboardShortcuts } from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'
import { useProjectMidiNotes } from '@/workbench/project/midi-note/vue/project-midi-note-context'

interface ProjectPianoRollSurfaceProps {
  readonly barSpanTick: Tick
  readonly presentation: ReadyProjectPianoRollPresentation
  readonly session: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly timeSignatureNumerator: number
}

const props = defineProps<ProjectPianoRollSurfaceProps>()
const { keyboardShortcuts } = useStudioKeyboardShortcuts()
const { projectMidiNotes } = useProjectMidiNotes()
const pianoRollPreferences = usePianoRollPreferencesStore()
const toasts = useUiToastStore()

const INITIAL_MINIMUM_PITCH = parseMidiPitch(48)
const INITIAL_MAXIMUM_PITCH = parseMidiPitch(72)

const canvasHost = useTemplateRef<HTMLElement>('canvasHost')
const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const gridCanvas = useTemplateRef<HTMLCanvasElement>('gridCanvas')
const noteHost = useTemplateRef<HTMLElement>('noteHost')
const noteState = shallowRef<PianoRollNoteReadModelState | null>(null)
const editorState = shallowRef<PianoRollEditorSessionState | null>(null)
const interactionSession = createPianoRollInteractionSession()
const interactionState = shallowRef<PianoRollInteractionState>(
  interactionSession.state,
)
const interactionFailureMessage = shallowRef<string | null>(null)
const readModelFailureMessage = shallowRef<string | null>(null)
const renderFailureMessage = shallowRef<string | null>(null)
const gridRenderer = shallowRef<PianoRollGridCanvasRenderer | null>(null)
const noteRenderer = shallowRef<PianoRollNoteRenderer | null>(null)
let editorSession: PianoRollEditorSession | null = null
let unsubscribeEditorSession: (() => void) | null = null
let readModel: PianoRollNoteReadModel | null = null
let unsubscribeReadModel: (() => void) | null = null
let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
let resizeObserver: ResizeObserver | null = null
const handleInteractionIntent = createProjectPianoRollIntentHandler({
  getAuthorityRevision: () => noteState.value?.modelRevision ?? null,
  getClipId: () => props.presentation.context.clipId,
  getEditorSession: () => editorSession,
  interactionSession,
  projectMidiNotes,
  reportDanger: (title, description) => toasts.danger(title, description),
  reportWarning: (title, description) => toasts.warning(title, description),
  setFailureMessage: (message) => {
    interactionFailureMessage.value = message
  },
})
const unsubscribeInteractionSession = interactionSession.subscribe({
  onStateChange: (state) => {
    interactionState.value = state
  },
})
const movePreview = computed(() => interactionState.value.movePreview)
const resizePreview = computed(() => interactionState.value.resizePreview)

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
const snapGuideStyle = computed(() => {
  const snapGuideTick =
    resizePreview.value?.snapGuideTick ?? movePreview.value?.snapGuideTick
  const viewport = noteState.value?.viewport
  if (snapGuideTick === null || snapGuideTick === undefined || viewport === undefined) {
    return null
  }

  try {
    return Object.freeze({
      transform: `translateX(${pianoRollClipTickToCssPixel(
        viewport,
        snapGuideTick,
      )}px)`,
    })
  } catch {
    return null
  }
})
const failureMessage = computed(
  () =>
    interactionFailureMessage.value ??
    readModelFailureMessage.value ??
    renderFailureMessage.value,
)
const accessibleStatus = computed(() => {
  if (failureMessage.value !== null) return failureMessage.value
  const noteCount = noteState.value?.notes.length ?? 0
  const selectedNoteCount = editorState.value?.selectedNoteIds.length ?? 0
  return `${props.presentation.name}, ${noteCount} visible MIDI ${
    noteCount === 1 ? 'note' : 'notes'
  }, ${selectedNoteCount} selected`
})

function describeCause(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return fallback
}

function describeFailure(cause: unknown): string {
  return describeCause(cause, 'The Piano Roll could not be rendered.')
}

function readThemeColor(style: CSSStyleDeclaration, token: string): string {
  return style.getPropertyValue(token).trim()
}

interface PianoRollSurfaceThemeSnapshot {
  readonly grid: PianoRollGridCanvasTheme
  readonly noteBorderColor: string
  readonly noteFillColor: string
  readonly selectedNoteBorderColor: string
  readonly selectedNoteGlowColor: string
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
    selectedNoteBorderColor: readThemeColor(
      style,
      '--sd-editor-note-selected-border',
    ),
    selectedNoteGlowColor: readThemeColor(
      style,
      '--sd-editor-note-selected-glow',
    ),
  })
}

function createDisplayGrid() {
  return createPianoRollGrid({
    barSpanTick: props.barSpanTick,
    beatSpanTick: parsePositiveTick(
      props.barSpanTick / props.timeSignatureNumerator,
    ),
    originTick: ZERO_TICK,
    subdivisionSpanTick: pianoRollPreferences.subdivisionSpanTick,
  })
}

function activateTool(tool: PianoRollTool): void {
  pianoRollPreferences.activateTool(tool)
}

function resolveInteractionTool(tool: PianoRollTool): PianoRollInteractionTool {
  switch (tool) {
    case PIANO_ROLL_TOOL.CURSOR:
      return PIANO_ROLL_INTERACTION_TOOL.CURSOR
    case PIANO_ROLL_TOOL.PENCIL:
      return PIANO_ROLL_INTERACTION_TOOL.PENCIL
  }
}

function handlePointerInput(input: PianoRollPointerInput): void {
  if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
    surfaceElement.value?.focus({ preventScroll: true })
  }

  const outcome = interactionSession.handlePointerInput(
    input,
    input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN
      ? {
          context: props.presentation.context,
          grid: createDisplayGrid(),
          selectedNoteIds: editorSession?.state.selectedNoteIds ?? [],
          session: props.session,
          snapEnabled: pianoRollPreferences.snapEnabled,
          tool: resolveInteractionTool(pianoRollPreferences.activeTool),
          viewport: noteState.value?.viewport ?? null,
        }
      : undefined,
  )

  if (outcome.failure !== null) {
    if (
      interactionState.value.status ===
      PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_MOVE
    ) {
      interactionSession.skipMoveCommit()
    } else if (
      interactionState.value.status ===
      PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE
    ) {
      interactionSession.skipResizeCommit()
    }
    const message = describeFailure(outcome.failure)
    interactionFailureMessage.value = message
    if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.END) {
      toasts.danger('Piano Roll interaction could not complete', message)
    }
    return
  }

  if (outcome.intent !== null) handleInteractionIntent(outcome.intent)
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
        movePreview: movePreview.value,
        notes: state.notes,
        resizePreview: resizePreview.value,
        style: {
          borderColor: theme.noteBorderColor,
          fillColor: theme.noteFillColor,
          opacity: props.presentation.muted ? 0.46 : 1,
          selectedBorderColor: theme.selectedNoteBorderColor,
          selectedGlowColor: theme.selectedNoteGlowColor,
        },
        selectedNoteIds: editorState.value?.selectedNoteIds ?? [],
        viewport: state.viewport,
      }),
    )
    renderFailureMessage.value = null
  } catch (cause) {
    renderFailureMessage.value = describeFailure(cause)
  }
}

function disposeEditorSession(): void {
  unsubscribeEditorSession?.()
  unsubscribeEditorSession = null
  editorSession?.dispose()
  editorSession = null
  editorState.value = null
}

function composeEditorSession(): void {
  disposeEditorSession()

  try {
    const nextEditorSession = createPianoRollEditorSession({
      context: props.presentation.context,
      session: props.session,
    })
    editorSession = nextEditorSession
    editorState.value = nextEditorSession.state
    unsubscribeEditorSession = nextEditorSession.subscribe({
      onError: (failure) => {
        interactionFailureMessage.value = describeFailure(failure.cause)
      },
      onStateChange: (state) => {
        editorState.value = state
        interactionFailureMessage.value = null
      },
    })
    interactionFailureMessage.value = null
  } catch (cause) {
    interactionFailureMessage.value = describeFailure(cause)
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
      readModelFailureMessage.value = null
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
        readModelFailureMessage.value = describeFailure(failure.cause)
      },
      onStateChange: (state) => {
        noteState.value = state
        interactionSession.notifyAuthorityRevision(state.modelRevision)
        readModelFailureMessage.value = null
      },
    })
    readModelFailureMessage.value = null
  } catch (cause) {
    readModelFailureMessage.value = describeFailure(cause)
  }
}

function recomposeReadModel(): void {
  disposeReadModel()
  createOrResizeReadModel()
}

function handleWindowResize(): void {
  createOrResizeReadModel()
}

function isPianoRollFocused(): boolean {
  const element = surfaceElement.value
  return (
    element !== null &&
    (element === element.ownerDocument.activeElement ||
      element.contains(element.ownerDocument.activeElement))
  )
}

function removeSelectedNotes(): boolean {
  const selectedNoteIds = editorState.value?.selectedNoteIds ?? []
  if (selectedNoteIds.length === 0) return false

  try {
    projectMidiNotes.removeMidiNotes({
      clipId: props.presentation.context.clipId,
      noteIds: selectedNoteIds,
    })
    interactionFailureMessage.value = null
  } catch (cause) {
    const message = describeCause(
      cause,
      'The Project rejected the MIDI Note removal. Please try again.',
    )
    interactionFailureMessage.value = message
    toasts.danger('MIDI notes could not be removed', message)
  }

  // Once an enabled editor Action claims Delete/Backspace, browser defaults stay suppressed
  // even when the Project rejects the command.
  return true
}

function clearSelectionOrCancelInteraction(): boolean {
  if (hasCancellablePointerInteraction()) {
    if (!(pointerInputAdapter?.cancel() ?? false)) {
      interactionSession.cancel()
    }
    interactionFailureMessage.value = null
    return true
  }

  return editorSession?.clearSelection() ?? false
}

function hasCancellablePointerInteraction(): boolean {
  return interactionState.value.pointerId !== null
}

const disposeKeyboardShortcut = keyboardShortcuts.register([
  {
    actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE,
    bindings: keyboardShortcuts.bindingsFor(
      STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE,
    ),
    description: 'Remove the selected Notes from the focused Piano Roll.',
    isEnabled: () =>
      isPianoRollFocused() &&
      (editorState.value?.selectedNoteIds.length ?? 0) > 0,
    label: 'Remove selected Piano Roll notes',
    run: removeSelectedNotes,
    scope: STUDIO_KEYBOARD_SCOPE.PIANO_ROLL,
  },
  {
    actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
    bindings: keyboardShortcuts.bindingsFor(
      STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
    ),
    description: 'Cancel the active interaction or clear the Note selection.',
    isEnabled: () =>
      isPianoRollFocused() &&
      (hasCancellablePointerInteraction() ||
        (editorState.value?.selectedNoteIds.length ?? 0) > 0),
    label: 'Clear Piano Roll selection',
    run: clearSelectionOrCancelInteraction,
    scope: STUDIO_KEYBOARD_SCOPE.PIANO_ROLL,
  },
])

composeEditorSession()

watch(
  () => [
    props.presentation.context.clipId,
    props.presentation.context.clipSpanTick,
    props.presentation.context.sourceId,
    props.presentation.context.sourceStartTick,
    props.session,
  ],
  () => {
    if (!(pointerInputAdapter?.cancel() ?? false)) {
      interactionSession.cancel()
    }
    recomposeReadModel()
    composeEditorSession()
  },
)
watchEffect(render)

onMounted(() => {
  const grid = gridCanvas.value
  const notes = noteHost.value
  const host = canvasHost.value
  const surface = surfaceElement.value
  if (grid === null || notes === null || host === null || surface === null) return

  try {
    gridRenderer.value = createPianoRollGridCanvasRenderer({
      canvas: grid,
    })
    noteRenderer.value = createProjectPianoRollNoteRenderer({
      container: notes,
    })
    pointerInputAdapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: (failure) => {
          interactionFailureMessage.value = describeFailure(failure.cause)
        },
        onInput: handlePointerInput,
      },
      surface: host,
    })
  } catch (cause) {
    pointerInputAdapter?.dispose()
    pointerInputAdapter = null
    gridRenderer.value?.dispose()
    gridRenderer.value = null
    noteRenderer.value?.dispose()
    noteRenderer.value = null
    renderFailureMessage.value = describeFailure(cause)
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
  disposeKeyboardShortcut()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', handleWindowResize)
  pointerInputAdapter?.dispose()
  pointerInputAdapter = null
  unsubscribeInteractionSession()
  interactionSession.dispose()
  disposeEditorSession()
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
    :data-moving-notes="movePreview !== null"
    :data-resizing-note="resizePreview !== null"
    :data-snap-enabled="pianoRollPreferences.snapEnabled"
    :data-tool="pianoRollPreferences.activeTool"
    tabindex="0"
  >
    <header class="project-piano-roll__toolbar" aria-label="Piano Roll controls">
      <div
        class="project-piano-roll__tool-group"
        role="group"
        aria-label="Editing tool"
      >
        <UiIconButton
          :icon="PenIcon"
          label="Pencil tool"
          :pressed="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.PENCIL"
          size="small"
          @click="activateTool(PIANO_ROLL_TOOL.PENCIL)"
        />
        <UiIconButton
          :icon="CursorIcon"
          label="Cursor tool"
          :pressed="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.CURSOR"
          size="small"
          @click="activateTool(PIANO_ROLL_TOOL.CURSOR)"
        />
      </div>
      <span class="project-piano-roll__toolbar-divider" aria-hidden="true"></span>
      <div class="project-piano-roll__snap-control">
        <UiIconButton
          :icon="GridIcon"
          :label="`Snap to ${pianoRollPreferences.gridPreset} grid — ${
            pianoRollPreferences.snapEnabled ? 'on' : 'off'
          }`"
          :pressed="pianoRollPreferences.snapEnabled"
          size="small"
          @click="pianoRollPreferences.toggleSnap()"
        />
        <span aria-hidden="true">{{ pianoRollPreferences.gridPreset }}</span>
      </div>
    </header>

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
      <div
        v-if="snapGuideStyle"
        class="project-piano-roll__snap-guide"
        :style="snapGuideStyle"
        aria-hidden="true"
      ></div>
      <div ref="noteHost" class="project-piano-roll__note-host"></div>
    </div>

    <PianoRollPlayhead
      v-if="noteState"
      :presentation="props.presentation"
      :viewport="noteState.viewport"
    />

    <p class="project-piano-roll__accessible-status" aria-live="polite">
      {{ accessibleStatus }}
    </p>
    <ul v-if="noteState" class="project-piano-roll__accessible-status">
      <li v-for="visibleNote in noteState.notes" :key="visibleNote.note.id">
        MIDI note {{ visibleNote.note.pitch }}, starts at
        {{ visibleNote.visibleStartTick }} ticks, duration
        {{ visibleNote.note.durationTick }} ticks{{
          editorState?.selectedNoteIds.includes(visibleNote.note.id)
            ? ', selected'
            : ''
        }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.project-piano-roll {
  --project-piano-roll-keyboard-width: 4.5rem;
  --project-piano-roll-ruler-height: 1.625rem;
  --project-piano-roll-toolbar-height: 2.25rem;
  position: relative;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-template-columns: var(--project-piano-roll-keyboard-width) minmax(0, 1fr);
  grid-template-rows:
    var(--project-piano-roll-toolbar-height)
    var(--project-piano-roll-ruler-height)
    minmax(0, 1fr);
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
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll__tool-group,
.project-piano-roll__snap-control {
  display: flex;
  align-items: center;
  gap: var(--sd-space-1);
}

.project-piano-roll__toolbar-divider {
  inline-size: 1px;
  block-size: 1rem;
  background: var(--sd-color-border-default);
}

.project-piano-roll__snap-control > span {
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
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
