import { inject, type InjectionKey } from 'vue'

import type { ProjectWorkbenchActionTarget } from '@/features/project-workspace/actions/project-workbench-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
import type { ArrangementKeyboardTarget } from '@/features/project-workspace/actions/arrangement-keyboard-actions'

export interface ArrangementActionTargets {
  readonly arrangementClipTarget: StudioActionTargetSlot<ArrangementKeyboardTarget>
  readonly arrangementBarTarget: StudioActionTargetSlot<ArrangementKeyboardTarget>
}

export const ARRANGEMENT_ACTION_TARGETS_KEY: InjectionKey<ArrangementActionTargets> = Symbol(
  'ArrangementActionTargets',
)

export function useArrangementActionTargets(): ArrangementActionTargets {
  const targets = inject(ARRANGEMENT_ACTION_TARGETS_KEY, null)
  if (targets === null) throw new Error('Arrangement Action targets have not been provided')
  return targets
}

export const PROJECT_WORKBENCH_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<ProjectWorkbenchActionTarget>
> = Symbol('ProjectWorkbenchActionTarget')

export function useProjectWorkbenchActionTarget(): StudioActionTargetSlot<ProjectWorkbenchActionTarget> {
  const target = inject(PROJECT_WORKBENCH_ACTION_TARGET_KEY, null)
  if (target === null) throw new Error('Project Workbench Action target has not been provided')
  return target
}
