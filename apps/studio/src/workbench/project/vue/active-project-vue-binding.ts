import { markRaw, shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import type { ActiveProjectState } from '@/workbench/project/active-project-state'

export interface ActiveProjectVueContext {
  readonly activeProject: ActiveProjectService
  readonly state: Readonly<ShallowRef<ActiveProjectState>>
}

/** Mirrors low-frequency lifecycle state into Vue without proxying the Session graph. */
export function createActiveProjectVueBinding(activeProjectInput: ActiveProjectService) {
  const activeProject = markRaw(activeProjectInput)
  const state = shallowRef(activeProject.state)
  let unsubscribe: (() => void) | null = activeProject.subscribe((next) => {
    state.value = next
  })

  return {
    context: Object.freeze<ActiveProjectVueContext>({
      activeProject,
      state: shallowReadonly(state),
    }),
    dispose(): void {
      unsubscribe?.()
      unsubscribe = null
    },
  }
}
