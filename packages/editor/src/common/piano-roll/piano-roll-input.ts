import type { NoteId } from '@seele-daw/project-core'

export const PIANO_ROLL_HIT_ZONE = {
  BODY: 'body',
  RESIZE_END: 'resize-end',
  RESIZE_START: 'resize-start',
} as const

export type PianoRollHitZone = (typeof PIANO_ROLL_HIT_ZONE)[keyof typeof PIANO_ROLL_HIT_ZONE]

export interface PianoRollHit {
  readonly noteId: NoteId
  readonly zone: PianoRollHitZone
}

// Piano Roll specializes the shared captured-input contract with its own Hit semantics.
export { EDITOR_POINTER_INPUT_PHASE as PIANO_ROLL_POINTER_INPUT_PHASE } from '#internal/common/interaction/editor-pointer-input'
export type {
  EditorCssPoint as PianoRollCssPoint,
  EditorInputModifiers as PianoRollInputModifiers,
  EditorPointerInputPhase as PianoRollPointerInputPhase,
  EditorPointerType as PianoRollPointerType,
} from '#internal/common/interaction/editor-pointer-input'
import type { EditorPointerInput } from '#internal/common/interaction/editor-pointer-input'
export type PianoRollPointerInput<Hit extends object = PianoRollHit> = EditorPointerInput<Hit>
