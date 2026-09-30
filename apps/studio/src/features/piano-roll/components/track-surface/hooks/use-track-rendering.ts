import { shallowRef, watchEffect, type ShallowRef } from 'vue'
import {
  createPianoRollGridCanvasRenderer,
  createPianoRollNoteScene,
  type PianoRollGrid,
  type PianoRollGridCanvasRenderer,
  type PianoRollNoteRenderer,
  type PianoRollTimelineViewport,
  type PianoRollVisibleNote,
} from '@seele-daw/editor'
import { createProjectPianoRollNoteRenderer } from '@/features/piano-roll/presentation/project-piano-roll-note-renderer'
import { createPianoRollThemeSnapshot } from '@/features/piano-roll/presentation/piano-roll-theme'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'

export function useTrackRendering({
  surfaceElement,
  gridCanvas,
  noteHost,
  getPresentation,
  getViewport,
  getVisibleNotes,
  createDisplayGrid,
  failureMessage,
}: {
  readonly surfaceElement: Readonly<ShallowRef<HTMLElement | null>>
  readonly gridCanvas: Readonly<ShallowRef<HTMLCanvasElement | null>>
  readonly noteHost: Readonly<ShallowRef<HTMLElement | null>>
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getViewport: () => PianoRollTimelineViewport | null
  readonly getVisibleNotes: () => readonly PianoRollVisibleNote[]
  readonly createDisplayGrid: () => PianoRollGrid
  readonly failureMessage: ShallowRef<string | null>
}) {
  const gridRenderer = shallowRef<PianoRollGridCanvasRenderer | null>(null)
  const noteRenderer = shallowRef<PianoRollNoteRenderer | null>(null)
  let disposed = false
  function createThemeSnapshot() {
    const element = surfaceElement.value
    if (element === null) throw new Error('Track Piano Roll surface is not mounted')
    return createPianoRollThemeSnapshot(element, getPresentation().color)
  }

  function render(): void {
    if (disposed) return
    const nextViewport = getViewport()
    const currentGridRenderer = gridRenderer.value
    const currentNoteRenderer = noteRenderer.value
    if (nextViewport === null || currentGridRenderer === null || currentNoteRenderer === null) {
      return
    }

    try {
      const theme = createThemeSnapshot()
      currentGridRenderer.render({
        grid: createDisplayGrid(),
        theme: theme.grid,
        viewport: nextViewport,
      })
      currentNoteRenderer.render(
        createPianoRollNoteScene({
          notes: getVisibleNotes(),
          selectedNoteIds: Object.freeze([]),
          style: {
            borderColor: theme.noteBorderColor,
            fillColor: theme.noteFillColor,
            opacity: getPresentation().muted ? 0.46 : 1,
            selectedBorderColor: theme.selectedNoteBorderColor,
            selectedGlowColor: theme.selectedNoteGlowColor,
          },
          viewport: nextViewport,
        }),
      )
      failureMessage.value = null
    } catch (cause) {
      failureMessage.value = describeCause(cause, 'The Track Piano Roll could not be rendered.')
    }
  }

  watchEffect(render)

  return {
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
