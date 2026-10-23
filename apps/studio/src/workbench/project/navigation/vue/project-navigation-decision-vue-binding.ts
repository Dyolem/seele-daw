import { shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import {
  PROJECT_NAVIGATION_DECISION,
  type ProjectNavigationDecision,
  type ProjectNavigationDecisionRequest,
  type ProjectNavigationDecisionRequester,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { ProjectNavigationDecisionVueError } from '@/workbench/project/navigation/vue/project-navigation-decision-vue-error'

export interface PendingProjectNavigationDecision {
  readonly request: ProjectNavigationDecisionRequest
}

export interface ProjectNavigationDecisionVueContext {
  readonly pendingDecision: Readonly<ShallowRef<PendingProjectNavigationDecision | null>>
  resolve(pending: PendingProjectNavigationDecision, decision: ProjectNavigationDecision): boolean
}

export interface ProjectNavigationDecisionVueBinding {
  readonly context: ProjectNavigationDecisionVueContext
  readonly requestDecision: ProjectNavigationDecisionRequester
  dispose(): void
}

function assertNavigationDecision(
  decision: unknown,
): asserts decision is ProjectNavigationDecision {
  if (!Object.values(PROJECT_NAVIGATION_DECISION).some((candidate) => candidate === decision)) {
    throw new ProjectNavigationDecisionVueError(
      'invalid-decision',
      'Project navigation decision must be save, discard, or cancel',
      { decision },
    )
  }
}

/** Bridges the async navigation decision port into one shallow Vue dialog slot. */
export function createProjectNavigationDecisionVueBinding(): ProjectNavigationDecisionVueBinding {
  const pendingDecision = shallowRef<PendingProjectNavigationDecision | null>(null)
  let current: {
    readonly pending: PendingProjectNavigationDecision
    readonly complete: (decision: ProjectNavigationDecision) => void
  } | null = null
  let disposed = false

  function settle(decision: ProjectNavigationDecision): void {
    const settled = current
    current = null
    pendingDecision.value = null
    settled?.complete(decision)
  }

  return {
    context: Object.freeze<ProjectNavigationDecisionVueContext>({
      pendingDecision: shallowReadonly(pendingDecision),
      resolve(pending, decision) {
        assertNavigationDecision(decision)
        if (current?.pending !== pending) return false
        settle(decision)
        return true
      },
    }),
    requestDecision(request) {
      if (disposed) {
        return Promise.reject(
          new ProjectNavigationDecisionVueError(
            'binding-disposed',
            'Project Navigation Decision Vue Binding is disposed',
          ),
        )
      }
      return new Promise<ProjectNavigationDecision>((complete) => {
        // The latest navigation owns the single dialog slot; the superseded caller is cancelled.
        const superseded = current
        const pending = Object.freeze({ request })
        current = { pending, complete }
        pendingDecision.value = pending
        superseded?.complete(PROJECT_NAVIGATION_DECISION.CANCEL)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      settle(PROJECT_NAVIGATION_DECISION.CANCEL)
    },
  }
}
