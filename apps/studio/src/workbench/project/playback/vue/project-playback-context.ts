import { inject, type InjectionKey, type ShallowRef } from 'vue'

import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import { ProjectPlaybackError } from '@/workbench/project/playback/project-playback-error'
import type { ProjectPlaybackState } from '@/workbench/project/playback/project-playback-state'

export interface ProjectPlaybackVueContext {
  readonly projectPlayback: ProjectPlaybackCoordinator
  readonly state: Readonly<ShallowRef<ProjectPlaybackState>>
}

export const PROJECT_PLAYBACK_CONTEXT_KEY: InjectionKey<ProjectPlaybackVueContext> = Symbol(
  'ProjectPlaybackVueContext',
)

/** Resolves the application-owned Project Playback capability and shallow state projection. */
export function useProjectPlayback(): ProjectPlaybackVueContext {
  const context = inject(PROJECT_PLAYBACK_CONTEXT_KEY, null)
  if (context === null) {
    throw new ProjectPlaybackError(
      'missing-context',
      'Project Playback Vue Context has not been provided',
    )
  }
  return context
}
