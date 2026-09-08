import {
  STUDIO_ACTION,
  createStudioActionPresentation,
  type StudioActionCompletion,
  type StudioActionDefinition,
  type StudioActionDescriptor,
} from '@/workbench/actions/studio-action'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export interface PianoRollActionTarget {
  isFocused(): boolean
  hasSelection(): boolean
  hasInteraction(): boolean
  selectionLabel(): string
  deleteSelection(): StudioActionCompletion
  clearSelection(): StudioActionCompletion
  cancelInteraction(): StudioActionCompletion
}

export function createPianoRollActions(
  targets: StudioActionTargetSlot<PianoRollActionTarget>,
): readonly StudioActionDefinition[] {
  function define(
    descriptor: StudioActionDescriptor,
    operation: 'deleteSelection' | 'clearSelection' | 'cancelInteraction',
  ): StudioActionDefinition {
    return Object.freeze({
      ...descriptor,
      resolve() {
        const binding = targets.current
        if (binding === null) return null
        const target = binding.value
        const cancelling = operation === 'cancelInteraction'
        const hasInteraction = target.hasInteraction()
        let reason: string | null = null
        if (cancelling && !hasInteraction) reason = 'There is no active interaction.'
        else if (!cancelling && hasInteraction)
          reason = 'Finish or cancel the current interaction first.'
        else if (!cancelling && !target.hasSelection()) reason = 'There is no selection.'
        return {
          presentation: createStudioActionPresentation(
            cancelling ? descriptor.label : `${descriptor.label} — ${target.selectionLabel()}`,
            reason,
          ),
          isCurrent: binding.isCurrent,
          onInvalidated: binding.onInvalidated,
          execute: () => target[operation](),
        }
      },
    })
  }
  return Object.freeze([
    define(
      {
        actionId: STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE,
        label: 'Delete selection',
        description: 'Delete selected notes or sustain pedal events in one project edit.',
      },
      'deleteSelection',
    ),
    define(
      {
        actionId: STUDIO_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        label: 'Clear selection',
        description: 'Clear the current piano roll selection.',
      },
      'clearSelection',
    ),
    define(
      {
        actionId: STUDIO_ACTION.PIANO_ROLL_INTERACTION_CANCEL,
        label: 'Cancel interaction',
        description: 'Cancel the current piano roll gesture without clearing selection.',
      },
      'cancelInteraction',
    ),
  ])
}
