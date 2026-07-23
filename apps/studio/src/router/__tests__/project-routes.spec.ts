import { parseProjectId } from '@seele-daw/project-core'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { createStudioRouter } from '@/router'
import {
  createProjectCreationLocation,
  createProjectEntryLocation,
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_NAME,
  resolveProjectRouteIntent,
} from '@/router/project-routes'
import { PROJECT_NAVIGATION_INTENT_KIND } from '@/workbench/project/navigation/project-navigation-confirmation'

describe('Project Routes', () => {
  it('maps Entry, Create and Workspace destinations to explicit product intents', () => {
    const router = createStudioRouter(createMemoryHistory())
    const projectId = parseProjectId('project-route-open')

    expect(resolveProjectRouteIntent(router.resolve(createProjectEntryLocation()))).toEqual({
      kind: 'intent',
      intent: { kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT },
    })
    expect(resolveProjectRouteIntent(router.resolve(createProjectCreationLocation()))).toEqual({
      kind: 'intent',
      intent: { kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT },
    })
    expect(
      resolveProjectRouteIntent(router.resolve(createProjectWorkspaceLocation(projectId))),
    ).toEqual({
      kind: 'intent',
      intent: {
        kind: PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT,
        projectId,
      },
    })
  })

  it('rejects an invalid Project ID at the URL boundary', () => {
    const router = createStudioRouter(createMemoryHistory())
    const route = router.resolve({
      name: PROJECT_ROUTE_NAME.WORKSPACE,
      params: { projectId: ' invalid ' },
    })

    expect(resolveProjectRouteIntent(route)).toEqual({
      kind: 'invalid-project-id',
      routeValue: ' invalid ',
    })
  })

  it('leaves unrelated Routes unprotected', () => {
    const router = createStudioRouter(createMemoryHistory())
    router.addRoute({
      path: '/about',
      name: 'about',
      component: { render: () => null },
    })

    expect(resolveProjectRouteIntent(router.resolve({ name: 'about' }))).toEqual({
      kind: 'unprotected',
    })
  })
})
