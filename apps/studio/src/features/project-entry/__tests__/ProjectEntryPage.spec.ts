import { parseProjectId, type ProjectId } from '@seele-daw/project-core'
import { flushPromises, mount } from '@vue/test-utils'
import { shallowReadonly, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import ProjectEntryPage from '@/features/project-entry/ProjectEntryPage.vue'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  PROJECT_ENTRY_FAILURE_OPERATION,
  PROJECT_ENTRY_RESOLUTION_KIND,
  PROJECT_ENTRY_SELECTION_REASON,
  type ProjectEntryCoordinator,
  type ProjectEntryResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import {
  PROJECT_ENTRY_CONTEXT_KEY,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import type { RecentProjectSummary } from '@/workbench/project/project-catalog-reader'
import {
  ACTIVE_PROJECT_CONTEXT_KEY,
  type ActiveProjectVueContext,
} from '@/workbench/project/vue/active-project-context'

interface PageFixture {
  readonly activeProject: ActiveProjectService
  readonly activeProjectContext: ActiveProjectVueContext
  readonly create: ReturnType<typeof vi.fn<() => Promise<ProjectId>>>
  readonly projectEntryContext: ProjectEntryVueContext
  readonly resolve: ReturnType<typeof vi.fn<ProjectEntryCoordinator['resolve']>>
}

function createProject(suffix: string, lastCheckpointSavedAt: number): RecentProjectSummary {
  return Object.freeze({
    projectId: parseProjectId(`project-entry-page-${suffix}`),
    name: `Project ${suffix}`,
    lastCheckpointSavedAt,
  })
}

function createSelection(projects: readonly RecentProjectSummary[]): ProjectEntryResolution {
  return Object.freeze({
    kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
    reason: PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
    requestedProjectId: null,
    recentProjects: Object.freeze([...projects]),
  })
}

function createFixture(
  initialResolution: ProjectEntryResolution = createSelection([]),
): PageFixture {
  const state = shallowRef<ActiveProjectState>(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))
  const create = vi.fn<() => Promise<ProjectId>>(async () =>
    parseProjectId('project-entry-page-created'),
  )
  const resolve = vi.fn<ProjectEntryCoordinator['resolve']>(async () => initialResolution)
  const activeProject: ActiveProjectService = {
    get state() {
      return state.value
    },
    create,
    open: async () => undefined,
    save: async () => undefined,
    subscribe: () => () => undefined,
    dispose() {},
  }

  return {
    activeProject,
    activeProjectContext: Object.freeze({
      activeProject,
      state: shallowReadonly(state),
    }),
    create,
    projectEntryContext: Object.freeze({
      projectEntry: Object.freeze({ resolve }),
    }),
    resolve,
  }
}

function mountPage(fixture: PageFixture) {
  return mount(ProjectEntryPage, {
    global: {
      provide: {
        [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: fixture.activeProjectContext,
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: fixture.projectEntryContext,
      },
    },
  })
}

describe('ProjectEntryPage', () => {
  it('shows the Create-only empty state after loading the local Catalog', async () => {
    const fixture = createFixture()
    const wrapper = mountPage(fixture)

    await flushPromises()

    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
    expect(wrapper.get('h1').text()).toBe('Create something worth hearing.')
    expect(wrapper.text()).toContain('No projects yet')
    expect(wrapper.get('.project-entry__create').text()).toContain('New project')
  })

  it('creates a minimal Project from the primary action', async () => {
    const fixture = createFixture()
    const wrapper = mountPage(fixture)
    await flushPromises()

    await wrapper.get('.project-entry__create').trigger('click')
    await flushPromises()

    expect(fixture.create).toHaveBeenCalledOnce()
  })

  it('renders recent Projects and opens the selected identity through the Coordinator', async () => {
    const recentProject = createProject('Recent', Date.UTC(2026, 6, 22, 4, 30))
    const fixture = createFixture(createSelection([recentProject]))
    const wrapper = mountPage(fixture)
    await flushPromises()

    expect(wrapper.text()).toContain('Project Recent')
    expect(wrapper.text()).toContain('Saved')

    await wrapper.get('.project-entry__project').trigger('click')
    await flushPromises()

    expect(fixture.resolve).toHaveBeenNthCalledWith(2, recentProject.projectId)
  })

  it('keeps selection visible and explains when a recent Project disappeared', async () => {
    const missingProject = createProject('Missing', 100)
    const availableProject = createProject('Available', 90)
    const fixture = createFixture(createSelection([missingProject]))
    fixture.resolve.mockResolvedValueOnce(createSelection([missingProject])).mockResolvedValueOnce(
      Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
        reason: PROJECT_ENTRY_SELECTION_REASON.REQUESTED_PROJECT_NOT_FOUND,
        requestedProjectId: missingProject.projectId,
        recentProjects: Object.freeze([availableProject]),
      }),
    )
    const wrapper = mountPage(fixture)
    await flushPromises()

    await wrapper.get('.project-entry__project').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('That project is no longer available.')
    expect(wrapper.text()).toContain('Project Available')
    expect(wrapper.text()).not.toContain('Project Missing')
  })

  it('surfaces Catalog failures and can retry the initial selection', async () => {
    const fixture = createFixture()
    fixture.resolve.mockResolvedValueOnce(
      Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
        operation: PROJECT_ENTRY_FAILURE_OPERATION.LIST_RECENT_PROJECTS,
        requestedProjectId: null,
        failureCause: new Error('Local project catalog is unavailable'),
      }),
    )
    const wrapper = mountPage(fixture)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Local project catalog is unavailable')

    await wrapper.get('.project-entry__retry').trigger('click')
    await flushPromises()

    expect(fixture.resolve).toHaveBeenNthCalledWith(2, null)
    expect(wrapper.text()).toContain('No projects yet')
  })
})
