import type { InteractionOperation } from '#internal/common/interaction/interaction-session'
import { resolveInteractionModifiers } from '#internal/common/interaction/interaction-modifiers'
import type { PianoRollPointerInput } from '#internal/common/piano-roll/piano-roll-input'
import {
  createPianoRollNoteMoveGesture,
  resolvePianoRollNoteMovePreview,
  type PianoRollNoteMovePreview,
} from '#internal/common/piano-roll/operations/piano-roll-note-move-interaction'
import {
  createPianoRollNoteResizeGesture,
  resolvePianoRollNoteResizePreview,
  type PianoRollNoteResizePreview,
} from '#internal/common/piano-roll/operations/piano-roll-note-resize-interaction'
import { resolvePianoRollPencilNotePlacement } from '#internal/common/piano-roll/operations/piano-roll-pencil-interaction'
import {
  PIANO_ROLL_INTERACTION_INTENT,
  PIANO_ROLL_INTERACTION_TOOL,
  type PianoRollInteractionConfiguration,
  type PianoRollInteractionIntent,
} from './piano-roll-interaction'

type WithoutIdentity<Intent> = Intent extends PianoRollInteractionIntent
  ? Omit<Intent, 'interactionId' | 'target'>
  : never
export type PianoRollOperationResult = WithoutIdentity<PianoRollInteractionIntent>
export interface PianoRollOperationPreview {
  readonly move: PianoRollNoteMovePreview | null
  readonly resize: PianoRollNoteResizePreview | null
}

/** Freezes Note-specific facts once; subsequent calculations consume semantic input only. */
export function createPianoRollNoteOperation(
  configuration: PianoRollInteractionConfiguration,
  input: PianoRollPointerInput,
) {
  const origin = Object.freeze({
    ...input,
    hit: input.hit === null ? null : Object.freeze({ ...input.hit }),
    originModifiers: Object.freeze({ ...input.originModifiers }),
    originPosition: Object.freeze({ ...input.originPosition }),
  })
  const baseRevision = configuration.session.modelRevision
  const resize = createPianoRollNoteResizeGesture({
    context: configuration.context,
    pointerInput: origin,
    selectedNoteIds: configuration.selectedNoteIds,
    session: configuration.session,
  })
  const move =
    resize === null && configuration.tool === PIANO_ROLL_INTERACTION_TOOL.CURSOR
      ? createPianoRollNoteMoveGesture({
          context: configuration.context,
          pointerInput: origin,
          selectedNoteIds: configuration.selectedNoteIds,
          session: configuration.session,
        })
      : null
  if (
    configuration.session.modelRevision !== baseRevision ||
    (resize !== null && resize.baseRevision !== baseRevision) ||
    (move !== null && move.baseRevision !== baseRevision)
  ) {
    throw new Error('The Project changed while the Note interaction was starting.')
  }
  let kind: 'note-resize' | 'note-move' | null = null
  if (resize !== null) kind = 'note-resize'
  else if (move !== null) kind = 'note-move'

  function resolve(
    input: PianoRollPointerInput,
    completing: boolean,
  ): Readonly<{
    preview: PianoRollOperationPreview | null
    result: PianoRollOperationResult | null
  }> {
    if (origin.hit !== null && origin.hit.clipId !== configuration.context.clipId)
      return { preview: null, result: null }
    const pointerInput = Object.freeze({
      ...input,
      hit: origin.hit,
      originModifiers: origin.originModifiers,
      originPosition: origin.originPosition,
    })
    const modifiers = resolveInteractionModifiers(origin.originModifiers, input.modifiers)
    if (input.hasExceededDragThreshold && configuration.viewport !== null) {
      if (resize !== null) {
        const preview = resolvePianoRollNoteResizePreview({
          gesture: resize,
          grid: configuration.grid,
          pointerInput,
          bypassSnap: modifiers.bypassSnap,
          snapEnabled: configuration.snapEnabled,
          viewport: configuration.viewport,
        })
        return {
          preview: preview === null ? null : Object.freeze({ move: null, resize: preview }),
          result:
            completing &&
            preview !== null &&
            (preview.sourceStartTick !== resize.note.startTick ||
              preview.durationTick !== resize.note.durationTick)
              ? Object.freeze({
                  type: PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE,
                  gesture: resize,
                  preview,
                })
              : null,
        }
      }
      if (move !== null) {
        const preview = resolvePianoRollNoteMovePreview({
          gesture: move,
          grid: configuration.grid,
          pointerInput,
          bypassSnap: modifiers.bypassSnap,
          snapEnabled: configuration.snapEnabled,
          viewport: configuration.viewport,
        })
        return {
          preview: preview === null ? null : Object.freeze({ move: preview, resize: null }),
          result:
            completing && preview !== null && (preview.deltaTick !== 0 || preview.deltaPitch !== 0)
              ? Object.freeze({
                  type: PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES,
                  gesture: move,
                  preview,
                })
              : null,
        }
      }
    }
    if (!completing || input.hasExceededDragThreshold) return { preview: null, result: null }
    if (configuration.tool === PIANO_ROLL_INTERACTION_TOOL.CURSOR) {
      return {
        preview: null,
        result: Object.freeze({
          type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
          selection: Object.freeze({
            noteId: origin.hit?.noteId ?? null,
            toggleSelection: modifiers.toggleSelection,
          }),
        }),
      }
    }
    if (configuration.viewport === null)
      throw new Error('The Piano Roll is not ready to place a MIDI Note.')
    const placement = resolvePianoRollPencilNotePlacement({
      context: configuration.context,
      grid: configuration.grid,
      pointerInput,
      snapEnabled: configuration.snapEnabled,
      viewport: configuration.viewport,
    })
    return {
      preview: null,
      result:
        placement === null
          ? null
          : Object.freeze({ type: PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE, placement }),
    }
  }

  const operation: InteractionOperation<
    PianoRollPointerInput,
    PianoRollOperationPreview,
    PianoRollOperationResult
  > = {
    update: (input) => resolve(input, false).preview,
    complete: (input) => resolve(input, true),
  }
  return { kind, operation }
}
