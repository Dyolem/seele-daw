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
  mount(rootContainer: Element | string): ComponentPublicInstance
  dispose(): void
}

class StudioApplicationImpl implements StudioApplication {
  readonly projectEntry: ProjectEntryCoordinator
  readonly #vueApplication: VueApplication
  readonly #projectRuntime: BrowserActiveProjectRuntime
  readonly #activeProjectBinding: ActiveProjectVueBinding
  #mounted = false
  #disposed = false
  #resourcesReleased = false

  constructor(
    vueApplication: VueApplication,
    projectRuntime: BrowserActiveProjectRuntime,
    activeProjectBinding: ActiveProjectVueBinding,
    projectEntry: ProjectEntryCoordinator,
  ) {
    this.#vueApplication = vueApplication
    this.#projectRuntime = projectRuntime
    this.#activeProjectBinding = activeProjectBinding
    this.projectEntry = projectEntry
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
    // Stop Vue state delivery before the Runtime tears down the Service and IndexedDB resources.
    try {
      this.#activeProjectBinding.dispose()
    } finally {
      this.#projectRuntime.dispose()
    }
  }
}

/** Composes an owned Project Runtime into one Studio application graph. */
export function composeStudioApplication(
  composition: StudioApplicationComposition,
): StudioApplication {
  const { projectRuntime } = composition
  let activeProjectBinding: ActiveProjectVueBinding | null = null

  try {
    activeProjectBinding = createActiveProjectVueBinding(projectRuntime.activeProject)
    const projectEntry = createProjectEntryCoordinator({
      activeProject: projectRuntime.activeProject,
      projectCatalog: projectRuntime.projectCatalog,
    })
    const vueApplication = createApp(composition.rootComponent)

    vueApplication.provide(ACTIVE_PROJECT_CONTEXT_KEY, activeProjectBinding.context)
    vueApplication.use(createPinia())
    // Router installation may start initial navigation, so app-scoped dependencies go first.
    vueApplication.use(composition.router)

    return new StudioApplicationImpl(
      vueApplication,
      projectRuntime,
      activeProjectBinding,
      projectEntry,
    )
  } catch (failureCause) {
    try {
      activeProjectBinding?.dispose()
    } finally {
      projectRuntime.dispose()
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
