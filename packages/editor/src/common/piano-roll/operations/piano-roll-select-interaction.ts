import type { PianoRollEditorSession } from '#internal/common/piano-roll/piano-roll-editor-session'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'

export type PianoRollSelectionTarget = Pick<
  PianoRollEditorSession,
  'clearSelection' | 'selectOnly' | 'toggleSelection'
>

function requestsSelectionToggle(input: PianoRollPointerInput): boolean {
  return input.originModifiers.control || input.originModifiers.meta || input.originModifiers.shift
}

/**
 * Applies a completed click gesture to the Clip-scoped selection authority.
 *
 * Drag gestures and incomplete Pointer lifecycles are intentionally ignored so
 * future tools can claim them without undoing an eager Pointer Down selection.
 */
export function applyPianoRollSelectInteraction(
  target: PianoRollSelectionTarget,
  input: PianoRollPointerInput,
): boolean {
  if (input.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END || input.hasExceededDragThreshold) {
    return false
  }

  if (input.hit === null) return target.clearSelection()
  if (requestsSelectionToggle(input)) {
    return target.toggleSelection(input.hit.noteId)
  }
  return target.selectOnly(input.hit.noteId)
}
