import type { ProjectWorkbenchActionTarget } from '@/features/project-workspace/actions/project-workbench-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
import type { ArrangementKeyboardTarget } from '@/features/project-workspace/actions/arrangement-keyboard-actions'
import { useStudio } from '@/workbench/studio-services'

export interface ArrangementActionTargets {
  readonly arrangementClipTarget: StudioActionTargetSlot<ArrangementKeyboardTarget>
  readonly arrangementBarTarget: StudioActionTargetSlot<ArrangementKeyboardTarget>
}

export function useArrangementActionTargets(): ArrangementActionTargets {
  return useStudio().actions
}

export function useProjectWorkbenchActionTarget(): StudioActionTargetSlot<ProjectWorkbenchActionTarget> {
  return useStudio().actions.workbenchTarget
}
