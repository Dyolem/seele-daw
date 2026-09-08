import { inject, type InjectionKey } from 'vue'

import type { PianoRollActionTarget } from '@/features/piano-roll/actions/piano-roll-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export const PIANO_ROLL_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<PianoRollActionTarget>
> = Symbol('PianoRollActionTarget')

export function usePianoRollActionTarget(): StudioActionTargetSlot<PianoRollActionTarget> {
  const target = inject(PIANO_ROLL_ACTION_TARGET_KEY, null)
  if (target === null) throw new Error('Piano Roll Action target has not been provided')
  return target
}
