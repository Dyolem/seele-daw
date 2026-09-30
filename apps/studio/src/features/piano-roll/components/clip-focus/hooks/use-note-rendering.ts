import {
  createPianoRollGridCanvasRenderer,
  createPianoRollNoteScene,
  pianoRollClipTickToCssPixel,
  type PianoRollGrid,
  type PianoRollGridCanvasRenderer,
  type PianoRollNoteRenderer,
} from '@seele-daw/editor'
import { computed, shallowRef, watchEffect } from 'vue'
import { createProjectPianoRollNoteRenderer } from '@/features/piano-roll/presentation/project-piano-roll-note-renderer'
import { createPianoRollThemeSnapshot } from '@/features/piano-roll/presentation/piano-roll-theme'
import { describeFailure } from '@/features/piano-roll/presentation/piano-roll-feedback'
import type {
  PianoRollClipNoteModel,
  PianoRollNoteInteraction,
  PianoRollSurfaceElements,
  ProjectPianoRollSurfaceProps,
} from '@/features/piano-roll/components/clip-focus/types/clip-focus'

/** Projects authority and previews through replaceable renderers. */
export function useNoteRendering({
  props,
  elements,
  model,
  interaction,
  createDisplayGrid,
}: {
  readonly props: ProjectPianoRollSurfaceProps
  readonly elements: PianoRollSurfaceElements
  readonly model: PianoRollClipNoteModel
  readonly interaction: PianoRollNoteInteraction
  readonly createDisplayGrid: () => PianoRollGrid
}) {
  const { surfaceElement, gridCanvas, noteHost } = elements
  const { noteState, editorState } = model
  const gridRenderer = shallowRef<PianoRollGridCanvasRenderer | null>(null)
  const noteRenderer = shallowRef<PianoRollNoteRenderer | null>(null)
  let disposed = false
  const renderFailureMessage = shallowRef<string | null>(null)
  const movePreview = computed(() => interaction.state.value.movePreview)
  const resizePreview = computed(() => interaction.state.value.resizePreview)
  const snapGuideStyle = computed(() => {
    const snapGuideTick = resizePreview.value?.snapGuideTick ?? movePreview.value?.snapGuideTick
    const viewport = noteState.value?.viewport
    if (snapGuideTick === null || snapGuideTick === undefined || viewport === undefined) {
      return null
    }

    try {
      return Object.freeze({
        transform: `translateX(${pianoRollClipTickToCssPixel(viewport, snapGuideTick)}px)`,
      })
    } catch {
      return null
    }
  })
  function render(): void {
    if (disposed) return
    const currentGridRenderer = gridRenderer.value
    const currentNoteRenderer = noteRenderer.value
    const state = noteState.value
    if (currentGridRenderer === null || currentNoteRenderer === null || state === null) {
      return
    }

    try {
      const element = surfaceElement.value
      if (element === null) return
      const theme = createPianoRollThemeSnapshot(element, props.presentation.color)
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
      interaction.cancel()
      renderFailureMessage.value = describeFailure(cause)
    }
  }

  watchEffect(render)
  return {
    failureMessage: renderFailureMessage,
    movePreview,
    resizePreview,
    snapGuideStyle,
    mount() {
      const grid = gridCanvas.value
      const notes = noteHost.value
      if (disposed || grid === null || notes === null) return
      gridRenderer.value = createPianoRollGridCanvasRenderer({ canvas: grid })
      noteRenderer.value = createProjectPianoRollNoteRenderer({ container: notes })
    },
    dispose() {
      disposed = true
      noteRenderer.value?.dispose()
      noteRenderer.value = null
      gridRenderer.value?.dispose()
      gridRenderer.value = null
    },
  }
}
