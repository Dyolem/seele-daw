import {
  STUDIO_ACTION,
  createStudioActionPresentation,
  type StudioActionCompletion,
  type StudioActionDefinition,
} from '@/workbench/actions/studio-action'
import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export interface ArrangementKeyboardTarget {
  isFocused(): boolean
  execute(): StudioActionCompletion
}

export function createArrangementKeyboardActions(
  clip: StudioActionTargetSlot<ArrangementKeyboardTarget>,
  bar: StudioActionTargetSlot<ArrangementKeyboardTarget>,
): readonly StudioActionDefinition[] {
  return Object.freeze(
    [
      { actionId: STUDIO_ACTION.ARRANGEMENT_CLIP_OPEN, target: clip },
      { actionId: STUDIO_ACTION.ARRANGEMENT_CLIP_CREATE, target: bar },
    ].map(({ actionId, target }) => {
      const descriptor = describeStudioAction(actionId)
      return {
        ...descriptor,
        resolve() {
          const binding = target.current
          if (binding === null) return null
          return {
            presentation: createStudioActionPresentation(descriptor.label),
            isCurrent: binding.isCurrent,
            onInvalidated: binding.onInvalidated,
            execute: () => binding.value.execute(),
          }
        },
      }
    }),
  )
}
