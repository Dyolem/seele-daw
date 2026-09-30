import { resolvePianoRollDomNoteHit } from '@seele-daw/editor'
import type { ShallowRef } from 'vue'
import {
  describeCause,
  describeFailure,
} from '@/features/piano-roll/presentation/piano-roll-feedback'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import type { PianoRollContextMenuTarget } from '@/features/piano-roll/types/piano-roll-context-menu-target'
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
import {
  useStudioEditorSelectionTarget,
  useStudioInteractionTarget,
} from '@/workbench/actions/vue/studio-editor-action-context'
import { useProjectMidiNotes } from '@/workbench/project/midi-note/vue/project-midi-note-context'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

/** Routes context menus and shared Actions to the most recently focused editing target. */
export function useEditingActions({
  props,
  elements,
  model,
  interaction,
  focusedEditingTarget,
  interactionFailureMessage,
}: {
  readonly props: ProjectPianoRollSurfaceProps
  readonly elements: PianoRollSurfaceElements
  readonly model: PianoRollClipNoteModel
  readonly interaction: PianoRollNoteInteraction
  readonly focusedEditingTarget: ShallowRef<FocusedPianoRollEditingTarget>
  readonly interactionFailureMessage: ShallowRef<string | null>
}) {
  const { surfaceElement, canvasHost, sustainPedalLane } = elements
  const { editorState } = model
  const interactionState = interaction.state
  const { projectMidiNotes } = useProjectMidiNotes()
  const pianoRollPreferences = usePianoRollPreferencesStore()
  const toasts = useUiToastStore()
  function isPianoRollFocused(): boolean {
    const element = surfaceElement.value
    return (
      element !== null &&
      (element === element.ownerDocument.activeElement ||
        element.contains(element.ownerDocument.activeElement))
    )
  }

  function prepareContextMenu(event: MouseEvent): PianoRollContextMenuTarget | null {
    if (
      interactionState.value.pointerId !== null ||
      sustainPedalLane.value?.hasCancellableInteraction()
    )
      return null

    const host = canvasHost.value
    if (
      host === null ||
      (!event.composedPath().includes(host) && event.target !== surfaceElement.value)
    ) {
      const focusElement = sustainPedalLane.value?.prepareContextMenu(event)
      if (!focusElement) return null
      selectionTarget.activate()
      const binding = selectionTarget.binding
      return binding ? { binding, focusElement } : null
    }
    const currentEditor = model.editorSession
    if (currentEditor === null) return null
    try {
      const hit = resolvePianoRollDomNoteHit(event, host)
      if (hit !== null && !currentEditor.state.selectedNoteIds.includes(hit.noteId)) {
        if (!currentEditor.selectOnly(hit.noteId)) return null
      }
      focusedEditingTarget.value = 'notes'
      const focusElement = surfaceElement.value
      if (focusElement === null || currentEditor.state.selectedNoteIds.length === 0) return null
      focusElement.focus({ preventScroll: true })
      selectionTarget.activate()
      const binding = selectionTarget.binding
      return binding ? { binding, focusElement } : null
    } catch (cause) {
      interactionFailureMessage.value = describeFailure(cause)
      toasts.danger('MIDI notes could not be selected', interactionFailureMessage.value)
      return null
    }
  }

  function removeSelectedNotes(): StudioActionCompletion {
    const selectedNoteIds = editorState.value?.selectedNoteIds ?? []
    if (selectedNoteIds.length === 0) return STUDIO_ACTION_NOT_APPLIED
    try {
      projectMidiNotes.removeMidiNotes({
        clipId: props.presentation.context.clipId,
        noteIds: selectedNoteIds,
      })
      interactionFailureMessage.value = null
      return STUDIO_ACTION_COMPLETED
    } catch (cause) {
      const message = describeCause(
        cause,
        'The Project rejected the MIDI Note removal. Please try again.',
      )
      interactionFailureMessage.value = message
      toasts.danger('MIDI notes could not be removed', message)
      return { status: 'failed', cause, reported: true }
    }
  }

  function hasFocusedSelection(): boolean {
    return focusedEditingTarget.value === 'sustain-pedal'
      ? (sustainPedalLane.value?.hasSelection() ?? false)
      : (editorState.value?.selectedNoteIds.length ?? 0) > 0
  }

  function removeFocusedSelection(): StudioActionCompletion {
    return focusedEditingTarget.value === 'sustain-pedal'
      ? (sustainPedalLane.value?.removeSelectedEvents() ?? STUDIO_ACTION_NOT_APPLIED)
      : removeSelectedNotes()
  }

  function clearSelection(): StudioActionCompletion {
    if (focusedEditingTarget.value === 'sustain-pedal') {
      return sustainPedalLane.value?.clearSelection() ?? STUDIO_ACTION_NOT_APPLIED
    }
    return model.editorSession?.clearSelection()
      ? STUDIO_ACTION_COMPLETED
      : STUDIO_ACTION_NOT_APPLIED
  }

  function handleFocusIn(): void {
    focusedEditingTarget.value = sustainPedalLane.value?.isFocused() ? 'sustain-pedal' : 'notes'
    selectionTarget.activate()
  }

  function focusSustainPedalLane(): void {
    focusedEditingTarget.value = 'sustain-pedal'
  }

  const selectionTarget = useStudioEditorSelectionTarget(
    {
      isFocused: isPianoRollFocused,
      hasSelection: hasFocusedSelection,
      selectionLabel: () =>
        focusedEditingTarget.value === 'sustain-pedal' ? 'Sustain Pedal events' : 'Notes',
      deleteSelection: removeFocusedSelection,
      clearSelection,
    },
    [
      () => props.session,
      () => props.presentation.projectId,
      () => props.presentation.context.clipId,
      () => props.presentation.context.clipSpanTick,
      () => props.presentation.context.sourceId,
      () => props.presentation.context.sourceStartTick,
      () => pianoRollPreferences.sustainPedalChannel,
      focusedEditingTarget,
    ],
  )
  useStudioInteractionTarget({
    isActive: () => interactionState.value.pointerId !== null,
    cancel: interaction.cancelAction,
  })
  useStudioInteractionTarget({
    isActive: () => sustainPedalLane.value?.hasCancellableInteraction() ?? false,
    cancel: () => sustainPedalLane.value?.cancelInteraction() ?? STUDIO_ACTION_NOT_APPLIED,
  })
  return { prepareContextMenu, handleFocusIn, focusSustainPedalLane }
}
