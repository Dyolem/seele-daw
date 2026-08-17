import { shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import {
  PROJECT_NAVIGATION_DECISION,
  type ProjectNavigationDecision,
  type ProjectNavigationDecisionRequest,
  type ProjectNavigationDecisionRequester,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import type {
  PendingProjectNavigationDecision,
  ProjectNavigationDecisionVueContext,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import { ProjectNavigationDecisionVueError } from '@/workbench/project/navigation/vue/project-navigation-decision-vue-error'

export interface ProjectNavigationDecisionVueBinding {
  readonly context: ProjectNavigationDecisionVueContext
  readonly requestDecision: ProjectNavigationDecisionRequester
  dispose(): void
}

interface PendingDecisionEntry {
  readonly pending: PendingProjectNavigationDecision
  readonly complete: (decision: ProjectNavigationDecision) => void
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

class ProjectNavigationDecisionVueBindingImpl implements ProjectNavigationDecisionVueBinding {
  readonly context: ProjectNavigationDecisionVueContext
  readonly requestDecision: ProjectNavigationDecisionRequester
  readonly #pendingDecision: ShallowRef<PendingProjectNavigationDecision | null>
  #currentEntry: PendingDecisionEntry | null = null
  #disposed = false

  constructor() {
    this.#pendingDecision = shallowRef<PendingProjectNavigationDecision | null>(null)
    this.requestDecision = (request) => this.#requestDecision(request)
    this.context = Object.freeze<ProjectNavigationDecisionVueContext>({
      pendingDecision: shallowReadonly(this.#pendingDecision),
      resolve: (pending: PendingProjectNavigationDecision, decision: ProjectNavigationDecision) =>
        this.#resolve(pending, decision),
    })
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    const currentEntry = this.#currentEntry
    this.#currentEntry = null
    this.#pendingDecision.value = null
    currentEntry?.complete(PROJECT_NAVIGATION_DECISION.CANCEL)
  }

  #requestDecision(request: ProjectNavigationDecisionRequest): Promise<ProjectNavigationDecision> {
    if (this.#disposed) {
      return Promise.reject(
        new ProjectNavigationDecisionVueError(
          'binding-disposed',
          'Project Navigation Decision Vue Binding is disposed',
        ),
      )
    }

    let complete!: (decision: ProjectNavigationDecision) => void
    const promise = new Promise<ProjectNavigationDecision>((resolve) => {
      complete = resolve
    })
    const pending = Object.freeze<PendingProjectNavigationDecision>({ request })
    const nextEntry = Object.freeze<PendingDecisionEntry>({ pending, complete })
    const previousEntry = this.#currentEntry

    // The latest navigation owns the single dialog slot; the superseded caller stops as Cancelled.
    this.#currentEntry = nextEntry
    this.#pendingDecision.value = pending
    previousEntry?.complete(PROJECT_NAVIGATION_DECISION.CANCEL)

    return promise
  }

  #resolve(
    pending: PendingProjectNavigationDecision,
    decision: ProjectNavigationDecision,
  ): boolean {
    assertNavigationDecision(decision)

    const currentEntry = this.#currentEntry
    if (currentEntry === null || currentEntry.pending !== pending) return false

    this.#currentEntry = null
    this.#pendingDecision.value = null
    currentEntry.complete(decision)
    return true
  }
}

/** Bridges the async navigation Decision Port into one shallow Vue dialog request slot. */
export function createProjectNavigationDecisionVueBinding(): ProjectNavigationDecisionVueBinding {
  return new ProjectNavigationDecisionVueBindingImpl()
}
