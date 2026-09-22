import { inject, type InjectionKey } from 'vue'

import type { PianoRollToolActionTarget } from '@/features/piano-roll/actions/piano-roll-tool-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export const PIANO_ROLL_TOOL_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<PianoRollToolActionTarget>
> = Symbol('PianoRollToolActionTarget')

export function usePianoRollToolActionTarget(): StudioActionTargetSlot<PianoRollToolActionTarget> {
  const target = inject(PIANO_ROLL_TOOL_ACTION_TARGET_KEY, null)
  if (target === null) throw new Error('Piano Roll Tool Action target has not been provided')
  return target
}
