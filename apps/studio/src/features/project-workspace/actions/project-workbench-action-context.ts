import { inject, type InjectionKey } from 'vue'

import type { ProjectWorkbenchActionTarget } from '@/features/project-workspace/actions/project-workbench-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export const PROJECT_WORKBENCH_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<ProjectWorkbenchActionTarget>
> = Symbol('ProjectWorkbenchActionTarget')

export function useProjectWorkbenchActionTarget(): StudioActionTargetSlot<ProjectWorkbenchActionTarget> {
  const target = inject(PROJECT_WORKBENCH_ACTION_TARGET_KEY, null)
  if (target === null) throw new Error('Project Workbench Action target has not been provided')
  return target
}
