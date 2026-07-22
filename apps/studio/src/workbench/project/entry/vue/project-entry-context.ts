import { inject, type InjectionKey } from 'vue'

import type { ProjectEntryCoordinator } from '@/workbench/project/entry/project-entry-coordinator'
import { ProjectEntryVueError } from '@/workbench/project/entry/vue/project-entry-vue-error'

export interface ProjectEntryVueContext {
  readonly projectEntry: ProjectEntryCoordinator
}

export const PROJECT_ENTRY_CONTEXT_KEY: InjectionKey<ProjectEntryVueContext> =
  Symbol('ProjectEntryVueContext')

/** Resolves the Project Entry capability owned by the current Studio application. */
export function useProjectEntry(): ProjectEntryVueContext {
  const context = inject(PROJECT_ENTRY_CONTEXT_KEY, null)

  if (context === null) {
    throw new ProjectEntryVueError(
      'missing-context',
      'Project Entry Vue Context has not been provided',
    )
  }

  return context
}
