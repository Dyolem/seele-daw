import {
  PIANO_ROLL_INTERACTION_INTENT,
  applyPianoRollSelectInteraction,
  type PianoRollAddNoteIntent,
  type PianoRollEditorSession,
  type PianoRollInteractionIntent,
  type PianoRollInteractionSession,
  type PianoRollMoveNotesIntent,
  type PianoRollResizeNoteIntent,
  type PianoRollResolveSelectionIntent,
} from '@seele-daw/editor'
import type { ModelRevision, NoteId, ProjectSession } from '@seele-daw/project-core'

import type { ProjectMidiNoteCoordinator } from '@/workbench/project/midi-note/project-midi-note-coordinator'

export interface ProjectPianoRollIntentHandlerDependencies {
  readonly getAuthorityRevision: () => ModelRevision | null
  readonly getSession: () => Pick<ProjectSession, 'query'>
  readonly getEditorSession: () => PianoRollEditorSession | null
  readonly interactionSession: Pick<
    PianoRollInteractionSession,
    'claimCompletion' | 'resolveCommit' | 'finish'
  >
  readonly projectMidiNotes: ProjectMidiNoteCoordinator
  readonly reportDanger: (title: string, description: string) => void
  readonly reportWarning: (title: string, description: string) => void
  readonly setFailureMessage: (message: string | null) => void
}

export type ProjectPianoRollIntentHandler = (intent: PianoRollInteractionIntent) => void

function describeCause(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message
  }
  return fallback
}

function acknowledgeCommit(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
  intent: PianoRollInteractionIntent,
  commitRevision: ModelRevision,
): boolean {
  try {
    dependencies.interactionSession.resolveCommit({
      interactionId: intent.interactionId,
      authorityRevision: dependencies.getAuthorityRevision() ?? intent.target.baseRevision,
      commitRevision,
    })
    return true
  } catch (cause) {
    const message = describeCause(
      cause,
      'The Note edit was committed, but its preview could not be updated.',
    )
    dependencies.setFailureMessage(message)
    dependencies.reportWarning('MIDI note edit was committed but could not be displayed', message)
    return false
  }
}

function selectOnlyCommittedNote(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
  editorSession: PianoRollEditorSession,
  noteId: NoteId,
  failureTitle: string,
  failureFallback: string,
): boolean {
  try {
    editorSession.selectOnly(noteId)
    if (editorSession.state.selectedNoteIds.includes(noteId)) return true
    dependencies.setFailureMessage(failureFallback)
    dependencies.reportWarning(failureTitle, failureFallback)
  } catch (cause) {
    const message = describeCause(cause, failureFallback)
    dependencies.setFailureMessage(message)
    dependencies.reportWarning(failureTitle, message)
  }
  return false
}

function handleSelectionIntent(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
  intent: PianoRollResolveSelectionIntent,
): void {
  const editorSession = dependencies.getEditorSession()
  if (editorSession === null) return

  try {
    applyPianoRollSelectInteraction(editorSession, intent.selection)
    dependencies.setFailureMessage(null)
  } catch (cause) {
    dependencies.setFailureMessage(
      describeCause(cause, 'The Piano Roll selection could not be updated.'),
    )
  }
}

function handleAddNoteIntent(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
  intent: PianoRollAddNoteIntent,
): void {
  const editorSession = dependencies.getEditorSession()
  if (editorSession === null) {
    const message = 'The Piano Roll is not ready to place a MIDI Note.'
    dependencies.setFailureMessage(message)
    dependencies.reportDanger('MIDI note could not be added', message)
    return
  }

  let addedNoteId: NoteId
  try {
    const result = dependencies.projectMidiNotes.addMidiNote({
      expectedSession: intent.target.session,
      baseRevision: intent.target.baseRevision,
      clipId: intent.target.context.clipId,
      clipStartTick: intent.placement.clipStartTick,
      pitch: intent.placement.pitch,
      requestedDurationTick: intent.placement.requestedDurationTick,
    })
    addedNoteId = result.noteId
    if (!acknowledgeCommit(dependencies, intent, result.commit.modelRevision)) return
  } catch (cause) {
    const message = describeCause(
      cause,
      'The Project rejected the MIDI Note command. Please try again.',
    )
    dependencies.setFailureMessage(message)
    dependencies.reportDanger('MIDI note could not be added', message)
    return
  }

  if (
    !selectOnlyCommittedNote(
      dependencies,
      editorSession,
      addedNoteId,
      'MIDI note was added but could not be selected',
      'The MIDI Note was added, but its selection could not be restored.',
    )
  ) {
    return
  }

  dependencies.setFailureMessage(null)
}

function handleMoveNotesIntent(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
  intent: PianoRollMoveNotesIntent,
): void {
  const editorSession = dependencies.getEditorSession()
  if (editorSession === null) {
    return
  }

  try {
    const preview = intent.preview
    const result =
      preview.deltaTick === 0 && preview.deltaPitch === 0
        ? null
        : dependencies.projectMidiNotes.moveMidiNotes({
            baseRevision: intent.target.baseRevision,
            expectedSession: intent.target.session,
            clipId: intent.target.context.clipId,
            deltaPitch: preview.deltaPitch,
            deltaTick: preview.deltaTick,
            noteIds: preview.movedNoteIds,
          })

    if (result !== null) {
      if (!acknowledgeCommit(dependencies, intent, result.commit.modelRevision)) return
      if (
        intent.gesture.selectOnlyOnCommit &&
        !selectOnlyCommittedNote(
          dependencies,
          editorSession,
          intent.gesture.anchorNoteId,
          'MIDI notes were moved but selection could not be updated',
          'The MIDI Notes were moved, but the target Note could not be selected.',
        )
      ) {
        return
      }
    }
    dependencies.setFailureMessage(null)
  } catch (cause) {
    const message = describeCause(
      cause,
      'The Project rejected the MIDI Note move. Please try again.',
    )
    dependencies.setFailureMessage(message)
    dependencies.reportDanger('MIDI notes could not be moved', message)
  }
}

function handleResizeNoteIntent(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
  intent: PianoRollResizeNoteIntent,
): void {
  const editorSession = dependencies.getEditorSession()
  if (editorSession === null) {
    return
  }

  try {
    const result = dependencies.projectMidiNotes.resizeMidiNote({
      baseRevision: intent.target.baseRevision,
      expectedSession: intent.target.session,
      clipId: intent.target.context.clipId,
      durationTick: intent.preview.durationTick,
      noteId: intent.preview.resizedNoteId,
      sourceStartTick: intent.preview.sourceStartTick,
    })

    if (result !== null) {
      if (!acknowledgeCommit(dependencies, intent, result.commit.modelRevision)) return
      if (
        intent.gesture.selectOnlyOnCommit &&
        !selectOnlyCommittedNote(
          dependencies,
          editorSession,
          intent.preview.resizedNoteId,
          'MIDI note was resized but could not be selected',
          'The MIDI Note was resized, but its selection could not be restored.',
        )
      ) {
        return
      }
    }
    dependencies.setFailureMessage(null)
  } catch (cause) {
    const message = describeCause(
      cause,
      'The Project rejected the MIDI Note resize. Please try again.',
    )
    dependencies.setFailureMessage(message)
    dependencies.reportDanger('MIDI note could not be resized', message)
  }
}

/** Applies one Editor intent at the Studio command, selection and feedback boundary. */
export function createProjectPianoRollIntentHandler(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
): ProjectPianoRollIntentHandler {
  return (intent) => {
    if (!dependencies.interactionSession.claimCompletion(intent.interactionId)) return
    try {
      const editorSession = dependencies.getEditorSession()
      if (
        dependencies.getSession() !== intent.target.session ||
        editorSession?.state.clipId !== intent.target.context.clipId ||
        editorSession.state.sourceId !== intent.target.context.sourceId
      )
        return

      switch (intent.type) {
        case PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION:
          handleSelectionIntent(dependencies, intent)
          return
        case PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE:
          handleAddNoteIntent(dependencies, intent)
          return
        case PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES:
          handleMoveNotesIntent(dependencies, intent)
          return
        case PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE:
          handleResizeNoteIntent(dependencies, intent)
      }
    } finally {
      dependencies.interactionSession.finish(intent.interactionId)
    }
  }
}
