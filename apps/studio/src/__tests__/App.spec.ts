import { parseProjectId } from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { shallowReadonly, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import ProjectEntryPage from '@/features/project-entry/ProjectEntryPage.vue'
import { createTestSession } from '@/workbench/project/__tests__/active-project-test-support'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  PROJECT_ENTRY_SELECTION_REASON,
  type ProjectEntryCoordinator,
} from '@/workbench/project/entry/project-entry-coordinator'
import {
  PROJECT_ENTRY_CONTEXT_KEY,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import {
  PROJECT_NAVIGATION_DECISION_CONTEXT_KEY,
  type ProjectNavigationDecisionVueContext,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import {
  ACTIVE_PROJECT_CONTEXT_KEY,
  type ActiveProjectVueContext,
} from '@/workbench/project/vue/active-project-context'

function createActiveProjectContext(state: ActiveProjectState): ActiveProjectVueContext {
  const stateRef = shallowRef(state)
  const activeProject: ActiveProjectService = {
    get state() {
      return stateRef.value
    },
    create: async () => parseProjectId('app-created-project'),
    open: async () => undefined,
    save: async () => undefined,
    subscribe: () => () => undefined,
    dispose() {},
  }

  return Object.freeze({ activeProject, state: shallowReadonly(stateRef) })
}

function createProjectEntryContext(): ProjectEntryVueContext {
  return Object.freeze({
    projectEntry: Object.freeze({
      resolve: vi.fn<ProjectEntryCoordinator['resolve']>(async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
          reason: PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
          requestedProjectId: null,
          recentProjects: Object.freeze([]),
        }),
      ),
    }),
  })
}

function createProjectNavigationDecisionContext(): ProjectNavigationDecisionVueContext {
  const pendingDecision = shallowRef(null)

  return Object.freeze({
    pendingDecision: shallowReadonly(pendingDecision),
    resolve: () => false,
  })
}

async function mountApp(state: ActiveProjectState) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: ProjectEntryPage,
      },
    ],
  })
  await router.push('/')
  await router.isReady()

  return mount(App, {
    global: {
      plugins: [router],
      provide: {
        [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: createActiveProjectContext(state),
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: createProjectEntryContext(),
        [PROJECT_NAVIGATION_DECISION_CONTEXT_KEY as symbol]:
          createProjectNavigationDecisionContext(),
      },
    },
  })
}

describe('App', () => {
  it('renders Project Entry while no Project is ready', async () => {
    const wrapper = await mountApp(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))

    await vi.waitFor(() => expect(wrapper.text()).toContain('No projects yet'))
    expect(wrapper.text()).toContain('Recent projects')
  })

  it('shows only a neutral handoff after a Project becomes ready', async () => {
    const projectId = parseProjectId('app-ready-project')
    const session = createTestSession(projectId)
    const wrapper = await mountApp(
      Object.freeze({
        phase: ACTIVE_PROJECT_PHASE.READY,
        projectId,
        session,
        modelRevision: session.modelRevision,
        contentStateId: session.contentStateId,
        savedRevision: session.modelRevision,
        savedContentStateId: session.contentStateId,
        isDirty: false,
        saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
        saveFailure: null,
        recoveryFailures: Object.freeze([]),
      }),
    )

    expect(wrapper.text()).toContain('PROJECT READY')
    expect(wrapper.get('h1').text()).toBe('Project ready')
    expect(wrapper.text()).toContain(projectId)
    expect(wrapper.text()).toContain('The editor interface will be designed in the next UI phase.')
    expect(wrapper.find('.project-entry').exists()).toBe(false)
  })
})
