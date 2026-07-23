<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'

import ProjectNavigationDecisionDialog from '@/features/project-navigation/ProjectNavigationDecisionDialog.vue'
import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

const { state } = useActiveProject()
const readyProject = computed(() =>
  state.value.phase === ACTIVE_PROJECT_PHASE.READY ? state.value : null,
)
</script>

<template>
  <section v-if="readyProject" class="project-ready" aria-labelledby="project-ready-title">
    <div class="project-ready__mark" aria-hidden="true">✓</div>
    <p>PROJECT READY</p>
    <h1 id="project-ready-title">Project ready</h1>
    <code>{{ readyProject.projectId }}</code>
    <span>The editor interface will be designed in the next UI phase.</span>
  </section>
  <RouterView v-else />
  <ProjectNavigationDecisionDialog />
</template>

<style scoped>
.project-ready {
  display: grid;
  min-height: 100vh;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-8);
  color: var(--sd-color-text-primary);
  text-align: center;
  background: var(--sd-color-surface-workspace);
}

.project-ready__mark {
  display: grid;
  width: 3.625rem;
  height: 3.625rem;
  margin-bottom: var(--sd-space-5);
  place-items: center;
  border: 1px solid var(--sd-color-border-focus);
  border-radius: var(--sd-radius-lg);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-raised);
  font-size: 1.5625rem;
  font-weight: 800;
}

.project-ready p {
  margin: 0 0 var(--sd-space-3);
  color: var(--sd-color-border-focus);
  font-size: var(--sd-font-size-xs);
  font-weight: 750;
  letter-spacing: 0.18em;
}

.project-ready h1 {
  margin: 0 0 var(--sd-space-2);
  font-size: clamp(2.25rem, 7vw, 4.25rem);
  letter-spacing: -0.05em;
}

.project-ready code {
  margin-bottom: var(--sd-space-6);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-sm);
}

.project-ready span {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-md);
}
</style>
