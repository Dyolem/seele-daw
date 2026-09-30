import { PIANO_ROLL_TOOL_ACTION_TARGET_KEY } from '@/symbols'
import { inject } from 'vue'
import type { PianoRollToolActionTarget } from '@/features/piano-roll/types/piano-roll-tool-action-target'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export function usePianoRollToolActionTarget(): StudioActionTargetSlot<PianoRollToolActionTarget> {
  const target = inject(PIANO_ROLL_TOOL_ACTION_TARGET_KEY, null)
  if (target === null) throw new Error('Piano Roll Tool Action target has not been provided')
  return target
}
