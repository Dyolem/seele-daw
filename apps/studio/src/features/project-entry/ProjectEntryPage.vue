<script setup lang="ts">
import type { ProjectId } from '@seele-daw/project-core'
import AddIcon from '~icons/fluent/add-24-regular'
import ArrowRightIcon from '~icons/fluent/arrow-right-20-regular'
import ErrorCircleIcon from '~icons/fluent/error-circle-20-regular'
import LockClosedIcon from '~icons/fluent/lock-closed-16-regular'
import MidiIcon from '~icons/fluent/midi-24-regular'
import MusicNotesIcon from '~icons/fluent/music-note-2-24-regular'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  createProjectCreationLocation,
  createProjectEntryLocation,
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  type ProjectSelectionRequiredResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import { useProjectEntry } from '@/workbench/project/entry/vue/project-entry-context'
import { reportProjectMidiImportSuccess } from '@/workbench/project/midi-import/project-midi-import-feedback'
import { useProjectMidiImport } from '@/workbench/project/midi-import/vue/project-midi-import-context'
import type { RecentProjectSummary } from '@/workbench/project/project-catalog-reader'

type ProjectEntryAction =
  | { readonly kind: 'create' }
  | { readonly kind: 'import-midi' }
  | { readonly kind: 'open'; readonly projectId: ProjectId }
  | null

const { projectEntry } = useProjectEntry()
const { projectMidiImport } = useProjectMidiImport()
const route = useRoute()
const router = useRouter()
const toasts = useUiToastStore()
const selection = shallowRef<ProjectSelectionRequiredResolution | null>(null)
const failureMessage = shallowRef<string | null>(null)
const failureCanRefresh = shallowRef(false)
const activeAction = shallowRef<ProjectEntryAction>(null)
const midiFileInput = shallowRef<HTMLInputElement | null>(null)
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
const displayedFailureCanRefresh = computed(() =>
  failureMessage.value === null ? routeNotice.value !== null : failureCanRefresh.value,
)
const isBusy = computed(() => isLoadingProjects.value || activeAction.value !== null)

function describeFailure(
  failure: unknown,
  fallback = 'The project could not be opened. Please try again.',
): string {
  const cause =
    typeof failure === 'object' && failure !== null && 'failureCause' in failure
      ? failure.failureCause
      : failure

  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return fallback
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
  failureCanRefresh.value = false

  const resolution = await projectEntry.resolve(null)
  if (isUnmounted || generation !== requestGeneration) return

  isLoadingProjects.value = false
  if (resolution.kind === PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED) {
    selection.value = resolution
    return
  }

  if (resolution.kind === PROJECT_ENTRY_RESOLUTION_KIND.FAILED) {
    failureMessage.value = describeFailure(resolution)
    failureCanRefresh.value = true
  }
}

async function createProject(): Promise<void> {
  if (isBusy.value) return

  const generation = ++requestGeneration
  activeAction.value = Object.freeze({ kind: 'create' })
  failureMessage.value = null
  failureCanRefresh.value = false
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

function requestMidiFile(): void {
  if (isBusy.value) return
  midiFileInput.value?.click()
}

async function importSelectedMidiFile(): Promise<void> {
  const input = midiFileInput.value
  const file = input?.files?.item(0) ?? null
  if (input !== null) input.value = ''
  if (file === null || isBusy.value) return

  const generation = ++requestGeneration
  activeAction.value = Object.freeze({ kind: 'import-midi' })
  failureMessage.value = null
  failureCanRefresh.value = false
  try {
    const result = await projectMidiImport.importLocalFile(file)
    if (isUnmounted || generation !== requestGeneration) return

    reportProjectMidiImportSuccess(toasts, result)
    await router.push(createProjectWorkspaceLocation(result.projectId))
  } catch (failureCause) {
    if (!isUnmounted && generation === requestGeneration) {
      failureMessage.value = describeFailure(
        failureCause,
        'The MIDI file could not be imported. Please try another file.',
      )
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
  failureCanRefresh.value = false
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
    <div class="project-entry__frame">
      <header class="project-entry__masthead">
        <div class="project-entry__brand" aria-label="Seele Studio">
          <span class="project-entry__brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path
                d="M22.5 8.4A9.2 9.2 0 0 0 16 6c-4.1 0-7 2-7 5 0 3.1 3 4.1 7 4.9 4 .8 7 1.8 7 5 0 3.1-3 5.1-7.1 5.1a10.8 10.8 0 0 1-7.4-2.8"
              />
            </svg>
          </span>
          <span class="project-entry__brand-copy">
            <strong>SEELE</strong>
            <span>STUDIO</span>
          </span>
        </div>

        <div class="project-entry__local-status">
          <span aria-hidden="true"></span>
          Local workspace
        </div>
      </header>

      <section class="project-entry__hero" aria-labelledby="project-entry-title">
        <div class="project-entry__copy">
          <p class="project-entry__eyebrow">
            <span aria-hidden="true"></span>
            Piano Black
          </p>
          <h1 id="project-entry-title">Create something worth hearing.</h1>
          <p>
            A focused local studio for shaping ideas into music. Start fresh or return to your most
            recent checkpoint.
          </p>
        </div>

        <aside class="project-entry__start" aria-labelledby="new-project-title">
          <div class="project-entry__start-heading">
            <span class="project-entry__start-icon">
              <UiIcon :icon="AddIcon" :size="24" />
            </span>
            <div>
              <p>START A SESSION</p>
              <h2 id="new-project-title">New project</h2>
            </div>
          </div>
          <p class="project-entry__start-copy">
            Create a minimal project and its first recoverable checkpoint.
          </p>
          <div class="project-entry__start-actions">
            <UiButton
              class="project-entry__create"
              variant="primary"
              :busy="activeAction?.kind === 'create'"
              :disabled="isBusy"
              @click="createProject"
            >
              {{ activeAction?.kind === 'create' ? 'Creating project…' : 'Create new project' }}
            </UiButton>
            <UiButton
              class="project-entry__import"
              variant="secondary"
              :busy="activeAction?.kind === 'import-midi'"
              :disabled="isBusy"
              @click="requestMidiFile"
            >
              {{ activeAction?.kind === 'import-midi' ? 'Importing MIDI…' : 'Import MIDI file' }}
            </UiButton>
            <input
              ref="midiFileInput"
              class="project-entry__file-input"
              type="file"
              accept=".mid,.midi,audio/midi,audio/x-midi"
              tabindex="-1"
              aria-hidden="true"
              @change="importSelectedMidiFile"
            />
          </div>
          <p class="project-entry__local-note">
            <UiIcon :icon="LockClosedIcon" :size="16" />
            New and imported projects stay in this browser.
          </p>
        </aside>
      </section>

      <section class="project-entry__projects" aria-labelledby="recent-projects-title">
        <div class="project-entry__section-heading">
          <div>
            <p class="project-entry__eyebrow">
              <span aria-hidden="true"></span>
              Project library
            </p>
            <div class="project-entry__title-line">
              <h2 id="recent-projects-title">Recent projects</h2>
              <span v-if="!isLoadingProjects" class="project-entry__count">
                {{ recentProjects.length }}
              </span>
            </div>
          </div>
          <p>Stored locally · newest checkpoint first</p>
        </div>

        <div v-if="displayedFailureMessage" class="project-entry__error" role="alert">
          <UiIcon class="project-entry__error-icon" :icon="ErrorCircleIcon" :size="20" />
          <span>{{ displayedFailureMessage }}</span>
          <UiButton
            v-if="displayedFailureCanRefresh"
            class="project-entry__retry"
            size="small"
            variant="ghost"
            :disabled="isBusy"
            @click="retryRecentProjects"
          >
            Refresh
          </UiButton>
        </div>

        <div v-if="isLoadingProjects" class="project-entry__loading" aria-live="polite">
          <span class="project-entry__spinner" aria-hidden="true"></span>
          <div>
            <strong>Loading project library</strong>
            <span>Reading local checkpoints…</span>
          </div>
        </div>

        <div v-else-if="recentProjects.length === 0" class="project-entry__empty">
          <span class="project-entry__empty-icon">
            <UiIcon :icon="MusicNotesIcon" :size="24" />
          </span>
          <h3>No projects yet</h3>
          <p>Your saved projects will appear here after their first checkpoint.</p>
        </div>

        <ul v-else class="project-entry__list" aria-label="Recent projects">
          <li v-for="project in recentProjects" :key="project.projectId">
            <button
              class="project-entry__project"
              :class="{
                'project-entry__project--opening':
                  activeAction?.kind === 'open' && activeAction.projectId === project.projectId,
              }"
              type="button"
              :disabled="isBusy"
              :aria-busy="
                activeAction?.kind === 'open' && activeAction.projectId === project.projectId
                  ? true
                  : undefined
              "
              @click="openProject(project)"
            >
              <span class="project-entry__project-art">
                <UiIcon :icon="MidiIcon" :size="24" />
              </span>
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
                <UiIcon :icon="ArrowRightIcon" :size="20" />
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.project-entry {
  min-height: 100vh;
  overflow: hidden;
  padding: clamp(var(--sd-space-6), 5vw, calc(var(--sd-space-10) + var(--sd-space-4)));
  color: var(--sd-color-text-primary);
  background:
    radial-gradient(
      circle at 18% -12%,
      color-mix(in srgb, var(--sd-color-border-focus) 12%, transparent),
      transparent 30rem
    ),
    linear-gradient(
      to bottom,
      var(--sd-color-surface-canvas),
      var(--sd-color-surface-workspace) 48%,
      var(--sd-color-surface-canvas)
    );
}

.project-entry__frame {
  width: min(100%, 72rem);
  margin-inline: auto;
}

.project-entry__masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--sd-space-5);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-entry__brand {
  display: inline-flex;
  gap: var(--sd-space-3);
  align-items: center;
}

.project-entry__brand-mark {
  display: grid;
  inline-size: var(--sd-control-height-md);
  block-size: var(--sd-control-height-md);
  place-items: center;
  border: 1px solid var(--sd-color-border-focus);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-raised);
}

.project-entry__brand-mark svg {
  inline-size: var(--sd-space-5);
  block-size: var(--sd-space-5);
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.project-entry__brand-copy {
  display: grid;
  line-height: var(--sd-line-height-tight);
}

.project-entry__brand-copy strong {
  font-size: var(--sd-font-size-sm);
  letter-spacing: 0.2em;
}

.project-entry__brand-copy span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.16em;
}

.project-entry__local-status {
  display: inline-flex;
  gap: var(--sd-space-2);
  align-items: center;
  min-block-size: var(--sd-control-height-sm);
  padding-inline: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-pill);
  color: var(--sd-color-text-muted);
  background: var(--sd-color-surface-panel);
  font-size: var(--sd-font-size-sm);
}

.project-entry__local-status > span {
  inline-size: var(--sd-space-2);
  block-size: var(--sd-space-2);
  border: 1px solid var(--sd-color-surface-panel);
  border-radius: var(--sd-radius-pill);
  background: var(--sd-color-state-success);
  outline: 1px solid color-mix(in srgb, var(--sd-color-state-success) 54%, transparent);
  outline-offset: 1px;
}

.project-entry__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.75fr);
  gap: clamp(var(--sd-space-8), 7vw, calc(var(--sd-space-10) * 2));
  align-items: center;
  padding-block: clamp(
    calc(var(--sd-space-10) + var(--sd-space-4)),
    9vw,
    calc(var(--sd-space-10) * 3)
  );
}

.project-entry__copy {
  max-inline-size: 44rem;
}

.project-entry__eyebrow {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  margin: 0 0 var(--sd-space-4);
  color: var(--sd-color-border-focus);
  font-size: var(--sd-font-size-xs);
  font-weight: 750;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.project-entry__eyebrow > span {
  inline-size: var(--sd-space-6);
  block-size: 1px;
  background: currentcolor;
}

.project-entry h1,
.project-entry h2,
.project-entry h3,
.project-entry p {
  margin-top: 0;
}

.project-entry__copy h1 {
  max-inline-size: 42rem;
  margin-bottom: var(--sd-space-6);
  font-size: clamp(2.75rem, 6.5vw, 5.5rem);
  font-weight: 720;
  line-height: 0.96;
  letter-spacing: -0.06em;
}

.project-entry__copy > p:last-child {
  max-inline-size: 37rem;
  margin-bottom: 0;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-lg);
  line-height: var(--sd-line-height-relaxed);
}

.project-entry__start {
  position: relative;
  padding: var(--sd-space-6);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-lg);
  background: linear-gradient(
    to bottom,
    var(--sd-color-surface-raised),
    var(--sd-color-surface-panel)
  );
}

.project-entry__start::before {
  position: absolute;
  inset: 0 var(--sd-space-6) auto;
  block-size: 1px;
  background: linear-gradient(to right, transparent, var(--sd-color-border-focus), transparent);
  content: '';
}

.project-entry__start-heading {
  display: flex;
  gap: var(--sd-space-3);
  align-items: center;
}

.project-entry__start-icon {
  display: grid;
  inline-size: calc(var(--sd-control-height-md) + var(--sd-space-1));
  block-size: calc(var(--sd-control-height-md) + var(--sd-space-1));
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-sunken);
}

.project-entry__start-heading p {
  margin-bottom: var(--sd-space-1);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.12em;
}

.project-entry__start-heading h2 {
  margin-bottom: 0;
  font-size: var(--sd-font-size-xl);
  letter-spacing: -0.02em;
}

.project-entry__start-copy {
  margin: var(--sd-space-5) 0;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-md);
  line-height: var(--sd-line-height-relaxed);
}

.project-entry__start-actions {
  display: grid;
  gap: var(--sd-space-2);
}

.project-entry__create,
.project-entry__import {
  inline-size: 100%;
  min-block-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
}

.project-entry__file-input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.project-entry__local-note {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  justify-content: center;
  margin: var(--sd-space-3) 0 0;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-entry__projects {
  overflow: hidden;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-lg);
  background: var(--sd-color-surface-panel);
}

.project-entry__section-heading {
  display: flex;
  gap: var(--sd-space-6);
  align-items: center;
  justify-content: space-between;
  padding: var(--sd-space-5) var(--sd-space-6);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-entry__section-heading .project-entry__eyebrow {
  margin-bottom: var(--sd-space-2);
}

.project-entry__title-line {
  display: flex;
  gap: var(--sd-space-3);
  align-items: center;
}

.project-entry__title-line h2 {
  margin-bottom: 0;
  font-size: var(--sd-font-size-xl);
  letter-spacing: -0.02em;
}

.project-entry__count {
  display: grid;
  min-inline-size: var(--sd-control-height-sm);
  block-size: var(--sd-control-height-sm);
  place-items: center;
  padding-inline: var(--sd-space-2);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-pill);
  color: var(--sd-color-text-muted);
  background: var(--sd-color-surface-sunken);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-entry__section-heading > p {
  margin-bottom: 0;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-sm);
}

.project-entry__error {
  display: flex;
  gap: var(--sd-space-3);
  align-items: center;
  margin: var(--sd-space-4) var(--sd-space-6) 0;
  padding: var(--sd-space-3) var(--sd-space-4);
  border: 1px solid var(--sd-color-state-danger);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-control-danger-text);
  background: color-mix(in srgb, var(--sd-color-control-danger) 72%, var(--sd-color-surface-panel));
  font-size: var(--sd-font-size-sm);
}

.project-entry__error-icon {
  color: var(--sd-color-state-danger);
}

.project-entry__error > span {
  min-inline-size: 0;
}

.project-entry__retry {
  margin-inline-start: auto;
}

.project-entry__loading,
.project-entry__empty {
  display: grid;
  min-block-size: 15rem;
  place-items: center;
  align-content: center;
  color: var(--sd-color-text-muted);
  text-align: center;
}

.project-entry__loading {
  grid-auto-flow: column;
  gap: var(--sd-space-3);
}

.project-entry__loading > div {
  display: grid;
  gap: var(--sd-space-1);
  text-align: start;
}

.project-entry__loading strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-md);
}

.project-entry__loading span:last-child {
  font-size: var(--sd-font-size-sm);
}

.project-entry__spinner {
  inline-size: var(--sd-space-5);
  block-size: var(--sd-space-5);
  border: 2px solid var(--sd-color-border-default);
  border-top-color: var(--sd-color-border-focus);
  border-radius: var(--sd-radius-pill);
  animation: entry-spin var(--sd-motion-duration-slow) linear infinite;
}

.project-entry__empty-icon {
  display: grid;
  inline-size: calc(var(--sd-space-10) + var(--sd-space-4));
  block-size: calc(var(--sd-space-10) + var(--sd-space-4));
  margin-bottom: var(--sd-space-4);
  place-items: center;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-lg);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
}

.project-entry__empty h3 {
  margin-bottom: var(--sd-space-2);
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-lg);
}

.project-entry__empty p {
  max-inline-size: 24rem;
  margin-bottom: 0;
  font-size: var(--sd-font-size-md);
  line-height: var(--sd-line-height-default);
}

.project-entry__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sd-space-3);
  margin: 0;
  padding: var(--sd-space-4);
  list-style: none;
}

.project-entry__project {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--sd-space-3);
  align-items: center;
  inline-size: 100%;
  min-block-size: 5rem;
  padding: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-primary);
  text-align: start;
  background: var(--sd-color-surface-raised);
  cursor: pointer;
  transition:
    color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    border-color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.project-entry__project:hover:not(:disabled) {
  border-color: var(--sd-color-border-strong);
  background: var(--sd-color-surface-overlay);
}

.project-entry__project:active:not(:disabled) {
  background: var(--sd-color-control-secondary-pressed);
}

.project-entry__project:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}

.project-entry__project:disabled {
  cursor: wait;
  opacity: 0.68;
}

.project-entry__project--opening {
  border-color: var(--sd-color-border-strong);
}

.project-entry__project-art {
  display: grid;
  inline-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  block-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  place-items: center;
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
}

.project-entry__project-copy {
  display: grid;
  gap: var(--sd-space-1);
  min-inline-size: 0;
}

.project-entry__project-copy strong {
  overflow: hidden;
  font-size: var(--sd-font-size-md);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-entry__project-copy span {
  overflow: hidden;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-entry__project-action {
  display: inline-flex;
  gap: var(--sd-space-2);
  align-items: center;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
  font-weight: 650;
}

@keyframes entry-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (max-width: 56rem) {
  .project-entry__hero {
    grid-template-columns: 1fr;
    gap: var(--sd-space-8);
  }

  .project-entry__start {
    max-inline-size: 32rem;
  }
}

@media (max-width: 44rem) {
  .project-entry {
    padding: var(--sd-space-5) var(--sd-space-4) var(--sd-space-8);
  }

  .project-entry__hero {
    padding-block: calc(var(--sd-space-10) + var(--sd-space-4));
  }

  .project-entry__copy h1 {
    font-size: clamp(2.5rem, 13vw, 4rem);
  }

  .project-entry__section-heading {
    align-items: flex-start;
    padding: var(--sd-space-4);
  }

  .project-entry__section-heading > p {
    max-inline-size: 10rem;
    text-align: end;
  }

  .project-entry__error {
    align-items: flex-start;
    margin: var(--sd-space-4) var(--sd-space-4) 0;
  }

  .project-entry__list {
    grid-template-columns: 1fr;
  }

  .project-entry__loading,
  .project-entry__empty {
    min-block-size: 13rem;
    padding-inline: var(--sd-space-4);
  }
}

@media (max-width: 28rem) {
  .project-entry__local-status {
    padding-inline: var(--sd-space-2);
    font-size: var(--sd-font-size-xs);
  }

  .project-entry__brand-copy span {
    display: none;
  }

  .project-entry__section-heading {
    display: grid;
  }

  .project-entry__section-heading > p {
    max-inline-size: none;
    text-align: start;
  }

  .project-entry__error {
    flex-wrap: wrap;
  }

  .project-entry__retry {
    inline-size: 100%;
    margin-inline-start: 0;
  }

  .project-entry__project-action {
    font-size: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-entry__spinner {
    animation: none;
    border-color: var(--sd-color-border-focus);
  }
}
</style>
