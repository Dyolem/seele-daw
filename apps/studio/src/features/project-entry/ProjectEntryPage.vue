<script setup lang="ts">
import type { ProjectId } from '@seele-daw/project-core'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  createProjectCreationLocation,
  createProjectEntryLocation,
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  type ProjectSelectionRequiredResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import { useProjectEntry } from '@/workbench/project/entry/vue/project-entry-context'
import type { RecentProjectSummary } from '@/workbench/project/project-catalog-reader'

type ProjectEntryAction =
  | { readonly kind: 'create' }
  | { readonly kind: 'open'; readonly projectId: ProjectId }
  | null

const { projectEntry } = useProjectEntry()
const route = useRoute()
const router = useRouter()
const selection = shallowRef<ProjectSelectionRequiredResolution | null>(null)
const failureMessage = shallowRef<string | null>(null)
const activeAction = shallowRef<ProjectEntryAction>(null)
const isLoadingProjects = shallowRef(true)
let requestGeneration = 0
let isUnmounted = false

const unavailableProjectId = computed(() => {
  const value = route.query[PROJECT_ROUTE_QUERY.UNAVAILABLE_PROJECT_ID]
  return typeof value === 'string' ? value : null
})
const routeNotice = computed(() => {
  const invalidProjectId = route.query[PROJECT_ROUTE_QUERY.INVALID_PROJECT_ID]
  if (typeof invalidProjectId === 'string') {
    return 'That project address is invalid.'
  }
  if (unavailableProjectId.value !== null) {
    return 'That project is no longer available.'
  }
  return null
})
const recentProjects = computed(
  () =>
    selection.value?.recentProjects.filter(
      ({ projectId }) => projectId !== unavailableProjectId.value,
    ) ?? [],
)
const displayedFailureMessage = computed(() => failureMessage.value ?? routeNotice.value)
const isBusy = computed(() => isLoadingProjects.value || activeAction.value !== null)

function describeFailure(failure: unknown): string {
  const cause =
    typeof failure === 'object' && failure !== null && 'failureCause' in failure
      ? failure.failureCause
      : failure

  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return 'The project could not be opened. Please try again.'
}

function formatLastSaved(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

async function loadRecentProjects(): Promise<void> {
  const generation = ++requestGeneration
  isLoadingProjects.value = true
  failureMessage.value = null

  const resolution = await projectEntry.resolve(null)
  if (isUnmounted || generation !== requestGeneration) return

  isLoadingProjects.value = false
  if (resolution.kind === PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED) {
    selection.value = resolution
    return
  }

  if (resolution.kind === PROJECT_ENTRY_RESOLUTION_KIND.FAILED) {
    failureMessage.value = describeFailure(resolution)
  }
}

async function createProject(): Promise<void> {
  if (isBusy.value) return

  const generation = ++requestGeneration
  activeAction.value = Object.freeze({ kind: 'create' })
  failureMessage.value = null
  try {
    await router.push(createProjectCreationLocation())
  } catch (failureCause) {
    if (!isUnmounted && generation === requestGeneration) {
      failureMessage.value = describeFailure(failureCause)
    }
  } finally {
    if (!isUnmounted && generation === requestGeneration) activeAction.value = null
  }
}

async function openProject(project: RecentProjectSummary): Promise<void> {
  if (isBusy.value) return

  const generation = ++requestGeneration
  activeAction.value = Object.freeze({ kind: 'open', projectId: project.projectId })
  failureMessage.value = null
  try {
    await router.push(createProjectWorkspaceLocation(project.projectId))
  } catch (failureCause) {
    if (!isUnmounted && generation === requestGeneration) {
      failureMessage.value = describeFailure(failureCause)
    }
  } finally {
    if (!isUnmounted && generation === requestGeneration) activeAction.value = null
  }
}

async function retryRecentProjects(): Promise<void> {
  if (routeNotice.value !== null) {
    await router.replace(createProjectEntryLocation())
  }
  await loadRecentProjects()
}

onMounted(() => void loadRecentProjects())
onUnmounted(() => {
  isUnmounted = true
  requestGeneration += 1
})
</script>

<template>
  <main class="project-entry">
    <section class="project-entry__intro" aria-labelledby="project-entry-title">
      <div class="project-entry__brand" aria-label="Seele DAW">
        <span class="project-entry__brand-mark" aria-hidden="true">S</span>
        <span>SEELE</span>
      </div>

      <div class="project-entry__copy">
        <p class="project-entry__eyebrow">YOUR MUSIC STARTS HERE</p>
        <h1 id="project-entry-title">Create something worth hearing.</h1>
        <p>Start a new project or continue from your most recent local checkpoint.</p>
      </div>

      <button class="project-entry__create" type="button" :disabled="isBusy" @click="createProject">
        <span aria-hidden="true">+</span>
        {{ activeAction?.kind === 'create' ? 'Creating project…' : 'New project' }}
      </button>
    </section>

    <section class="project-entry__projects" aria-labelledby="recent-projects-title">
      <div class="project-entry__section-heading">
        <div>
          <p class="project-entry__eyebrow">LOCAL PROJECTS</p>
          <h2 id="recent-projects-title">Recent projects</h2>
        </div>
        <button
          v-if="displayedFailureMessage"
          class="project-entry__retry"
          type="button"
          :disabled="isBusy"
          @click="retryRecentProjects"
        >
          Refresh
        </button>
      </div>

      <p v-if="displayedFailureMessage" class="project-entry__error" role="alert">
        {{ displayedFailureMessage }}
      </p>

      <div v-if="isLoadingProjects" class="project-entry__loading" aria-live="polite">
        <span class="project-entry__spinner" aria-hidden="true"></span>
        Loading recent projects…
      </div>

      <div v-else-if="recentProjects.length === 0" class="project-entry__empty">
        <div class="project-entry__empty-icon" aria-hidden="true">♪</div>
        <h3>No projects yet</h3>
        <p>Your saved projects will appear here.</p>
      </div>

      <ul v-else class="project-entry__list" aria-label="Recent projects">
        <li v-for="project in recentProjects" :key="project.projectId">
          <button
            class="project-entry__project"
            type="button"
            :disabled="isBusy"
            @click="openProject(project)"
          >
            <span class="project-entry__project-art" aria-hidden="true">♪</span>
            <span class="project-entry__project-copy">
              <strong>{{ project.name }}</strong>
              <span>Saved {{ formatLastSaved(project.lastCheckpointSavedAt) }}</span>
            </span>
            <span class="project-entry__project-action">
              {{
                activeAction?.kind === 'open' && activeAction.projectId === project.projectId
                  ? 'Opening…'
                  : 'Open'
              }}
              <span aria-hidden="true">→</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.project-entry {
  --entry-bg: #0b0b0d;
  --entry-panel: #141418;
  --entry-panel-strong: #1a1a20;
  --entry-border: #2a2a31;
  --entry-muted: #9898a2;
  --entry-accent: #c8ff45;
  min-height: 100vh;
  padding: clamp(32px, 6vw, 84px);
  color: #f5f5f7;
  background:
    radial-gradient(circle at 14% 12%, rgb(200 255 69 / 9%), transparent 24rem), var(--entry-bg);
}

.project-entry__intro,
.project-entry__projects {
  width: min(100%, 1040px);
  margin-inline: auto;
}

.project-entry__intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 36px 48px;
  align-items: end;
  padding-bottom: clamp(48px, 8vw, 88px);
  border-bottom: 1px solid var(--entry-border);
}

.project-entry__brand {
  grid-column: 1 / -1;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  width: fit-content;
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0.22em;
}

.project-entry__brand-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: #0b0b0d;
  background: var(--entry-accent);
  border-radius: 9px;
  font-size: 15px;
  letter-spacing: 0;
}

.project-entry__copy {
  max-width: 680px;
}

.project-entry__eyebrow {
  margin: 0 0 12px;
  color: var(--entry-accent);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.project-entry h1,
.project-entry h2,
.project-entry h3,
.project-entry p {
  margin-top: 0;
}

.project-entry h1 {
  max-width: 620px;
  margin-bottom: 18px;
  font-size: clamp(42px, 7vw, 76px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.project-entry__copy > p:last-child {
  max-width: 540px;
  margin-bottom: 0;
  color: var(--entry-muted);
  font-size: 16px;
  line-height: 1.65;
}

.project-entry button {
  font: inherit;
}

.project-entry__create {
  display: inline-flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  min-width: 172px;
  padding: 15px 20px;
  border: 1px solid var(--entry-accent);
  border-radius: 12px;
  color: #101105;
  background: var(--entry-accent);
  font-weight: 720;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}

.project-entry__create:hover:not(:disabled) {
  box-shadow: 0 12px 38px rgb(200 255 69 / 18%);
  transform: translateY(-2px);
}

.project-entry__create > span {
  font-size: 22px;
  font-weight: 400;
  line-height: 0;
}

.project-entry button:focus-visible {
  outline: 3px solid rgb(200 255 69 / 35%);
  outline-offset: 3px;
}

.project-entry button:disabled {
  cursor: wait;
  opacity: 0.58;
}

.project-entry__projects {
  padding-top: 38px;
}

.project-entry__section-heading {
  display: flex;
  gap: 24px;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 22px;
}

.project-entry h2 {
  margin-bottom: 0;
  font-size: 28px;
  letter-spacing: -0.025em;
}

.project-entry__retry {
  padding: 8px 12px;
  border: 0;
  color: var(--entry-accent);
  background: transparent;
  cursor: pointer;
}

.project-entry__error {
  padding: 12px 14px;
  border: 1px solid #63363b;
  border-radius: 10px;
  color: #ffc4c8;
  background: #26171a;
  font-size: 14px;
}

.project-entry__loading,
.project-entry__empty {
  display: grid;
  min-height: 240px;
  place-items: center;
  align-content: center;
  border: 1px dashed var(--entry-border);
  border-radius: 18px;
  color: var(--entry-muted);
  background: rgb(255 255 255 / 1.5%);
}

.project-entry__loading {
  grid-auto-flow: column;
  gap: 12px;
}

.project-entry__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgb(255 255 255 / 18%);
  border-top-color: var(--entry-accent);
  border-radius: 50%;
  animation: entry-spin 700ms linear infinite;
}

.project-entry__empty-icon,
.project-entry__project-art {
  display: grid;
  place-items: center;
  color: var(--entry-accent);
  background: linear-gradient(145deg, #2d3320, #181b13);
}

.project-entry__empty-icon {
  width: 54px;
  height: 54px;
  margin-bottom: 18px;
  border-radius: 16px;
  font-size: 23px;
}

.project-entry__empty h3 {
  margin-bottom: 6px;
  color: #f5f5f7;
  font-size: 17px;
}

.project-entry__empty p {
  margin-bottom: 0;
  font-size: 14px;
}

.project-entry__list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-entry__project {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  width: 100%;
  padding: 13px 16px;
  border: 1px solid var(--entry-border);
  border-radius: 14px;
  color: inherit;
  text-align: left;
  background: var(--entry-panel);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.project-entry__project:hover:not(:disabled) {
  border-color: #44444d;
  background: var(--entry-panel-strong);
  transform: translateX(3px);
}

.project-entry__project-art {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  font-size: 18px;
}

.project-entry__project-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.project-entry__project-copy strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-entry__project-copy span {
  color: var(--entry-muted);
  font-size: 12px;
}

.project-entry__project-action {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: var(--entry-muted);
  font-size: 13px;
}

@keyframes entry-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 680px) {
  .project-entry {
    padding: 28px 20px 48px;
  }

  .project-entry__intro {
    grid-template-columns: 1fr;
  }

  .project-entry__create {
    width: 100%;
  }

  .project-entry__project-action {
    font-size: 0;
  }

  .project-entry__project-action span {
    font-size: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-entry *,
  .project-entry *::before,
  .project-entry *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
