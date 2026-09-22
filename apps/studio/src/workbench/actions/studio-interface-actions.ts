import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  createStudioActionPresentation,
  type StudioActionDefinition,
} from '@/workbench/actions/studio-action'
import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export interface StudioInterfaceActionTarget {
  showShortcuts(): void
  focusNotifications(): void
}

export function createStudioInterfaceActions(
  targets: StudioActionTargetSlot<StudioInterfaceActionTarget>,
): readonly StudioActionDefinition[] {
  return Object.freeze(
    [STUDIO_ACTION.SHORTCUTS_SHOW, STUDIO_ACTION.NOTIFICATIONS_FOCUS].map((actionId) => {
      const descriptor = describeStudioAction(actionId)
      return {
        ...descriptor,
        resolve() {
          const binding = targets.current
          if (binding === null) return null
          return {
            presentation: createStudioActionPresentation(descriptor.label),
            isCurrent: binding.isCurrent,
            onInvalidated: binding.onInvalidated,
            execute() {
              if (actionId === STUDIO_ACTION.SHORTCUTS_SHOW) binding.value.showShortcuts()
              else binding.value.focusNotifications()
              return STUDIO_ACTION_COMPLETED
            },
          }
        },
      }
    }),
  )
}
