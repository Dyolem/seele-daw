import { parseProjectId, type ProjectId } from '@seele-daw/project-core'
import type { LocationQueryRaw, RouteLocationRaw, RouteMeta, RouteParamsGeneric } from 'vue-router'

import {
  PROJECT_NAVIGATION_INTENT_KIND,
  type ProjectNavigationIntent,
} from '@/workbench/project/navigation/project-navigation-confirmation'

export const PROJECT_ROUTE_NAME = {
  CREATE: 'project-create',
  ENTRY: 'project-entry',
  WORKSPACE: 'project-workspace',
} as const

export const PROJECT_ROUTE_NAVIGATION_KIND = {
  CREATE: 'create-project',
  LEAVE: 'leave-project',
  OPEN: 'open-project',
} as const

export const PROJECT_ROUTE_QUERY = {
  INVALID_PROJECT_ID: 'invalidProjectId',
  UNAVAILABLE_PROJECT_ID: 'unavailableProjectId',
} as const

export type ProjectRouteNavigationKind =
  (typeof PROJECT_ROUTE_NAVIGATION_KIND)[keyof typeof PROJECT_ROUTE_NAVIGATION_KIND]

export interface ProjectRouteIntent {
  readonly kind: 'intent'
  readonly intent: ProjectNavigationIntent
}

export interface InvalidProjectRouteIntent {
  readonly kind: 'invalid-project-id'
  readonly routeValue: unknown
}

export interface UnprotectedProjectRouteIntent {
  readonly kind: 'unprotected'
}

export type ProjectRouteIntentResolution =
  | ProjectRouteIntent
  | InvalidProjectRouteIntent
  | UnprotectedProjectRouteIntent

interface ProjectIntentRoute {
  readonly meta: RouteMeta
  readonly params: RouteParamsGeneric
}

declare module 'vue-router' {
  interface RouteMeta {
    readonly projectNavigation?: ProjectRouteNavigationKind
  }
}

function createIntentResolution(intent: ProjectNavigationIntent): ProjectRouteIntent {
  return Object.freeze({ kind: 'intent', intent })
}

function projectNavigationKind(meta: RouteMeta): ProjectRouteNavigationKind | null {
  const navigationKind = meta.projectNavigation
  return Object.values(PROJECT_ROUTE_NAVIGATION_KIND).some(
    (supportedKind) => supportedKind === navigationKind,
  )
    ? (navigationKind ?? null)
    : null
}

/** Interprets a destination Route without reading or mutating Active Project state. */
export function resolveProjectRouteIntent(route: ProjectIntentRoute): ProjectRouteIntentResolution {
  const navigationKind = projectNavigationKind(route.meta)

  switch (navigationKind) {
    case PROJECT_ROUTE_NAVIGATION_KIND.CREATE:
      return createIntentResolution(
        Object.freeze({ kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT }),
      )
    case PROJECT_ROUTE_NAVIGATION_KIND.LEAVE:
      return createIntentResolution(
        Object.freeze({ kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT }),
      )
    case PROJECT_ROUTE_NAVIGATION_KIND.OPEN: {
      const routeValue = route.params.projectId
      try {
        return createIntentResolution(
          Object.freeze({
            kind: PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT,
            projectId: parseProjectId(routeValue),
          }),
        )
      } catch {
        return Object.freeze({ kind: 'invalid-project-id', routeValue })
      }
    }
    default:
      return Object.freeze({ kind: 'unprotected' })
  }
}

export function createProjectEntryLocation(query: LocationQueryRaw = {}): RouteLocationRaw {
  return {
    name: PROJECT_ROUTE_NAME.ENTRY,
    query,
  }
}

export function createProjectCreationLocation(): RouteLocationRaw {
  return { name: PROJECT_ROUTE_NAME.CREATE }
}

export function createProjectWorkspaceLocation(projectId: ProjectId): RouteLocationRaw {
  return {
    name: PROJECT_ROUTE_NAME.WORKSPACE,
    params: { projectId },
  }
}

export function describeInvalidProjectRouteValue(routeValue: unknown): string {
  if (typeof routeValue === 'string') return routeValue
  if (Array.isArray(routeValue)) return routeValue.join('/')
  return ''
}
