import { inject, type InjectionKey, type ShallowRef } from 'vue'

import type {
  ProjectNavigationDecision,
  ProjectNavigationDecisionRequest,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { ProjectNavigationDecisionVueError } from '@/workbench/project/navigation/vue/project-navigation-decision-vue-error'

export interface PendingProjectNavigationDecision {
  readonly request: ProjectNavigationDecisionRequest
}

export interface ProjectNavigationDecisionVueContext {
  readonly pendingDecision: Readonly<ShallowRef<PendingProjectNavigationDecision | null>>
  resolve(pending: PendingProjectNavigationDecision, decision: ProjectNavigationDecision): boolean
}

export const PROJECT_NAVIGATION_DECISION_CONTEXT_KEY: InjectionKey<ProjectNavigationDecisionVueContext> =
  Symbol('ProjectNavigationDecisionVueContext')

/** Resolves the one-shot Project navigation decision channel for the current component tree. */
export function useProjectNavigationDecision(): ProjectNavigationDecisionVueContext {
  const context = inject(PROJECT_NAVIGATION_DECISION_CONTEXT_KEY, null)

  if (context === null) {
    throw new ProjectNavigationDecisionVueError(
      'missing-context',
      'Project Navigation Decision Vue Context has not been provided',
    )
  }

  return context
}
