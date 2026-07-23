import type { Router } from 'vue-router'

import {
  createProjectEntryLocation,
  describeInvalidProjectRouteValue,
  PROJECT_ROUTE_QUERY,
  resolveProjectRouteIntent,
} from '@/router/project-routes'
import {
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'

export type ProjectNavigationGuardDispose = () => void

/**
 * Installs the application-wide unsaved-content guard.
 *
 * The generation belongs to Router navigation ordering. Content-position concurrency remains
 * owned by ProjectNavigationConfirmationCoordinator.
 */
export function installProjectNavigationGuard(
  router: Router,
  confirmation: ProjectNavigationConfirmationCoordinator,
): ProjectNavigationGuardDispose {
  let navigationGeneration = 0
  let disposed = false

  const removeGuard = router.beforeEach(async (to) => {
    const generation = ++navigationGeneration
    const resolution = resolveProjectRouteIntent(to)

    if (resolution.kind === 'unprotected') return true

    if (resolution.kind === 'invalid-project-id') {
      return createProjectEntryLocation({
        [PROJECT_ROUTE_QUERY.INVALID_PROJECT_ID]: describeInvalidProjectRouteValue(
          resolution.routeValue,
        ),
      })
    }

    const confirmationResult = await confirmation.confirm(resolution.intent)
    if (disposed || generation !== navigationGeneration) return false

    return confirmationResult.kind === PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED
  })

  return () => {
    if (disposed) return

    disposed = true
    navigationGeneration += 1
    removeGuard()
  }
}
