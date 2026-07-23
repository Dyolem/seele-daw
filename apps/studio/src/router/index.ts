import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'

import ProjectEntryPage from '@/features/project-entry/ProjectEntryPage.vue'
import ProjectCreationPage from '@/features/project-workspace/ProjectCreationPage.vue'
import ProjectWorkspacePage from '@/features/project-workspace/ProjectWorkspacePage.vue'
import { PROJECT_ROUTE_NAME, PROJECT_ROUTE_NAVIGATION_KIND } from '@/router/project-routes'

export function createStudioRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: PROJECT_ROUTE_NAME.ENTRY,
        component: ProjectEntryPage,
        meta: { projectNavigation: PROJECT_ROUTE_NAVIGATION_KIND.LEAVE },
      },
      {
        path: '/projects/new',
        name: PROJECT_ROUTE_NAME.CREATE,
        component: ProjectCreationPage,
        meta: { projectNavigation: PROJECT_ROUTE_NAVIGATION_KIND.CREATE },
      },
      {
        path: '/projects/:projectId',
        name: PROJECT_ROUTE_NAME.WORKSPACE,
        component: ProjectWorkspacePage,
        props: true,
        meta: { projectNavigation: PROJECT_ROUTE_NAVIGATION_KIND.OPEN },
      },
      {
        path: '/:pathMatch(.*)*',
        redirect: { name: PROJECT_ROUTE_NAME.ENTRY },
      },
    ],
  })
}

const router = createStudioRouter()

export default router
