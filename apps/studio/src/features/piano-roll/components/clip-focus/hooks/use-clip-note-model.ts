import {
  createPianoRollEditorSession,
  createPianoRollNoteReadModel,
  createInitialPianoRollViewport,
  type PianoRollEditorSession,
  type PianoRollEditorSessionState,
  type PianoRollNoteReadModel,
  type PianoRollNoteReadModelState,
  type PianoRollInteractionSession,
} from '@seele-daw/editor'
import { shallowRef, watch, type ShallowRef } from 'vue'
import { describeFailure } from '@/features/piano-roll/presentation/piano-roll-feedback'
import type { PianoRollSurfaceGeometry } from '@/features/piano-roll/types/piano-roll-pitch-viewport'
import type {
  PianoRollClipNoteModel,
  ProjectPianoRollSurfaceProps,
} from '@/features/piano-roll/components/clip-focus/types/clip-focus'

/** Composes Editor selection and read models against one Clip target. */
export function useClipNoteModel({
  props,
  getGeometry,
  interactionSession,
  interactionFailureMessage,
}: {
  readonly props: ProjectPianoRollSurfaceProps
  readonly getGeometry: () => PianoRollSurfaceGeometry | null
  readonly interactionSession: PianoRollInteractionSession
  readonly interactionFailureMessage: ShallowRef<string | null>
}): PianoRollClipNoteModel {
  const noteState = shallowRef<PianoRollNoteReadModelState | null>(null)
  const editorState = shallowRef<PianoRollEditorSessionState | null>(null)
  const readModelFailureMessage = shallowRef<string | null>(null)
  let editorSession: PianoRollEditorSession | null = null
  let unsubscribeEditorSession: (() => void) | null = null
  let readModel: PianoRollNoteReadModel | null = null
  let unsubscribeReadModel: (() => void) | null = null
  let disposed = false
  let stopViewport: (() => void) | null = null

  function disposeEditorSession(): void {
    unsubscribeEditorSession?.()
    unsubscribeEditorSession = null
    editorSession?.dispose()
    editorSession = null
    editorState.value = null
  }

  function composeEditorSession(): void {
    if (disposed) return
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
          // Selection changes from another action invalidate the captured Note operation.
          if (
            interactionSession.state.pointerId !== null &&
            (editorState.value?.selectedNoteIds.length !== state.selectedNoteIds.length ||
              state.selectedNoteIds.some(
                (noteId) => !editorState.value?.selectedNoteIds.includes(noteId),
              ))
          )
            interactionSession.cancel()
          editorState.value = state
          interactionFailureMessage.value = null
        },
      })
      interactionFailureMessage.value = null
    } catch (cause) {
      disposeEditorSession()
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
    if (disposed) return
    const geometry = getGeometry()
    if (geometry === null) {
      interactionSession.notifyViewport(null)
      disposeReadModel()
      return
    }

    try {
      const viewport = createInitialPianoRollViewport(props.presentation.context, geometry)
      interactionSession.notifyViewport(viewport)
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
          interactionSession.cancel()
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
      disposeReadModel()
      readModelFailureMessage.value = describeFailure(cause)
    }
  }

  function recomposeReadModel(): void {
    disposeReadModel()
    createOrResizeReadModel()
  }

  composeEditorSession()
  return {
    get editorSession() {
      return editorSession
    },
    editorState,
    noteState,
    failureMessage: readModelFailureMessage,
    mount() {
      if (disposed || stopViewport !== null) return
      stopViewport = watch(getGeometry, createOrResizeReadModel, { immediate: true, flush: 'sync' })
    },
    recompose() {
      if (disposed) return
      recomposeReadModel()
      composeEditorSession()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopViewport?.()
      stopViewport = null
      disposeEditorSession()
      disposeReadModel()
    },
  }
}
