import { PROJECT_TRACK_CONTEXT_KEY } from '@/symbols'
import { inject } from 'vue'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import { ProjectTrackVueError } from '@/workbench/project/track/vue/project-track-vue-error'

export interface ProjectTrackVueContext {
  readonly projectTracks: ProjectTrackCoordinator
}

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
