import { defineStore } from 'pinia'
import { defineComponent, h, onUnmounted } from 'vue'
import { createMemoryHistory, createRouter, useRouter, type Router } from 'vue-router'
import { parseProjectId, type ProjectId } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import { StudioApplicationError } from '@/bootstrap/studio-application-error'
import { composeStudioApplication } from '@/bootstrap/studio-application'
import { createTestSession } from '@/workbench/project/__tests__/active-project-test-support'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import type { BrowserActiveProjectRuntime } from '@/workbench/project/browser-active-project-runtime'
import { PROJECT_ENTRY_RESOLUTION_KIND } from '@/workbench/project/entry/project-entry-coordinator'
import {
  useProjectEntry,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import {
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  PROJECT_NAVIGATION_DECISION,
  PROJECT_NAVIGATION_INTENT_KIND,
  PROJECT_NAVIGATION_PROCEED_REASON,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import {
  useProjectNavigationDecision,
  type ProjectNavigationDecisionVueContext,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

interface RuntimeFixture {
  readonly runtime: BrowserActiveProjectRuntime
  readonly open: ReturnType<typeof vi.fn<(projectId: ProjectId) => Promise<void>>>
  readonly listRecentProjects: ReturnType<
    typeof vi.fn<BrowserActiveProjectRuntime['projectCatalog']['listRecentProjects']>
  >
  readonly unsubscribe: ReturnType<typeof vi.fn<() => void>>
  readonly save: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly dispose: ReturnType<typeof vi.fn<() => void>>
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  })
}

function createRuntimeFixture(
  order: string[] = [],
  state: ActiveProjectState = Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
): RuntimeFixture {
  const unsubscribe = vi.fn<() => void>(() => {
    order.push('binding')
  })
  const open = vi.fn<(projectId: ProjectId) => Promise<void>>(() => Promise.resolve())
  const listRecentProjects = vi.fn<
    BrowserActiveProjectRuntime['projectCatalog']['listRecentProjects']
  >(() => Promise.resolve([]))
  const save = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const activeProject: ActiveProjectService = {
    state,
    create: () => Promise.resolve(parseProjectId('studio-created-project')),
    open,
    save,
    subscribe: () => unsubscribe,
    dispose() {},
  }
  const dispose = vi.fn<() => void>(() => {
    order.push('runtime')
  })

  return {
    runtime: {
      activeProject,
      projectCatalog: { listRecentProjects },
      dispose,
    },
    open,
    listRecentProjects,
    unsubscribe,
    save,
    dispose,
  }
}

function createDirtyReadyState(projectId: ProjectId): ActiveProjectState {
  const session = createTestSession(projectId)

  return Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId,
    session,
    modelRevision: session.modelRevision,
    contentStateId: session.contentStateId,
    savedRevision: null,
    savedContentStateId: null,
    isDirty: true,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    saveFailure: null,
    recoveryFailures: Object.freeze([]),
  })
}

function requireNavigationDecisionContext(
  context: ProjectNavigationDecisionVueContext | null,
): ProjectNavigationDecisionVueContext {
  if (context === null) throw new Error('Expected the Project navigation decision Context')
  return context
}

function requireProjectEntryContext(
  context: ProjectEntryVueContext | null,
): ProjectEntryVueContext {
  if (context === null) throw new Error('Expected the Project Entry Context')
  return context
}

describe('StudioApplication', () => {
  it('installs Pinia and Router while providing the owned Active Project Context', () => {
    const fixture = createRuntimeFixture()
    const router = createTestRouter()
    const useCompositionStore = defineStore('studio-composition-root', {
      state: () => ({ label: 'pinia' }),
    })
    let projectEntryContext: ProjectEntryVueContext | null = null
    const rootComponent = defineComponent({
      setup() {
        const activeProject = useActiveProject()
        projectEntryContext = useProjectEntry()
        const projectNavigationDecision = useProjectNavigationDecision()
        const installedRouter = useRouter()
        const store = useCompositionStore()

        return () =>
          h(
            'p',
            `${activeProject.state.value.phase}|${projectNavigationDecision.pendingDecision.value === null}|${store.label}|${installedRouter === router}`,
          )
      },
    })
    const application = composeStudioApplication({
      rootComponent,
      router,
      projectRuntime: fixture.runtime,
    })
    const container = document.createElement('div')

    application.mount(container)

    expect(container.textContent).toBe('idle|true|pinia|true')
    expect(requireProjectEntryContext(projectEntryContext).projectEntry).toBe(
      application.projectEntry,
    )
    application.dispose()
  })

  it('wires Project Navigation Confirmation to the provided Vue decision channel', async () => {
    const projectId = parseProjectId('studio-navigation-project')
    const fixture = createRuntimeFixture([], createDirtyReadyState(projectId))
    let decisionContext: ProjectNavigationDecisionVueContext | null = null
    const application = composeStudioApplication({
      rootComponent: defineComponent({
        setup() {
          decisionContext = useProjectNavigationDecision()
          return () => null
        },
      }),
      router: createTestRouter(),
      projectRuntime: fixture.runtime,
    })
    application.mount(document.createElement('div'))
    const context = requireNavigationDecisionContext(decisionContext)

    const confirmation = application.projectNavigationConfirmation.confirm({
      kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT,
    })
    await vi.waitFor(() => expect(context.pendingDecision.value).not.toBeNull())
    const pending = context.pendingDecision.value
    if (pending === null) {
      throw new Error('Expected a provided pending Project navigation decision')
    }

    expect(pending.request.activeProjectId).toBe(projectId)
    expect(context.resolve(pending, PROJECT_NAVIGATION_DECISION.DISCARD)).toBe(true)
    await expect(confirmation).resolves.toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.DISCARDED,
      activeProjectId: projectId,
    })
    expect(fixture.save).not.toHaveBeenCalled()
    application.dispose()
  })

  it('guards a protected Router navigation through the same Vue decision channel', async () => {
    const projectId = parseProjectId('studio-router-navigation-project')
    const fixture = createRuntimeFixture([], createDirtyReadyState(projectId))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => null } },
        {
          path: '/projects/new',
          component: { render: () => null },
          meta: { projectNavigation: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT },
        },
      ],
    })
    await router.push('/')
    await router.isReady()
    let decisionContext: ProjectNavigationDecisionVueContext | null = null
    const application = composeStudioApplication({
      rootComponent: defineComponent({
        setup() {
          decisionContext = useProjectNavigationDecision()
          return () => null
        },
      }),
      router,
      projectRuntime: fixture.runtime,
    })
    application.mount(document.createElement('div'))
    const context = requireNavigationDecisionContext(decisionContext)

    const navigation = router.push('/projects/new')
    await vi.waitFor(() => expect(context.pendingDecision.value).not.toBeNull())
    const pending = context.pendingDecision.value
    if (pending === null) throw new Error('Expected a guarded Router decision')

    expect(pending.request.intent).toEqual({
      kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT,
    })
    expect(context.resolve(pending, PROJECT_NAVIGATION_DECISION.DISCARD)).toBe(true)
    await navigation

    expect(router.currentRoute.value.path).toBe('/projects/new')
    application.dispose()
  })

  it('cancels a pending Project navigation decision when the application is disposed', async () => {
    const projectId = parseProjectId('studio-navigation-dispose')
    const fixture = createRuntimeFixture([], createDirtyReadyState(projectId))
    let decisionContext: ProjectNavigationDecisionVueContext | null = null
    const application = composeStudioApplication({
      rootComponent: defineComponent({
        setup() {
          decisionContext = useProjectNavigationDecision()
          return () => null
        },
      }),
      router: createTestRouter(),
      projectRuntime: fixture.runtime,
    })
    application.mount(document.createElement('div'))
    const context = requireNavigationDecisionContext(decisionContext)
    const confirmation = application.projectNavigationConfirmation.confirm({
      kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT,
    })
    await vi.waitFor(() => expect(context.pendingDecision.value).not.toBeNull())

    application.dispose()

    await expect(confirmation).resolves.toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED,
      activeProjectId: projectId,
    })
    expect(context.pendingDecision.value).toBeNull()
    expect(fixture.dispose).toHaveBeenCalledOnce()
  })

  it('wires Project Entry to the same owned Active Project Runtime', async () => {
    const fixture = createRuntimeFixture()
    const projectId = parseProjectId('studio-entry-project')
    const application = composeStudioApplication({
      rootComponent: { render: () => null },
      router: createTestRouter(),
      projectRuntime: fixture.runtime,
    })

    const resolution = await application.projectEntry.resolve(projectId)

    expect(resolution).toEqual({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId })
    expect(fixture.open).toHaveBeenCalledExactlyOnceWith(projectId)
    expect(fixture.listRecentProjects).not.toHaveBeenCalled()
    application.dispose()
  })

  it('unmounts components before releasing the Binding and browser Runtime once', () => {
    const order: string[] = []
    const fixture = createRuntimeFixture(order)
    const application = composeStudioApplication({
      rootComponent: defineComponent({
        setup() {
          onUnmounted(() => order.push('component'))
          return () => null
        },
      }),
      router: createTestRouter(),
      projectRuntime: fixture.runtime,
    })

    application.mount(document.createElement('div'))
    application.dispose()
    application.dispose()

    expect(order).toEqual(['component', 'binding', 'runtime'])
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
    expect(fixture.dispose).toHaveBeenCalledOnce()
  })

  it('releases owned resources even when disposed before mounting', () => {
    const fixture = createRuntimeFixture()
    const application = composeStudioApplication({
      rootComponent: { render: () => null },
      router: createTestRouter(),
      projectRuntime: fixture.runtime,
    })

    application.dispose()
    application.dispose()

    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
    expect(fixture.dispose).toHaveBeenCalledOnce()
  })

  it('releases the transferred Runtime when application composition fails', () => {
    const fixture = createRuntimeFixture()
    const router = createTestRouter()
    const failureCause = new Error('Router installation failed')
    vi.spyOn(router, 'install').mockImplementation(() => {
      throw failureCause
    })

    expect(() =>
      composeStudioApplication({
        rootComponent: { render: () => null },
        router,
        projectRuntime: fixture.runtime,
      }),
    ).toThrow(failureCause)
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
    expect(fixture.dispose).toHaveBeenCalledOnce()
  })

  it('rejects repeated mount and mounting after disposal with stable lifecycle errors', () => {
    const mountedFixture = createRuntimeFixture()
    const mountedApplication = composeStudioApplication({
      rootComponent: { render: () => null },
      router: createTestRouter(),
      projectRuntime: mountedFixture.runtime,
    })
    mountedApplication.mount(document.createElement('div'))

    expect(() => mountedApplication.mount(document.createElement('div'))).toThrowError(
      expect.objectContaining({ name: 'StudioApplicationError', code: 'already-mounted' }),
    )
    mountedApplication.dispose()

    const disposedFixture = createRuntimeFixture()
    const disposedApplication = composeStudioApplication({
      rootComponent: { render: () => null },
      router: createTestRouter(),
      projectRuntime: disposedFixture.runtime,
    })
    disposedApplication.dispose()

    expect(() => disposedApplication.mount(document.createElement('div'))).toThrowError(
      expect.objectContaining({ name: 'StudioApplicationError', code: 'application-disposed' }),
    )
    expect(() => disposedApplication.mount(document.createElement('div'))).toThrow(
      StudioApplicationError,
    )
  })
})
