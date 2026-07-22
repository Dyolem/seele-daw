import {
  IndexedDBProjectCatalog,
  IndexedDBProjectCheckpointStore,
  type RecentProjectSummary,
} from '@seele-daw/platform-browser'
import { parseProjectCheckpointId, parseProjectId } from '@seele-daw/project-core'

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
  readonly getCurrentTime?: () => number
  readonly newProjectName?: string
  readonly createUniqueId?: () => string
}

export interface ProjectCatalogReader {
  listRecentProjects(): Promise<readonly RecentProjectSummary[]>
}

export interface BrowserActiveProjectRuntime {
  readonly activeProject: ActiveProjectService
  readonly projectCatalog: ProjectCatalogReader
  dispose(): void
}

function createBrowserUniqueId(): string {
  return globalThis.crypto.randomUUID()
}

class BrowserActiveProjectRuntimeImpl implements BrowserActiveProjectRuntime {
  readonly activeProject: ActiveProjectService
  readonly projectCatalog: ProjectCatalogReader
  readonly #checkpointStore: IndexedDBProjectCheckpointStore
  readonly #projectCatalogStorage: IndexedDBProjectCatalog
  #disposed = false

  constructor(options: BrowserActiveProjectRuntimeOptions) {
    const createUniqueId = options.createUniqueId ?? createBrowserUniqueId
    const newProjectName = options.newProjectName ?? MINIMAL_NEW_PROJECT_NAME
    const storageOptions = {
      ...(options.databaseName === undefined ? {} : { databaseName: options.databaseName }),
      ...(options.getCurrentTime === undefined ? {} : { getCurrentTime: options.getCurrentTime }),
    }
    this.#checkpointStore = new IndexedDBProjectCheckpointStore(storageOptions)
    this.#projectCatalogStorage = new IndexedDBProjectCatalog(
      options.databaseName === undefined ? {} : { databaseName: options.databaseName },
    )
    this.projectCatalog = this.#projectCatalogStorage
    this.activeProject = createActiveProjectService({
      checkpointStore: this.#checkpointStore,
      createProjectId: () => parseProjectId(createUniqueId()),
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
      try {
        this.#projectCatalogStorage.close()
      } finally {
        this.#checkpointStore.close()
      }
    }
  }
}

/** Composes the browser-owned persistence resources for one Studio project subsystem lifetime. */
export function createBrowserActiveProjectRuntime(
  options: BrowserActiveProjectRuntimeOptions = {},
): BrowserActiveProjectRuntime {
  return new BrowserActiveProjectRuntimeImpl(options)
}
