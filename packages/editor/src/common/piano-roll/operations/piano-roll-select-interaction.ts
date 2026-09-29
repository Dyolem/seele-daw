import type { NoteId } from '@seele-daw/project-core'
import type { PianoRollEditorSession } from '#internal/common/piano-roll/piano-roll-editor-session'

export type PianoRollSelectionTarget = Pick<
  PianoRollEditorSession,
  'clearSelection' | 'selectOnly' | 'toggleSelection'
>

export interface PianoRollSelectionChange {
  readonly noteId: NoteId | null
  readonly toggleSelection: boolean
}

/** Applies the semantic result of a completed click to the Clip-scoped selection authority. */
export function applyPianoRollSelectInteraction(
  target: PianoRollSelectionTarget,
  input: PianoRollSelectionChange,
): boolean {
  if (input.noteId === null) return target.clearSelection()
  if (input.toggleSelection) return target.toggleSelection(input.noteId)
  return target.selectOnly(input.noteId)
}
