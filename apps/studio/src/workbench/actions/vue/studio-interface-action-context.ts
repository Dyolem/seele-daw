import { STUDIO_INTERFACE_ACTION_TARGET_KEY } from '@/symbols'
import { inject } from 'vue'
import type { StudioInterfaceActionTarget } from '@/workbench/actions/studio-interface-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export function useStudioInterfaceActionTarget(): StudioActionTargetSlot<StudioInterfaceActionTarget> {
  const target = inject(STUDIO_INTERFACE_ACTION_TARGET_KEY, null)
  if (target === null) throw new Error('Studio interface Action target has not been provided')
  return target
}
