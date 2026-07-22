import { parseProjectId, type ProjectId } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import { ActiveProjectError } from '@/workbench/project/active-project-error'
import {
  createProjectEntryCoordinator,
  PROJECT_ENTRY_FAILURE_OPERATION,
  PROJECT_ENTRY_RESOLUTION_KIND,
  PROJECT_ENTRY_SELECTION_REASON,
  type ProjectEntryCoordinatorDependencies,
} from '@/workbench/project/entry/project-entry-coordinator'
import type {
  ProjectCatalogReader,
  RecentProjectSummary,
} from '@/workbench/project/project-catalog-reader'

interface EntryFixture {
  readonly activeProject: ProjectEntryCoordinatorDependencies['activeProject']
  readonly listRecentProjects: ReturnType<
    typeof vi.fn<() => Promise<readonly RecentProjectSummary[]>>
  >
  readonly open: ReturnType<typeof vi.fn<(projectId: ProjectId) => Promise<void>>>
  readonly projectCatalog: ProjectCatalogReader
}

function createProjectId(suffix: string): ProjectId {
  return parseProjectId(`project-entry-${suffix}`)
}

function createRecentProject(suffix: string, lastCheckpointSavedAt: number): RecentProjectSummary {
  return {
    projectId: createProjectId(suffix),
    name: `Project ${suffix}`,
    lastCheckpointSavedAt,
  }
}

function createFixture(projects: readonly RecentProjectSummary[] = []): EntryFixture {
  const open = vi.fn<(projectId: ProjectId) => Promise<void>>(async () => undefined)
  const listRecentProjects = vi.fn<() => Promise<readonly RecentProjectSummary[]>>(
    async () => projects,
  )
  const activeProject = { open }
  const projectCatalog: ProjectCatalogReader = { listRecentProjects }

  return { activeProject, listRecentProjects, open, projectCatalog }
}

describe('ProjectEntryCoordinator', () => {
  it('returns recent Projects for explicit selection when no Project was requested', async () => {
    const projects = [createRecentProject('recent', 200), createRecentProject('older', 100)]
    const fixture = createFixture(projects)
    const coordinator = createProjectEntryCoordinator(fixture)

    const resolution = await coordinator.resolve(null)

    expect(resolution).toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
      reason: PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
      requestedProjectId: null,
      recentProjects: projects,
    })
    expect(fixture.open).not.toHaveBeenCalled()
    expect(fixture.listRecentProjects).toHaveBeenCalledOnce()
    expect(Object.isFrozen(coordinator)).toBe(true)
    expect(Object.isFrozen(resolution)).toBe(true)
    if (resolution.kind !== PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED) {
      throw new Error('Expected Project selection')
    }
    expect(resolution.recentProjects).not.toBe(projects)
    expect(Object.isFrozen(resolution.recentProjects)).toBe(true)
    expect(resolution.recentProjects.every(Object.isFrozen)).toBe(true)
  })

  it('keeps an empty Catalog as a valid Create-only selection', async () => {
    const fixture = createFixture()
    const coordinator = createProjectEntryCoordinator(fixture)

    await expect(coordinator.resolve(null)).resolves.toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
      reason: PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
      requestedProjectId: null,
      recentProjects: [],
    })
  })

  it('opens a requested Project without reading the Catalog', async () => {
    const requestedProjectId = createProjectId('requested')
    const fixture = createFixture([createRecentProject('unused', 100)])
    const coordinator = createProjectEntryCoordinator(fixture)

    const resolution = await coordinator.resolve(requestedProjectId)
    expect(resolution).toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
      projectId: requestedProjectId,
    })
    expect(Object.isFrozen(resolution)).toBe(true)
    expect(fixture.open).toHaveBeenCalledExactlyOnceWith(requestedProjectId)
    expect(fixture.listRecentProjects).not.toHaveBeenCalled()
  })

  it('offers other recent Projects when the requested identity does not exist', async () => {
    const requestedProjectId = createProjectId('missing')
    const availableProject = createRecentProject('available', 200)
    const orphanedRequestedProject: RecentProjectSummary = {
      projectId: requestedProjectId,
      name: 'Orphaned requested Project',
      lastCheckpointSavedAt: 300,
    }
    const fixture = createFixture([orphanedRequestedProject, availableProject])
    fixture.open.mockRejectedValue(
      new ActiveProjectError('project-not-found', `Project ${requestedProjectId} does not exist`, {
        projectId: requestedProjectId,
      }),
    )
    const coordinator = createProjectEntryCoordinator(fixture)

    await expect(coordinator.resolve(requestedProjectId)).resolves.toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
      reason: PROJECT_ENTRY_SELECTION_REASON.REQUESTED_PROJECT_NOT_FOUND,
      requestedProjectId,
      recentProjects: [availableProject],
    })
  })

  it('preserves non-not-found Open failures instead of treating them as an empty Project', async () => {
    const requestedProjectId = createProjectId('damaged')
    const failureCause = new Error('All Checkpoint candidates are damaged')
    const fixture = createFixture([createRecentProject('available', 100)])
    fixture.open.mockRejectedValue(failureCause)
    const coordinator = createProjectEntryCoordinator(fixture)

    const resolution = await coordinator.resolve(requestedProjectId)
    expect(resolution).toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
      operation: PROJECT_ENTRY_FAILURE_OPERATION.OPEN_REQUESTED_PROJECT,
      requestedProjectId,
      failureCause,
    })
    expect(Object.isFrozen(resolution)).toBe(true)
    expect(fixture.listRecentProjects).not.toHaveBeenCalled()
  })

  it('does not accept a lookalike project-not-found error from another boundary', async () => {
    const requestedProjectId = createProjectId('lookalike')
    const failureCause = { code: 'project-not-found' }
    const fixture = createFixture([createRecentProject('available', 100)])
    fixture.open.mockRejectedValue(failureCause)
    const coordinator = createProjectEntryCoordinator(fixture)

    await expect(coordinator.resolve(requestedProjectId)).resolves.toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
      operation: PROJECT_ENTRY_FAILURE_OPERATION.OPEN_REQUESTED_PROJECT,
      requestedProjectId,
      failureCause,
    })
    expect(fixture.listRecentProjects).not.toHaveBeenCalled()
  })

  it('preserves Catalog read failures for both selection paths', async () => {
    const failureCause = new Error('Project Catalog unavailable')
    const noRequestFixture = createFixture()
    noRequestFixture.listRecentProjects.mockRejectedValue(failureCause)
    const noRequestCoordinator = createProjectEntryCoordinator(noRequestFixture)

    await expect(noRequestCoordinator.resolve(null)).resolves.toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
      operation: PROJECT_ENTRY_FAILURE_OPERATION.LIST_RECENT_PROJECTS,
      requestedProjectId: null,
      failureCause,
    })

    const requestedProjectId = createProjectId('missing-catalog-failure')
    const missingRequestFixture = createFixture()
    missingRequestFixture.open.mockRejectedValue(
      new ActiveProjectError('project-not-found', 'Requested Project is missing', {
        projectId: requestedProjectId,
      }),
    )
    missingRequestFixture.listRecentProjects.mockRejectedValue(failureCause)
    const missingRequestCoordinator = createProjectEntryCoordinator(missingRequestFixture)

    await expect(missingRequestCoordinator.resolve(requestedProjectId)).resolves.toEqual({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
      operation: PROJECT_ENTRY_FAILURE_OPERATION.LIST_RECENT_PROJECTS,
      requestedProjectId,
      failureCause,
    })
  })

  it('rejects an invalid branded Project ID before calling either dependency', async () => {
    const fixture = createFixture([createRecentProject('available', 100)])
    const coordinator = createProjectEntryCoordinator(fixture)

    const resolution = await coordinator.resolve('' as ProjectId)

    expect(resolution).toMatchObject({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
      operation: PROJECT_ENTRY_FAILURE_OPERATION.VALIDATE_REQUESTED_PROJECT,
      requestedProjectId: null,
      failureCause: expect.any(Error),
    })
    expect(fixture.open).not.toHaveBeenCalled()
    expect(fixture.listRecentProjects).not.toHaveBeenCalled()
  })
})
