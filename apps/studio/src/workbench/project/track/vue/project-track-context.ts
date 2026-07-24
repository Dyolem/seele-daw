import { inject, type InjectionKey } from 'vue'

import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import { ProjectTrackVueError } from '@/workbench/project/track/vue/project-track-vue-error'

export interface ProjectTrackVueContext {
  readonly projectTracks: ProjectTrackCoordinator
}

export const PROJECT_TRACK_CONTEXT_KEY: InjectionKey<ProjectTrackVueContext> =
  Symbol('ProjectTrackVueContext')

/** Resolves the Track command capability owned by the current Studio application. */
export function useProjectTracks(): ProjectTrackVueContext {
  const context = inject(PROJECT_TRACK_CONTEXT_KEY, null)

  if (context === null) {
    throw new ProjectTrackVueError(
      'missing-context',
      'Project Track Vue Context has not been provided',
    )
  }

  return context
}
