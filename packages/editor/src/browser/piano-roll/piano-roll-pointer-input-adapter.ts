import { createEditorPointerInputAdapter } from '#internal/browser/interaction/editor-pointer-input-adapter'
import type {
  CreateEditorPointerInputAdapterInput,
  EditorBrowserHitResolver,
  EditorPointerInputAdapter,
  EditorPointerInputAdapterObserver,
} from '#internal/browser/interaction/editor-pointer-input-adapter'
import type { PianoRollHit } from '#internal/common/piano-roll/piano-roll-input'
import { resolvePianoRollDomNoteHit } from './piano-roll-dom-note-hit'

export { EDITOR_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL as PIANO_ROLL_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL } from '#internal/browser/interaction/editor-pointer-input-adapter'
export type {
  EditorPointerInputAdapter as PianoRollPointerInputAdapter,
  EditorPointerInputAdapterFailure as PianoRollPointerInputAdapterFailure,
  EditorPointerInputAdapterFailureOperation as PianoRollPointerInputAdapterFailureOperation,
} from '#internal/browser/interaction/editor-pointer-input-adapter'
export type PianoRollPointerInputAdapterObserver<Hit extends object = PianoRollHit> =
  EditorPointerInputAdapterObserver<Hit>
export type PianoRollBrowserHitResolver<Hit extends object = PianoRollHit> =
  EditorBrowserHitResolver<Hit>
export type CreatePianoRollSemanticPointerInputAdapterInput<Hit extends object> =
  CreateEditorPointerInputAdapterInput<Hit>
export interface CreatePianoRollPointerInputAdapterInput extends Omit<
  CreateEditorPointerInputAdapterInput<PianoRollHit>,
  'resolveHit'
> {
  readonly resolveHit?: EditorBrowserHitResolver<PianoRollHit>
}

/** Supplies Note Hit semantics to the shared browser capture owner. */
export function createPianoRollPointerInputAdapter(
  input: CreatePianoRollPointerInputAdapterInput,
): EditorPointerInputAdapter {
  return createEditorPointerInputAdapter({
    ...input,
    resolveHit: input.resolveHit ?? resolvePianoRollDomNoteHit,
  })
}

/** Existing CC64 surfaces share capture mechanics; their Session migration is a separate batch. */
export function createPianoRollSemanticPointerInputAdapter<Hit extends object>(
  input: CreatePianoRollSemanticPointerInputAdapterInput<Hit>,
): EditorPointerInputAdapter {
  return createEditorPointerInputAdapter(input)
}
