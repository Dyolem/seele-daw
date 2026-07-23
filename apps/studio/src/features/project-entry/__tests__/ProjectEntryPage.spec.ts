import { parseProjectId } from '@seele-daw/project-core'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import ProjectEntryPage from '@/features/project-entry/ProjectEntryPage.vue'
import { PROJECT_ROUTE_NAME, PROJECT_ROUTE_QUERY } from '@/router/project-routes'
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

interface PageFixture {
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
  const resolve = vi.fn<ProjectEntryCoordinator['resolve']>(async () => initialResolution)

  return {
    projectEntryContext: Object.freeze({
      projectEntry: Object.freeze({ resolve }),
    }),
    resolve,
  }
}

async function createPageRouter(initialLocation = '/'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: PROJECT_ROUTE_NAME.ENTRY,
        component: { render: () => null },
      },
      {
        path: '/projects/new',
        name: PROJECT_ROUTE_NAME.CREATE,
        component: { render: () => null },
      },
      {
        path: '/projects/:projectId',
        name: PROJECT_ROUTE_NAME.WORKSPACE,
        component: { render: () => null },
      },
    ],
  })
  await router.push(initialLocation)
  await router.isReady()
  return router
}

async function mountPage(fixture: PageFixture, initialLocation = '/') {
  const router = await createPageRouter(initialLocation)
  const wrapper = mount(ProjectEntryPage, {
    global: {
      plugins: [router],
      provide: {
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: fixture.projectEntryContext,
      },
    },
  })

  return { router, wrapper }
}

describe('ProjectEntryPage', () => {
  it('shows the Create-only empty state after loading the local Catalog', async () => {
    const fixture = createFixture()
    const { wrapper } = await mountPage(fixture)

    await flushPromises()

    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
    expect(wrapper.get('h1').text()).toBe('Create something worth hearing.')
    expect(wrapper.text()).toContain('No projects yet')
    expect(wrapper.get('.project-entry__create').text()).toContain('Create new project')
    expect(wrapper.get('.project-entry__create').classes()).toContain('ui-button--primary')
  })

  it('navigates the primary action to the guarded Create Route', async () => {
    const fixture = createFixture()
    const { router, wrapper } = await mountPage(fixture)
    await flushPromises()

    await wrapper.get('.project-entry__create').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.CREATE)
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('renders recent Projects and navigates to the selected Project Route', async () => {
    const recentProject = createProject('Recent', Date.UTC(2026, 6, 22, 4, 30))
    const fixture = createFixture(createSelection([recentProject]))
    const { router, wrapper } = await mountPage(fixture)
    await flushPromises()

    expect(wrapper.text()).toContain('Project Recent')
    expect(wrapper.text()).toContain('Saved')
    expect(wrapper.get('.project-entry__count').text()).toBe('1')

    await wrapper.get('.project-entry__project').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(router.currentRoute.value.params.projectId).toBe(recentProject.projectId)
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('explains and hides a Project that a requested Route could not find', async () => {
    const missingProject = createProject('Missing', 100)
    const availableProject = createProject('Available', 90)
    const fixture = createFixture(createSelection([missingProject, availableProject]))
    const { wrapper } = await mountPage(
      fixture,
      `/?${PROJECT_ROUTE_QUERY.UNAVAILABLE_PROJECT_ID}=${missingProject.projectId}`,
    )
    await flushPromises()

    expect(wrapper.get('.project-entry__error > span').text()).toBe(
      'That project is no longer available.',
    )
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
    const { wrapper } = await mountPage(fixture)
    await flushPromises()

    expect(wrapper.get('.project-entry__error > span').text()).toBe(
      'Local project catalog is unavailable',
    )

    await wrapper.get('.project-entry__retry').trigger('click')
    await flushPromises()

    expect(fixture.resolve).toHaveBeenNthCalledWith(2, null)
    expect(wrapper.text()).toContain('No projects yet')
  })
})
