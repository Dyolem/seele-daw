import { createRouter, createWebHistory } from 'vue-router'

import ProjectEntryPage from '@/features/project-entry/ProjectEntryPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'project-entry',
      component: ProjectEntryPage,
    },
  ],
})

export default router
