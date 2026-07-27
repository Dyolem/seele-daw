import { inject, type InjectionKey } from 'vue'

import type { ProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import { ProjectClipVueError } from '@/workbench/project/clip/vue/project-clip-vue-error'

export interface ProjectClipVueContext {
  readonly projectClips: ProjectClipCoordinator
}

export const PROJECT_CLIP_CONTEXT_KEY: InjectionKey<ProjectClipVueContext> =
  Symbol('ProjectClipVueContext')

/** Resolves the Clip command capability owned by the current Studio application. */
export function useProjectClips(): ProjectClipVueContext {
  const context = inject(PROJECT_CLIP_CONTEXT_KEY, null)

  if (context === null) {
    throw new ProjectClipVueError(
      'missing-context',
      'Project Clip Vue Context has not been provided',
    )
  }

  return context
}
