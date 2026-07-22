import { parseProjectId, type ProjectId } from '@seele-daw/project-core'

import { ActiveProjectError } from '@/workbench/project/active-project-error'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import type {
  ProjectCatalogReader,
  RecentProjectSummary,
} from '@/workbench/project/project-catalog-reader'

export const PROJECT_ENTRY_RESOLUTION_KIND = {
  ACTIVE: 'active',
  FAILED: 'failed',
  SELECTION_REQUIRED: 'selection-required',
} as const

export const PROJECT_ENTRY_SELECTION_REASON = {
  NO_REQUESTED_PROJECT: 'no-requested-project',
  REQUESTED_PROJECT_NOT_FOUND: 'requested-project-not-found',
} as const

export const PROJECT_ENTRY_FAILURE_OPERATION = {
  LIST_RECENT_PROJECTS: 'list-recent-projects',
  OPEN_REQUESTED_PROJECT: 'open-requested-project',
  VALIDATE_REQUESTED_PROJECT: 'validate-requested-project',
} as const

export type ProjectEntrySelectionReason =
  (typeof PROJECT_ENTRY_SELECTION_REASON)[keyof typeof PROJECT_ENTRY_SELECTION_REASON]

export type ProjectEntryFailureOperation =
  (typeof PROJECT_ENTRY_FAILURE_OPERATION)[keyof typeof PROJECT_ENTRY_FAILURE_OPERATION]

export interface ActiveProjectEntryResolution {
  readonly kind: typeof PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE
  readonly projectId: ProjectId
}

export interface ProjectSelectionRequiredResolution {
  readonly kind: typeof PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED
  readonly reason: ProjectEntrySelectionReason
  readonly requestedProjectId: ProjectId | null
  readonly recentProjects: readonly RecentProjectSummary[]
}

export interface FailedProjectEntryResolution {
  readonly kind: typeof PROJECT_ENTRY_RESOLUTION_KIND.FAILED
  readonly operation: ProjectEntryFailureOperation
  readonly requestedProjectId: ProjectId | null
  readonly failureCause: unknown
}

export type ProjectEntryResolution =
  | ActiveProjectEntryResolution
  | ProjectSelectionRequiredResolution
  | FailedProjectEntryResolution

export interface ProjectEntryCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'open'>
  readonly projectCatalog: ProjectCatalogReader
}

export interface ProjectEntryCoordinator {
  resolve(requestedProjectId: ProjectId | null): Promise<ProjectEntryResolution>
}

function createActiveResolution(projectId: ProjectId): ActiveProjectEntryResolution {
  return Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId })
}

function createFailureResolution(
  operation: ProjectEntryFailureOperation,
  requestedProjectId: ProjectId | null,
  failureCause: unknown,
): FailedProjectEntryResolution {
  return Object.freeze({
    kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
    operation,
    requestedProjectId,
    failureCause,
  })
}

function cloneRecentProjects(
  projects: readonly RecentProjectSummary[],
  excludedProjectId: ProjectId | null,
): readonly RecentProjectSummary[] {
  return Object.freeze(
    projects
      .filter(({ projectId }) => projectId !== excludedProjectId)
      .map((project) =>
        Object.freeze({
          projectId: project.projectId,
          name: project.name,
          lastCheckpointSavedAt: project.lastCheckpointSavedAt,
        }),
      ),
  )
}

function isProjectNotFound(failureCause: unknown): failureCause is ActiveProjectError {
  return failureCause instanceof ActiveProjectError && failureCause.code === 'project-not-found'
}

class ProjectEntryCoordinatorImpl implements ProjectEntryCoordinator {
  readonly #dependencies: ProjectEntryCoordinatorDependencies

  constructor(dependencies: ProjectEntryCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  async resolve(requestedProjectIdInput: ProjectId | null): Promise<ProjectEntryResolution> {
    if (requestedProjectIdInput === null) {
      return this.#createSelectionResolution(
        PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
        null,
      )
    }

    let requestedProjectId: ProjectId
    try {
      requestedProjectId = parseProjectId(requestedProjectIdInput)
    } catch (failureCause) {
      return createFailureResolution(
        PROJECT_ENTRY_FAILURE_OPERATION.VALIDATE_REQUESTED_PROJECT,
        null,
        failureCause,
      )
    }

    try {
      await this.#dependencies.activeProject.open(requestedProjectId)
      return createActiveResolution(requestedProjectId)
    } catch (failureCause) {
      if (!isProjectNotFound(failureCause)) {
        return createFailureResolution(
          PROJECT_ENTRY_FAILURE_OPERATION.OPEN_REQUESTED_PROJECT,
          requestedProjectId,
          failureCause,
        )
      }
    }

    return this.#createSelectionResolution(
      PROJECT_ENTRY_SELECTION_REASON.REQUESTED_PROJECT_NOT_FOUND,
      requestedProjectId,
    )
  }

  async #createSelectionResolution(
    reason: ProjectEntrySelectionReason,
    requestedProjectId: ProjectId | null,
  ): Promise<ProjectEntryResolution> {
    try {
      const projects = await this.#dependencies.projectCatalog.listRecentProjects()
      return Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
        reason,
        requestedProjectId,
        recentProjects: cloneRecentProjects(projects, requestedProjectId),
      })
    } catch (failureCause) {
      return createFailureResolution(
        PROJECT_ENTRY_FAILURE_OPERATION.LIST_RECENT_PROJECTS,
        requestedProjectId,
        failureCause,
      )
    }
  }
}

/** Coordinates one framework-neutral initial Project entry resolution. */
export function createProjectEntryCoordinator(
  dependencies: ProjectEntryCoordinatorDependencies,
): ProjectEntryCoordinator {
  return Object.freeze(new ProjectEntryCoordinatorImpl(dependencies))
}
