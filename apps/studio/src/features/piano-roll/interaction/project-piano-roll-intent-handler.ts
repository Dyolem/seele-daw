import {
  PIANO_ROLL_INTERACTION_INTENT,
  applyPianoRollSelectInteraction,
  completeGesture,
  type PianoRollEditorSession,
  type PianoRollInteractionIntent,
} from '@seele-daw/editor'
import type { NoteId, ProjectCommit } from '@seele-daw/project-core'

import type {
  ProjectPianoRollIntentHandler,
  ProjectPianoRollIntentHandlerDependencies,
} from '@/features/piano-roll/types/piano-roll-intent'

function describeCause(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return fallback
}

const REJECTIONS: Record<PianoRollInteractionIntent['type'], readonly [string, string]> = {
  [PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE]: [
    'MIDI note could not be added',
    'The Project rejected the MIDI Note command. Please try again.',
  ],
  [PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES]: [
    'MIDI notes could not be moved',
    'The Project rejected the MIDI Note move. Please try again.',
  ],
  [PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE]: [
    'MIDI note could not be resized',
    'The Project rejected the MIDI Note resize. Please try again.',
  ],
  [PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION]: [
    'MIDI notes could not be selected',
    'The Piano Roll selection could not be updated.',
  ],
}

/** Applies one completed note gesture as a Project edit, then restores the editor selection. */
export function createProjectPianoRollIntentHandler(
  dependencies: ProjectPianoRollIntentHandlerDependencies,
): ProjectPianoRollIntentHandler {
  const { interactionSession, notes } = dependencies

  function selectOnlyCommittedNote(
    editorSession: PianoRollEditorSession,
    noteId: NoteId,
    title: string,
    fallback: string,
  ): void {
    try {
      editorSession.selectOnly(noteId)
      if (editorSession.state.selectedNoteIds.includes(noteId)) {
        dependencies.setFailureMessage(null)
        return
      }
      dependencies.setFailureMessage(fallback)
      dependencies.reportWarning(title, fallback)
    } catch (cause) {
      const message = describeCause(cause, fallback)
      dependencies.setFailureMessage(message)
      dependencies.reportWarning(title, message)
    }
  }

  return (intent) => {
    const editorSession = dependencies.getEditorSession()
    let afterCommit = (): void => dependencies.setFailureMessage(null)
    const settled = (commit: ProjectCommit | null) => {
      if (commit === null) dependencies.setFailureMessage(null)
      return commit
    }

    completeGesture(interactionSession, intent.interactionId, {
      apply: () => {
        // The view may show another Session or Clip than the one the gesture began in.
        if (
          dependencies.getSession() !== intent.target.session ||
          editorSession?.state.clipId !== intent.target.context.clipId ||
          editorSession.state.sourceId !== intent.target.context.sourceId
        )
          return null
        const target = {
          expectedSession: intent.target.session,
          baseRevision: intent.target.baseRevision,
          clipId: intent.target.context.clipId,
        }
        switch (intent.type) {
          case PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION:
            try {
              applyPianoRollSelectInteraction(editorSession, intent.selection)
              dependencies.setFailureMessage(null)
            } catch (cause) {
              dependencies.setFailureMessage(describeCause(cause, REJECTIONS[intent.type][1]))
            }
            return null
          case PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE: {
            const { clipStartTick, pitch, requestedDurationTick } = intent.placement
            const added = notes.add({ ...target, clipStartTick, pitch, requestedDurationTick })
            afterCommit = () =>
              selectOnlyCommittedNote(
                editorSession,
                added.noteId,
                'MIDI note was added but could not be selected',
                'The MIDI Note was added, but its selection could not be restored.',
              )
            return added.commit
          }
          case PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES: {
            const { gesture, preview } = intent
            if (preview.deltaTick === 0 && preview.deltaPitch === 0) return settled(null)
            if (gesture.selectOnlyOnCommit) {
              afterCommit = () =>
                selectOnlyCommittedNote(
                  editorSession,
                  gesture.anchorNoteId,
                  'MIDI notes were moved but selection could not be updated',
                  'The MIDI Notes were moved, but the target Note could not be selected.',
                )
            }
            return settled(
              notes.move({
                ...target,
                deltaPitch: preview.deltaPitch,
                deltaTick: preview.deltaTick,
                noteIds: preview.movedNoteIds,
              }),
            )
          }
          case PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE: {
            const { gesture, preview } = intent
            if (gesture.selectOnlyOnCommit) {
              afterCommit = () =>
                selectOnlyCommittedNote(
                  editorSession,
                  preview.resizedNoteId,
                  'MIDI note was resized but could not be selected',
                  'The MIDI Note was resized, but its selection could not be restored.',
                )
            }
            return settled(
              notes.resize({
                ...target,
                durationTick: preview.durationTick,
                noteId: preview.resizedNoteId,
                sourceStartTick: preview.sourceStartTick,
              }),
            )
          }
        }
      },
      authorityRevision: () => dependencies.getAuthorityRevision() ?? intent.target.baseRevision,
      afterCommit: () => afterCommit(),
      onFailure: (cause, committed) => {
        if (committed) {
          const message = describeCause(
            cause,
            'The Note edit was committed, but its preview could not be updated.',
          )
          dependencies.setFailureMessage(message)
          dependencies.reportWarning(
            'MIDI note edit was committed but could not be displayed',
            message,
          )
          return
        }
        const [title, fallback] = REJECTIONS[intent.type]
        const message = describeCause(cause, fallback)
        dependencies.setFailureMessage(message)
        dependencies.reportDanger(title, message)
      },
    })
  }
}
