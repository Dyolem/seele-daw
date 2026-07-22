import { createPinia } from 'pinia'
import {
  createApp,
  type Component,
  type ComponentPublicInstance,
  type App as VueApplication,
} from 'vue'
import type { Router } from 'vue-router'

import { StudioApplicationError } from '@/bootstrap/studio-application-error'
import {
  createBrowserActiveProjectRuntime,
  type BrowserActiveProjectRuntime,
} from '@/workbench/project/browser-active-project-runtime'
import {
  createProjectEntryCoordinator,
  type ProjectEntryCoordinator,
} from '@/workbench/project/entry/project-entry-coordinator'
import { PROJECT_ENTRY_CONTEXT_KEY } from '@/workbench/project/entry/vue/project-entry-context'
import {
  createProjectNavigationConfirmationCoordinator,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { PROJECT_NAVIGATION_DECISION_CONTEXT_KEY } from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import {
  createProjectNavigationDecisionVueBinding,
  type ProjectNavigationDecisionVueBinding,
} from '@/workbench/project/navigation/vue/project-navigation-decision-vue-binding'
import { ACTIVE_PROJECT_CONTEXT_KEY } from '@/workbench/project/vue/active-project-context'
import {
  createActiveProjectVueBinding,
  type ActiveProjectVueBinding,
} from '@/workbench/project/vue/active-project-vue-binding'

export interface BrowserStudioApplicationOptions {
  readonly rootComponent: Component
  readonly router: Router
}

export interface StudioApplicationComposition extends BrowserStudioApplicationOptions {
  /** Ownership transfers to the composed application. */
  readonly projectRuntime: BrowserActiveProjectRuntime
}

export interface StudioApplication {
  readonly projectEntry: ProjectEntryCoordinator
  readonly projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator
  mount(rootContainer: Element | string): ComponentPublicInstance
  dispose(): void
}

class StudioApplicationImpl implements StudioApplication {
  readonly projectEntry: ProjectEntryCoordinator
  readonly projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator
  readonly #vueApplication: VueApplication
  readonly #projectRuntime: BrowserActiveProjectRuntime
  readonly #activeProjectBinding: ActiveProjectVueBinding
  readonly #projectNavigationDecisionBinding: ProjectNavigationDecisionVueBinding
  #mounted = false
  #disposed = false
  #resourcesReleased = false

  constructor(
    vueApplication: VueApplication,
    projectRuntime: BrowserActiveProjectRuntime,
    activeProjectBinding: ActiveProjectVueBinding,
    projectNavigationDecisionBinding: ProjectNavigationDecisionVueBinding,
    projectEntry: ProjectEntryCoordinator,
    projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator,
  ) {
    this.#vueApplication = vueApplication
    this.#projectRuntime = projectRuntime
    this.#activeProjectBinding = activeProjectBinding
    this.#projectNavigationDecisionBinding = projectNavigationDecisionBinding
    this.projectEntry = projectEntry
    this.projectNavigationConfirmation = projectNavigationConfirmation
  }

  mount(rootContainer: Element | string): ComponentPublicInstance {
    if (this.#disposed) {
      throw new StudioApplicationError(
        'application-disposed',
        'The Studio application cannot be mounted after it has been disposed',
      )
    }
    if (this.#mounted) {
      throw new StudioApplicationError(
        'already-mounted',
        'The Studio application has already been mounted',
      )
    }

    const component = this.#vueApplication.mount(rootContainer)
    this.#mounted = true
    return component
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    try {
      if (this.#mounted) this.#vueApplication.unmount()
    } finally {
      this.#mounted = false
      this.#releaseResources()
    }
  }

  #releaseResources(): void {
    if (this.#resourcesReleased) return

    this.#resourcesReleased = true
    // Settle one-shot UI capabilities before tearing down state observation and browser resources.
    try {
      this.#projectNavigationDecisionBinding.dispose()
    } finally {
      try {
        this.#activeProjectBinding.dispose()
      } finally {
        this.#projectRuntime.dispose()
      }
    }
  }
}

/** Composes an owned Project Runtime into one Studio application graph. */
export function composeStudioApplication(
  composition: StudioApplicationComposition,
): StudioApplication {
  const { projectRuntime } = composition
  let activeProjectBinding: ActiveProjectVueBinding | null = null
  let projectNavigationDecisionBinding: ProjectNavigationDecisionVueBinding | null = null

  try {
    activeProjectBinding = createActiveProjectVueBinding(projectRuntime.activeProject)
    projectNavigationDecisionBinding = createProjectNavigationDecisionVueBinding()
    const projectEntry = createProjectEntryCoordinator({
      activeProject: projectRuntime.activeProject,
      projectCatalog: projectRuntime.projectCatalog,
    })
    const projectNavigationConfirmation = createProjectNavigationConfirmationCoordinator({
      activeProject: projectRuntime.activeProject,
      requestDecision: projectNavigationDecisionBinding.requestDecision,
    })
    const vueApplication = createApp(composition.rootComponent)

    vueApplication.provide(ACTIVE_PROJECT_CONTEXT_KEY, activeProjectBinding.context)
    vueApplication.provide(PROJECT_ENTRY_CONTEXT_KEY, Object.freeze({ projectEntry }))
    vueApplication.provide(
      PROJECT_NAVIGATION_DECISION_CONTEXT_KEY,
      projectNavigationDecisionBinding.context,
    )
    vueApplication.use(createPinia())
    // Router installation may start initial navigation, so app-scoped dependencies go first.
    vueApplication.use(composition.router)

    return new StudioApplicationImpl(
      vueApplication,
      projectRuntime,
      activeProjectBinding,
      projectNavigationDecisionBinding,
      projectEntry,
      projectNavigationConfirmation,
    )
  } catch (failureCause) {
    try {
      projectNavigationDecisionBinding?.dispose()
    } finally {
      try {
        activeProjectBinding?.dispose()
      } finally {
        projectRuntime.dispose()
      }
    }
    throw failureCause
  }
}

/** Creates the browser-owned resources and composes them for one Studio page lifetime. */
export function createBrowserStudioApplication(
  options: BrowserStudioApplicationOptions,
): StudioApplication {
  return composeStudioApplication({
    rootComponent: options.rootComponent,
    router: options.router,
    projectRuntime: createBrowserActiveProjectRuntime(),
  })
}
