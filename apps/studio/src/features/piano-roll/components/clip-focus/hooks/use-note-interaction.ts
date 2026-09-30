import {
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollPointerInputAdapter,
  type PianoRollGrid,
  type PianoRollInteractionSession,
  type PianoRollInteractionState,
  type PianoRollInteractionTool,
  type PianoRollPointerInput,
  type PianoRollPointerInputAdapter,
} from '@seele-daw/editor'
import { shallowRef, type ShallowRef } from 'vue'
import { createProjectPianoRollIntentHandler } from '@/features/piano-roll/interaction/project-piano-roll-intent-handler'
import { describeFailure } from '@/features/piano-roll/presentation/piano-roll-feedback'
import {
  PIANO_ROLL_TOOL,
  type PianoRollTool,
} from '@/features/piano-roll/types/piano-roll-preferences'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import type {
  FocusedPianoRollEditingTarget,
  PianoRollClipNoteModel,
  PianoRollNoteInteraction,
  PianoRollSurfaceElements,
  ProjectPianoRollSurfaceProps,
} from '@/features/piano-roll/components/clip-focus/types/clip-focus'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { useProjectMidiNotes } from '@/workbench/project/midi-note/vue/project-midi-note-context'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

/** Owns browser capture and forwards neutral input to the Editor interaction authority. */
export function useNoteInteraction({
  props,
  elements,
  model,
  interactionSession,
  focusedEditingTarget,
  interactionFailureMessage,
  createDisplayGrid,
}: {
  readonly props: ProjectPianoRollSurfaceProps
  readonly elements: PianoRollSurfaceElements
  readonly model: PianoRollClipNoteModel
  readonly interactionSession: PianoRollInteractionSession
  readonly focusedEditingTarget: ShallowRef<FocusedPianoRollEditingTarget>
  readonly interactionFailureMessage: ShallowRef<string | null>
  readonly createDisplayGrid: () => PianoRollGrid
}): PianoRollNoteInteraction {
  const { canvasHost, surfaceElement } = elements
  const { noteState } = model
  const { projectMidiNotes } = useProjectMidiNotes()
  const pianoRollPreferences = usePianoRollPreferencesStore()
  const toasts = useUiToastStore()
  const interactionState = shallowRef<PianoRollInteractionState>(interactionSession.state)
  let disposed = false
  let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
  let captureBounds: Readonly<{ left: number; top: number }> | null = null
  const handleInteractionIntent = createProjectPianoRollIntentHandler({
    getAuthorityRevision: () => noteState.value?.modelRevision ?? null,
    getSession: () => props.session,
    getEditorSession: () => model.editorSession,
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
      const wasCapturing = interactionState.value.pointerId !== null
      interactionState.value = state
      if (state.pointerId === null) {
        captureBounds = null
        if (wasCapturing) pointerInputAdapter?.cancel()
      }
    },
  })
  function resolveInteractionTool(tool: PianoRollTool): PianoRollInteractionTool {
    switch (tool) {
      case PIANO_ROLL_TOOL.CURSOR:
        return PIANO_ROLL_INTERACTION_TOOL.CURSOR
      case PIANO_ROLL_TOOL.PENCIL:
        return PIANO_ROLL_INTERACTION_TOOL.PENCIL
    }
  }

  function handlePointerInput(input: PianoRollPointerInput): void {
    if (disposed) return
    if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
      focusedEditingTarget.value = 'notes'
      surfaceElement.value?.focus({ preventScroll: true })
    } else if (
      input.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL &&
      !hasStablePointerMapping()
    ) {
      return
    }

    const outcome = interactionSession.handlePointerInput(
      input,
      input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN
        ? {
            context: props.presentation.context,
            grid: createDisplayGrid(),
            selectedNoteIds: model.editorSession?.state.selectedNoteIds ?? [],
            session: props.session,
            snapEnabled: pianoRollPreferences.snapEnabled,
            tool: resolveInteractionTool(pianoRollPreferences.activeTool),
            viewport: noteState.value?.viewport ?? null,
          }
        : undefined,
    )

    if (outcome.failure !== null) {
      pointerInputAdapter?.cancel()
      const message = describeFailure(outcome.failure)
      interactionFailureMessage.value = message
      if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.END) {
        toasts.danger('Piano Roll interaction could not complete', message)
      }
      return
    }

    if (
      input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN &&
      interactionState.value.pointerId === input.pointerId
    ) {
      // Begin may first retire a previous commit handoff, which clears the old mapping.
      captureBounds = canvasHost.value?.getBoundingClientRect() ?? null
    }

    if (outcome.intent !== null) handleInteractionIntent(outcome.intent)
  }

  function hasStablePointerMapping(): boolean {
    if (disposed) return false
    if (captureBounds === null) return true
    const bounds = canvasHost.value?.getBoundingClientRect()
    if (bounds?.left === captureBounds.left && bounds.top === captureBounds.top) return true
    interactionSession.cancel()
    return false
  }

  function handleSurfaceScroll(): void {
    hasStablePointerMapping()
  }

  function cancelNoteInteraction(): StudioActionCompletion {
    if (interactionState.value.pointerId === null) return STUDIO_ACTION_NOT_APPLIED
    if (!(pointerInputAdapter?.cancel() ?? false)) interactionSession.cancel()
    interactionFailureMessage.value = null
    return STUDIO_ACTION_COMPLETED
  }

  function disposeInput(): void {
    window.removeEventListener('scroll', handleSurfaceScroll, true)
    pointerInputAdapter?.dispose()
    pointerInputAdapter = null
  }

  return {
    state: interactionState,
    cancel() {
      if (disposed) return
      if (!(pointerInputAdapter?.cancel() ?? false)) interactionSession.cancel()
    },
    cancelAction: cancelNoteInteraction,
    hasStablePointerMapping,
    mount() {
      const host = canvasHost.value
      if (disposed || host === null || pointerInputAdapter !== null) return
      window.addEventListener('scroll', handleSurfaceScroll, true)
      pointerInputAdapter = createPianoRollPointerInputAdapter({
        observer: {
          onError: (failure) => {
            interactionSession.cancel()
            interactionFailureMessage.value = describeFailure(failure.cause)
          },
          onInput: handlePointerInput,
        },
        surface: host,
      })
    },
    disposeInput,
    dispose() {
      if (disposed) return
      disposed = true
      disposeInput()
      unsubscribeInteractionSession()
      interactionSession.dispose()
    },
  }
}
