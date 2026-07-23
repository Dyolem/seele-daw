<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import { createProjectEntryLocation, createProjectWorkspaceLocation } from '@/router/project-routes'
import UiButton from '@/ui/components/UiButton.vue'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

const { activeProject } = useActiveProject()
const router = useRouter()
const failureMessage = shallowRef<string | null>(null)
const isCreating = shallowRef(false)
let requestGeneration = 0
let isUnmounted = false

function describeFailure(failure: unknown): string {
  if (failure instanceof Error && failure.message.trim().length > 0) return failure.message
  return 'The project could not be created. Please try again.'
}

async function createProject(): Promise<void> {
  if (isCreating.value) return

  const generation = ++requestGeneration
  isCreating.value = true
  failureMessage.value = null

  try {
    const projectId = await activeProject.create()
    if (isUnmounted || generation !== requestGeneration) return

    await router.replace(createProjectWorkspaceLocation(projectId))
  } catch (failureCause) {
    if (!isUnmounted && generation === requestGeneration) {
      failureMessage.value = describeFailure(failureCause)
    }
  } finally {
    if (!isUnmounted && generation === requestGeneration) isCreating.value = false
  }
}

onMounted(() => void createProject())
onUnmounted(() => {
  isUnmounted = true
  requestGeneration += 1
})
</script>

<template>
  <main class="project-route-state" aria-labelledby="project-creation-title">
    <div v-if="isCreating" class="project-route-state__spinner" aria-hidden="true"></div>
    <p class="project-route-state__eyebrow">NEW PROJECT</p>
    <h1 id="project-creation-title">
      {{ failureMessage ? 'Project creation failed' : 'Creating your project…' }}
    </h1>
    <p v-if="failureMessage" class="project-route-state__message" role="alert">
      {{ failureMessage }}
    </p>
    <p v-else class="project-route-state__message" aria-live="polite">
      Preparing the first local checkpoint.
    </p>
    <div v-if="failureMessage" class="project-route-state__actions">
      <UiButton :busy="isCreating" variant="primary" @click="createProject">Retry</UiButton>
      <UiButton variant="secondary" @click="router.push(createProjectEntryLocation())">
        Back to projects
      </UiButton>
    </div>
  </main>
</template>

<style scoped>
.project-route-state {
  display: grid;
  min-height: 100vh;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-8);
  color: var(--sd-color-text-primary);
  text-align: center;
  background: var(--sd-color-surface-workspace);
}

.project-route-state__spinner {
  width: 2rem;
  height: 2rem;
  margin-bottom: var(--sd-space-5);
  border: 2px solid var(--sd-color-border-default);
  border-top-color: var(--sd-color-border-focus);
  border-radius: 50%;
  animation: project-route-spin 700ms linear infinite;
}

.project-route-state__eyebrow {
  margin: 0 0 var(--sd-space-3);
  color: var(--sd-color-border-focus);
  font-size: var(--sd-font-size-xs);
  font-weight: 750;
  letter-spacing: 0.18em;
}

.project-route-state h1 {
  margin: 0;
  font-size: clamp(2rem, 6vw, 3.5rem);
  letter-spacing: -0.045em;
}

.project-route-state__message {
  max-width: 34rem;
  margin: var(--sd-space-4) 0 0;
  color: var(--sd-color-text-secondary);
  line-height: var(--sd-line-height-default);
}

.project-route-state__actions {
  display: flex;
  gap: var(--sd-space-3);
  margin-top: var(--sd-space-6);
}

@keyframes project-route-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-route-state__spinner {
    animation-duration: 1.4s;
  }
}
</style>
