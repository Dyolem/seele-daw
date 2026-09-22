import {
  STUDIO_ACTION,
  createStudioActionPresentation,
  type StudioActionCompletion,
  type StudioActionDefinition,
  type StudioActionId,
} from '@/workbench/actions/studio-action'
import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export interface StudioEditorSelectionTarget {
  isFocused(): boolean
  hasSelection(): boolean
  selectionLabel(): string
  deleteSelection(): StudioActionCompletion
  clearSelection?: () => StudioActionCompletion
  deleteDisabledReason?: () => string | null
}

export interface StudioInteractionTarget {
  isActive(): boolean
  cancel(): StudioActionCompletion
}

export function createStudioEditorActions(
  selection: StudioActionTargetSlot<StudioEditorSelectionTarget>,
  interaction: StudioActionTargetSlot<StudioInteractionTarget>,
): readonly StudioActionDefinition[] {
  function selectionAction(actionId: StudioActionId, clear: boolean): StudioActionDefinition {
    const descriptor = describeStudioAction(actionId)
    return {
      ...descriptor,
      resolve() {
        const binding = selection.current
        if (binding === null) return null
        const target = binding.value
        const execute = clear ? target.clearSelection : target.deleteSelection
        let reason: string | null = null
        if (interaction.current?.value.isActive())
          reason = 'Finish or cancel the current interaction first.'
        else if (execute === undefined) reason = 'This editor does not support clearing selection.'
        else if (!target.hasSelection()) reason = 'There is no selection.'
        else if (!clear) reason = target.deleteDisabledReason?.() ?? null
        return {
          presentation: createStudioActionPresentation(
            `${descriptor.label} — ${target.selectionLabel()}`,
            reason,
          ),
          isCurrent: binding.isCurrent,
          onInvalidated: binding.onInvalidated,
          execute: () => execute?.() ?? { status: 'not-applied' },
        }
      },
    }
  }
  const cancel = describeStudioAction(STUDIO_ACTION.INTERACTION_CANCEL)
  return Object.freeze([
    selectionAction(STUDIO_ACTION.EDITOR_SELECTION_DELETE, false),
    selectionAction(STUDIO_ACTION.EDITOR_SELECTION_CLEAR, true),
    {
      ...cancel,
      resolve() {
        const binding = interaction.current
        if (binding === null) return null
        return {
          presentation: createStudioActionPresentation(
            cancel.label,
            binding.value.isActive() ? null : 'There is no active interaction.',
          ),
          isCurrent: binding.isCurrent,
          onInvalidated: binding.onInvalidated,
          execute: () => binding.value.cancel(),
        }
      },
    },
  ])
}
