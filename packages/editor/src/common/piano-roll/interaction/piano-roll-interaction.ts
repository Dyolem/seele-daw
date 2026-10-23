import type { ModelRevision, NoteId, ProjectSession } from '@seele-daw/project-core'
import type { GestureState } from '#internal/common/interaction/gesture-session'
import type { InteractionId } from '#internal/common/interaction/interaction-session'
import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'
import type { PianoRollGrid } from '#internal/common/piano-roll/piano-roll-grid'
import type { PianoRollViewport } from '#internal/common/piano-roll/piano-roll-viewport'
import type {
  PianoRollNoteMoveGesture,
  PianoRollNoteMovePreview,
} from '#internal/common/piano-roll/operations/piano-roll-note-move-interaction'
import type {
  PianoRollNoteResizeGesture,
  PianoRollNoteResizePreview,
} from '#internal/common/piano-roll/operations/piano-roll-note-resize-interaction'
import type { PianoRollSelectionChange } from '#internal/common/piano-roll/operations/piano-roll-select-interaction'
import type { PianoRollNotePlacement } from '#internal/common/piano-roll/operations/piano-roll-pencil-interaction'
import type { PianoRollOperationPreview } from './piano-roll-note-operation'

export interface PianoRollInteractionTarget {
  readonly session: Pick<ProjectSession, 'query' | 'modelRevision'>
  readonly context: PianoRollClipContext
  readonly baseRevision: ModelRevision
  readonly viewport: PianoRollViewport | null
}

interface PianoRollInteractionIdentity {
  readonly interactionId: InteractionId
  readonly target: PianoRollInteractionTarget
}

export const PIANO_ROLL_INTERACTION_TOOL = {
  CURSOR: 'cursor',
  PENCIL: 'pencil',
} as const

export type PianoRollInteractionTool =
  (typeof PIANO_ROLL_INTERACTION_TOOL)[keyof typeof PIANO_ROLL_INTERACTION_TOOL]

export const PIANO_ROLL_INTERACTION_INTENT = {
  ADD_NOTE: 'note.add',
  MOVE_NOTES: 'notes.move',
  RESIZE_NOTE: 'note.resize',
  RESOLVE_SELECTION: 'selection.resolve',
} as const

export interface PianoRollResolveSelectionIntent extends PianoRollInteractionIdentity {
  readonly selection: PianoRollSelectionChange
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION
}

export interface PianoRollAddNoteIntent extends PianoRollInteractionIdentity {
  readonly placement: PianoRollNotePlacement
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE
}

export interface PianoRollMoveNotesIntent extends PianoRollInteractionIdentity {
  readonly gesture: PianoRollNoteMoveGesture
  readonly preview: PianoRollNoteMovePreview
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES
}

export interface PianoRollResizeNoteIntent extends PianoRollInteractionIdentity {
  readonly gesture: PianoRollNoteResizeGesture
  readonly preview: PianoRollNoteResizePreview
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE
}

export type PianoRollInteractionIntent =
  | PianoRollAddNoteIntent
  | PianoRollMoveNotesIntent
  | PianoRollResizeNoteIntent
  | PianoRollResolveSelectionIntent

export interface PianoRollInteractionConfiguration {
  readonly context: PianoRollClipContext
  readonly grid: PianoRollGrid
  readonly selectedNoteIds: readonly NoteId[]
  readonly session: Pick<ProjectSession, 'query' | 'modelRevision' | 'subscribe'>
  readonly snapEnabled: boolean
  readonly tool: PianoRollInteractionTool
  readonly viewport: PianoRollViewport | null
}

export interface PianoRollInteractionOutcome {
  readonly failure: unknown | null
  readonly intent: PianoRollInteractionIntent | null
}

export type PianoRollInteractionState = GestureState<PianoRollOperationPreview>
