import {
  PIANO_ROLL_TOOL,
  type PianoRollTool,
} from '@/features/piano-roll/piano-roll-preferences-store'
import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  createStudioActionPresentation,
  type StudioActionDefinition,
} from '@/workbench/actions/studio-action'
import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export interface PianoRollToolActionTarget {
  isFocused(): boolean
  getTool(): PianoRollTool
  activateTool(tool: PianoRollTool): void
  isSnapEnabled(): boolean
  toggleSnap(): void
}

export function createPianoRollToolActions(
  targets: StudioActionTargetSlot<PianoRollToolActionTarget>,
): readonly StudioActionDefinition[] {
  return Object.freeze(
    [
      STUDIO_ACTION.PIANO_ROLL_TOOL_CURSOR,
      STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL,
      STUDIO_ACTION.PIANO_ROLL_SNAP_TOGGLE,
    ].map((actionId) => {
      const descriptor = describeStudioAction(actionId)
      const tool =
        actionId === STUDIO_ACTION.PIANO_ROLL_TOOL_CURSOR
          ? PIANO_ROLL_TOOL.CURSOR
          : PIANO_ROLL_TOOL.PENCIL
      const snap = actionId === STUDIO_ACTION.PIANO_ROLL_SNAP_TOGGLE
      return {
        ...descriptor,
        resolve() {
          const binding = targets.current
          if (binding === null) return null
          return {
            presentation: createStudioActionPresentation(descriptor.label, null, {
              checked: snap ? binding.value.isSnapEnabled() : binding.value.getTool() === tool,
            }),
            isCurrent: binding.isCurrent,
            onInvalidated: binding.onInvalidated,
            execute() {
              if (snap) binding.value.toggleSnap()
              else binding.value.activateTool(tool)
              return STUDIO_ACTION_COMPLETED
            },
          }
        },
      }
    }),
  )
}
