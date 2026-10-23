import type { PianoRollToolActionTarget } from '@/features/piano-roll/types/piano-roll-tool-action-target'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
import { useStudio } from '@/workbench/studio-services'

export function usePianoRollToolActionTarget(): StudioActionTargetSlot<PianoRollToolActionTarget> {
  return useStudio().actions.pianoRollToolTarget
}
