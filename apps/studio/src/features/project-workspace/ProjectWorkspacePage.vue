<script setup lang="ts">
import { parseProjectId, parseTick, type ProjectId } from '@seele-daw/project-core'
import { computed, onBeforeUnmount, onUnmounted, shallowRef, watch } from 'vue'
import { isNavigationFailure, useRouter } from 'vue-router'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import { presentProjectWorkbenchActions } from '@/features/project-workspace/actions/project-workbench-action-controls'
import { useProjectWorkbenchMidiImport } from '@/features/project-workspace/actions/use-project-workbench-midi-import'
import type { ProjectWorkbenchWorkspaceHandle } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import { provideTempoEditing } from '@/features/project-workspace/tempo-track/tempo-editing'
import { useProjectWorkbenchSelectionStore } from '@/workbench/project/project-workbench-selection-store'
import {
  createProjectEntryLocation,
  PROJECT_ROUTE_QUERY,
} from '@/workbench/project/navigation/project-routes'
import UiButton from '@/ui/components/UiButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import { WORKBENCH_CONTEXT } from '@/features/project-workspace/actions/project-workbench-actions'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  type FailedProjectEntryResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import { useStudio } from '@/workbench/studio-services'

const props = defineProps<{
  readonly projectId: string
}>()

const studio = useStudio()
const { activeProject, state } = studio.project
const { projectEntry } = studio
const { actions, contexts, keyboard } = useStudioActions()
const {
  projectPlayback,
  state: playbackState,
  visualPosition: playbackVisualPosition,
} = studio.playback
const workbenchSelection = useProjectWorkbenchSelectionStore()
const toasts = useUiToastStore()
const router = useRouter()
const requestedProjectId = shallowRef<ProjectId | null>(null)
const failure = shallowRef<FailedProjectEntryResolution | null>(null)
const isOpening = shallowRef(false)
const workbenchShell = shallowRef<ProjectWorkbenchWorkspaceHandle | null>(null)
const isShowingProjects = shallowRef(false)
let requestGeneration = 0
let isUnmounted = false

const readyProject = computed(() => {
  const activeState = state.value
  return activeState.phase === ACTIVE_PROJECT_PHASE.READY &&
    activeState.projectId === requestedProjectId.value
    ? activeState
    : null
})
provideTempoEditing(readyProject)
const midiImport = useProjectWorkbenchMidiImport({
  getRouteProjectId: () => props.projectId,
  getReadyProject: () => readyProject.value,
  // Continuous visual position becomes an authored integer tick, without musical grid snapping.
  getPlacementTick: () => parseTick(Math.round(playbackVisualPosition.value.positionTick)),
})
const midiFileInput = midiImport.input
const playbackCanReturnToLastStartPosition = computed(() => {
  // These projections make the Coordinator-owned capability reactive without duplicating its
  // Return Anchor in component state.
  void playbackState.value
  void playbackVisualPosition.value
  return projectPlayback.canReturnToLastStartPosition()
})

function describeFailure(resolution: FailedProjectEntryResolution): string {
  const cause = resolution.failureCause
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return 'The project could not be opened. Please try again.'
}

async function openRequestedProject(projectIdInput: string): Promise<void> {
  const generation = ++requestGeneration
  isOpening.value = true
  failure.value = null
  requestedProjectId.value = null

  let projectId: ProjectId
  try {
    projectId = parseProjectId(projectIdInput)
  } catch {
    workbenchSelection.reset()
    if (!isUnmounted && generation === requestGeneration) {
      await router.replace(
        createProjectEntryLocation({
          [PROJECT_ROUTE_QUERY.INVALID_PROJECT_ID]: projectIdInput,
        }),
      )
    }
    return
  }

  requestedProjectId.value = projectId
  workbenchSelection.activateProject(projectId)
  const resolution = await projectEntry.resolve(projectId)
  if (isUnmounted || generation !== requestGeneration) return

  isOpening.value = false
  if (resolution.kind === PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE) return

  if (resolution.kind === PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED) {
    await router.replace(
      createProjectEntryLocation({
        [PROJECT_ROUTE_QUERY.UNAVAILABLE_PROJECT_ID]: projectId,
      }),
    )
    return
  }

  failure.value = resolution
}

function retry(): void {
  void openRequestedProject(props.projectId)
}

async function showProjects(): Promise<StudioActionCompletion> {
  isShowingProjects.value = true
  try {
    const failure = await router.push(createProjectEntryLocation())
    return isNavigationFailure(failure) ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED
  } finally {
    isShowingProjects.value = false
  }
}

let releaseActionTarget: (() => void) | null = null
const stopActionTarget = watch(
  () => readyProject.value?.session ?? null,
  (session) => {
    releaseActionTarget?.()
    releaseActionTarget = null
    if (session === null) return
    releaseActionTarget = contexts.bind(WORKBENCH_CONTEXT, {
      getReadyProject: () => readyProject.value,
      getPlaybackState: () => playbackState.value,
      playback: projectPlayback,
      save: () => activeProject.save(),
      canReturnToLastStartPosition: () => playbackCanReturnToLastStartPosition.value,
      isShowingProjects: () => isShowingProjects.value,
      showProjects,
      getMidiImportPhase: () => midiImport.phase.value,
      canChooseMidiFile: () => midiFileInput.value !== null,
      importMidi: midiImport.request,
      getMidiEditor: () => workbenchShell.value?.getMidiEditor() ?? null,
    })
  },
  { immediate: true, flush: 'sync' },
)
const actionControls = computed(() => {
  // The target's business refs are the reactive source; target slots own only identity.
  void readyProject.value
  return presentProjectWorkbenchActions(actions, keyboard)
})
onBeforeUnmount(() => {
  stopActionTarget()
  releaseActionTarget?.()
  releaseActionTarget = null
})

watch(
  () => {
    const feedback = playbackState.value.feedback
    return feedback === null ? null : `${feedback.kind}:${feedback.message}`
  },
  () => {
    const feedback = playbackState.value.feedback
    if (feedback === null || playbackState.value.phase === PROJECT_PLAYBACK_PHASE.LOADING) return
    switch (feedback.kind) {
      case 'error':
        toasts.danger('Playback unavailable', feedback.message)
        break
      case 'info':
        // Empty-project guidance already lives on the disabled Play control; avoid a launch toast.
        break
      case 'warning':
        toasts.warning('Playback is partial', feedback.message)
        break
    }
  },
)

watch(
  () => props.projectId,
  (projectId) => void openRequestedProject(projectId),
  { immediate: true },
)

onUnmounted(() => {
  if (playbackCanReturnToLastStartPosition.value) {
    projectPlayback.returnToLastStartPosition()
  }
  isUnmounted = true
  requestGeneration += 1
  const projectId = requestedProjectId.value
  if (projectId !== null) workbenchSelection.leaveProject(projectId)
})
</script>

<template>
  <input
    ref="midiFileInput"
    class="project-workspace__midi-file-input"
    type="file"
    accept=".mid,.midi,audio/midi,audio/x-midi"
    tabindex="-1"
    aria-hidden="true"
    @change="midiImport.importSelection"
    @cancel="midiImport.cancelSelection"
  />

  <ProjectWorkbenchShell
    v-if="readyProject"
    ref="workbenchShell"
    :action-controls="actionControls"
    :ready-project="readyProject"
  />

  <main v-else class="project-route-state" aria-labelledby="project-open-title">
    <div v-if="isOpening" class="project-route-state__spinner" aria-hidden="true"></div>
    <p class="project-route-state__eyebrow">LOCAL PROJECT</p>
    <h1 id="project-open-title">
      {{ failure ? 'Project could not be opened' : 'Opening project…' }}
    </h1>
    <p v-if="failure" class="project-route-state__message" role="alert">
      {{ describeFailure(failure) }}
    </p>
    <p v-else class="project-route-state__message" aria-live="polite">
      Restoring the most recent valid checkpoint.
    </p>
    <div v-if="failure" class="project-route-state__actions">
      <UiButton :busy="isOpening" variant="primary" @click="retry">Retry</UiButton>
      <UiButton variant="secondary" @click="router.push(createProjectEntryLocation())">
        Back to projects
      </UiButton>
    </div>
  </main>
</template>

<style scoped>
.project-workspace__midi-file-input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

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

.project-route-state__eyebrow {
  margin: 0 0 var(--sd-space-3);
  color: var(--sd-color-border-focus);
  font-size: var(--sd-font-size-xs);
  font-weight: 750;
  letter-spacing: 0.18em;
}

.project-route-state h1 {
  margin: 0;
  font-size: clamp(2.25rem, 7vw, 4.25rem);
  letter-spacing: -0.05em;
}

.project-route-state__message {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-md);
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

.project-route-state__message {
  max-width: 34rem;
  margin: var(--sd-space-4) 0 0;
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
