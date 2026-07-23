import { parseProjectId, type ProjectId } from '@seele-daw/project-core'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { createStudioRouter } from '@/router'
import { installProjectNavigationGuard } from '@/router/project-navigation-guard'
import {
  createProjectCreationLocation,
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_NAME,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import {
  PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION,
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  PROJECT_NAVIGATION_INTENT_KIND,
  PROJECT_NAVIGATION_PROCEED_REASON,
  type ProjectNavigationConfirmationCoordinator,
  type ProjectNavigationConfirmationResult,
  type ProjectNavigationIntent,
} from '@/workbench/project/navigation/project-navigation-confirmation'

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

function createProceedResult(): ProjectNavigationConfirmationResult {
  return Object.freeze({
    kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
    reason: PROJECT_NAVIGATION_PROCEED_REASON.CLEAN,
    activeProjectId: null,
  })
}

function createCancelledResult(projectId: ProjectId): ProjectNavigationConfirmationResult {
  return Object.freeze({
    kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED,
    activeProjectId: projectId,
  })
}

function createConfirmation(
  confirm: (intent: ProjectNavigationIntent) => Promise<ProjectNavigationConfirmationResult>,
): ProjectNavigationConfirmationCoordinator {
  return Object.freeze({ confirm })
}

async function createRouterAtEntry() {
  const router = createStudioRouter(createMemoryHistory())
  await router.push({ name: PROJECT_ROUTE_NAME.ENTRY })
  await router.isReady()
  return router
}

describe('Project Navigation Guard', () => {
  it('allows only proceed results from the Confirmation Coordinator', async () => {
    const router = await createRouterAtEntry()
    const confirm = vi.fn<ProjectNavigationConfirmationCoordinator['confirm']>(async () =>
      createProceedResult(),
    )
    installProjectNavigationGuard(router, createConfirmation(confirm))

    await router.push(createProjectCreationLocation())

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.CREATE)
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('keeps the current Route for cancelled and failed confirmations', async () => {
    const router = await createRouterAtEntry()
    const projectId = parseProjectId('project-navigation-guard-current')
    const confirm = vi
      .fn<ProjectNavigationConfirmationCoordinator['confirm']>()
      .mockResolvedValueOnce(createCancelledResult(projectId))
      .mockResolvedValueOnce(
        Object.freeze({
          kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED,
          operation: PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.SAVE_PROJECT,
          activeProjectId: projectId,
          failureCause: new Error('Checkpoint write failed'),
        }),
      )
    installProjectNavigationGuard(router, createConfirmation(confirm))

    await router.push(createProjectCreationLocation())
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)

    await router.push(createProjectWorkspaceLocation(parseProjectId('project-guard-target')))
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('redirects invalid Project parameters without treating them as an Open intent', async () => {
    const router = await createRouterAtEntry()
    const confirm = vi.fn<ProjectNavigationConfirmationCoordinator['confirm']>(async () =>
      createProceedResult(),
    )
    installProjectNavigationGuard(router, createConfirmation(confirm))

    await router.push({
      name: PROJECT_ROUTE_NAME.WORKSPACE,
      params: { projectId: ' invalid ' },
    })

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)
    expect(router.currentRoute.value.query[PROJECT_ROUTE_QUERY.INVALID_PROJECT_ID]).toBe(
      ' invalid ',
    )
    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT,
    })
  })

  it('prevents a late older confirmation from resuming its Route', async () => {
    const router = await createRouterAtEntry()
    const first = createDeferred<ProjectNavigationConfirmationResult>()
    const second = createDeferred<ProjectNavigationConfirmationResult>()
    const confirm = vi
      .fn<ProjectNavigationConfirmationCoordinator['confirm']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    installProjectNavigationGuard(router, createConfirmation(confirm))
    const firstProjectId = parseProjectId('project-navigation-first')
    const secondProjectId = parseProjectId('project-navigation-second')

    const firstNavigation = router.push(createProjectWorkspaceLocation(firstProjectId))
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    const secondNavigation = router.push(createProjectWorkspaceLocation(secondProjectId))
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2))

    second.resolve(createProceedResult())
    await secondNavigation
    first.resolve(createProceedResult())
    await firstNavigation

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(router.currentRoute.value.params.projectId).toBe(secondProjectId)
  })

  it('invalidates an in-flight confirmation and removes the Guard on dispose', async () => {
    const router = await createRouterAtEntry()
    const pending = createDeferred<ProjectNavigationConfirmationResult>()
    const confirm = vi
      .fn<ProjectNavigationConfirmationCoordinator['confirm']>()
      .mockReturnValueOnce(pending.promise)
    const dispose = installProjectNavigationGuard(router, createConfirmation(confirm))

    const protectedNavigation = router.push(createProjectCreationLocation())
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    dispose()
    dispose()
    pending.resolve(createProceedResult())
    await protectedNavigation

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)

    await router.push(createProjectCreationLocation())
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.CREATE)
    expect(confirm).toHaveBeenCalledOnce()
  })
})
