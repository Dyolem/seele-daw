import type { StudioInterfaceActionTarget } from '@/workbench/actions/studio-interface-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
import { useStudio } from '@/workbench/studio-services'

export function useStudioInterfaceActionTarget(): StudioActionTargetSlot<StudioInterfaceActionTarget> {
  return useStudio().actions.interfaceTarget
}
