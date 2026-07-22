import { IndexedDBProjectCheckpointStore } from '@seele-daw/platform-browser'
import { parseProjectCheckpointId } from '@seele-daw/project-core'

import {
  createActiveProjectService,
  type ActiveProjectService,
} from '@/workbench/project/active-project-service'
import {
  createMinimalNewProjectSession,
  MINIMAL_NEW_PROJECT_NAME,
} from '@/workbench/project/minimal-new-project-session'

export interface BrowserActiveProjectRuntimeOptions {
  readonly databaseName?: string
  readonly newProjectName?: string
  readonly createUniqueId?: () => string
}

export interface BrowserActiveProjectRuntime {
  readonly activeProject: ActiveProjectService
  dispose(): void
}

function createBrowserUniqueId(): string {
  return globalThis.crypto.randomUUID()
}

class BrowserActiveProjectRuntimeImpl implements BrowserActiveProjectRuntime {
  readonly activeProject: ActiveProjectService
  readonly #checkpointStore: IndexedDBProjectCheckpointStore
  #disposed = false

  constructor(options: BrowserActiveProjectRuntimeOptions) {
    const createUniqueId = options.createUniqueId ?? createBrowserUniqueId
    const newProjectName = options.newProjectName ?? MINIMAL_NEW_PROJECT_NAME
    this.#checkpointStore =
      options.databaseName === undefined
        ? new IndexedDBProjectCheckpointStore()
        : new IndexedDBProjectCheckpointStore({ databaseName: options.databaseName })
    this.activeProject = createActiveProjectService({
      checkpointStore: this.#checkpointStore,
      createCheckpointId: () => parseProjectCheckpointId(createUniqueId()),
      createNewSession: (projectId) =>
        createMinimalNewProjectSession({ projectId, projectName: newProjectName, createUniqueId }),
    })
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    try {
      this.activeProject.dispose()
    } finally {
      this.#checkpointStore.close()
    }
  }
}

/** Composes the browser-owned persistence resources for one Studio project subsystem lifetime. */
export function createBrowserActiveProjectRuntime(
  options: BrowserActiveProjectRuntimeOptions = {},
): BrowserActiveProjectRuntime {
  return new BrowserActiveProjectRuntimeImpl(options)
}
