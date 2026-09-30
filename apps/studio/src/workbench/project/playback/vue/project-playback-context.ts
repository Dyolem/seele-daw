import { PROJECT_PLAYBACK_CONTEXT_KEY } from '@/symbols'
import { inject, type ShallowRef } from 'vue'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import { ProjectPlaybackError } from '@/workbench/project/playback/project-playback-error'
import type { ProjectPlaybackState } from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'

export interface ProjectPlaybackVueContext {
  readonly projectPlayback: ProjectPlaybackCoordinator
  readonly state: Readonly<ShallowRef<ProjectPlaybackState>>
  readonly visualPosition: Readonly<ShallowRef<ProjectPlaybackVisualPosition>>
}

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
