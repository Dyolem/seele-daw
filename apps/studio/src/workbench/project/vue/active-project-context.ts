import { inject, type InjectionKey, type ShallowRef } from 'vue'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import type { ActiveProjectState } from '@/workbench/project/active-project-state'
import { ActiveProjectVueError } from '@/workbench/project/vue/active-project-vue-error'

export interface ActiveProjectVueContext {
  readonly activeProject: ActiveProjectService
  readonly state: Readonly<ShallowRef<ActiveProjectState>>
}

export const ACTIVE_PROJECT_CONTEXT_KEY: InjectionKey<ActiveProjectVueContext> =
  Symbol('ActiveProjectVueContext')

/** Resolves the Active Project instance owned by the current Workbench component tree. */
export function useActiveProject(): ActiveProjectVueContext {
  const context = inject(ACTIVE_PROJECT_CONTEXT_KEY, null)

  if (context === null) {
    throw new ActiveProjectVueError(
      'missing-context',
      'Active Project Vue Context has not been provided',
    )
  }

  return context
}
