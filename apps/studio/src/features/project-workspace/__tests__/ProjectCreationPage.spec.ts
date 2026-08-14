import { parseProjectId, type ProjectId } from '@seele-daw/project-core'
import { flushPromises, mount } from '@vue/test-utils'
import { shallowReadonly, shallowRef } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import ProjectCreationPage from '@/features/project-workspace/ProjectCreationPage.vue'
import { createStudioRouter } from '@/router'
import { PROJECT_ROUTE_NAME } from '@/router/project-routes'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  ACTIVE_PROJECT_CONTEXT_KEY,
  type ActiveProjectVueContext,
} from '@/workbench/project/vue/active-project-context'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve(value) {
      if (resolvePromise === null) throw new Error('Deferred resolver is unavailable')
      resolvePromise(value)
    },
  }
}

function createActiveProjectContext(
  create: ActiveProjectService['create'],
): ActiveProjectVueContext {
  const state = shallowRef<ActiveProjectState>(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))
  const activeProject: ActiveProjectService = {
    get state() {
      return state.value
    },
    create,
    open: async () => undefined,
    save: async () => undefined,
    subscribe: () => () => undefined,
    subscribeCommits: () => () => undefined,
    dispose() {},
  }

  return Object.freeze({ activeProject, state: shallowReadonly(state) })
}

async function mountPage(create: ActiveProjectService['create']) {
  const router = createStudioRouter(createMemoryHistory())
  await router.push({ name: PROJECT_ROUTE_NAME.CREATE })
  await router.isReady()
  const wrapper = mount(ProjectCreationPage, {
    global: {
      plugins: [router],
      provide: {
        [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: createActiveProjectContext(create),
      },
    },
  })

  return { router, wrapper }
}

describe('ProjectCreationPage', () => {
  it('creates a durable Project and replaces the command Route with its identity', async () => {
    const projectId = parseProjectId('project-creation-page-success')
    const create = vi.fn<() => Promise<ProjectId>>(async () => projectId)
    const { router } = await mountPage(create)

    await flushPromises()

    expect(create).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(router.currentRoute.value.params.projectId).toBe(projectId)
  })

  it('keeps a failed Create recoverable and supports Retry', async () => {
    const projectId = parseProjectId('project-creation-page-retry')
    const create = vi
      .fn<() => Promise<ProjectId>>()
      .mockRejectedValueOnce(new Error('Initial checkpoint failed'))
      .mockResolvedValueOnce(projectId)
    const { router, wrapper } = await mountPage(create)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Initial checkpoint failed')
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.CREATE)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(create).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(router.currentRoute.value.params.projectId).toBe(projectId)
  })

  it('does not change the Route from a result delivered after unmount', async () => {
    const projectId = parseProjectId('project-creation-page-late')
    const deferred = createDeferred<ProjectId>()
    const create = vi.fn<() => Promise<ProjectId>>(() => deferred.promise)
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
          component: ProjectCreationPage,
        },
        {
          path: '/projects/:projectId',
          name: PROJECT_ROUTE_NAME.WORKSPACE,
          component: { render: () => null },
        },
      ],
    })
    await router.push({ name: PROJECT_ROUTE_NAME.CREATE })
    await router.isReady()
    const wrapper = mount(RouterView, {
      global: {
        plugins: [router],
        provide: {
          [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: createActiveProjectContext(create),
        },
      },
    })
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())

    await router.push({ name: PROJECT_ROUTE_NAME.ENTRY })
    deferred.resolve(projectId)
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)
    wrapper.unmount()
  })
})
