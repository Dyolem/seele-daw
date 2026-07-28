<script setup lang="ts">
import {
  PROJECT_PPQ,
  ZERO_TICK,
  parsePositiveTick,
  parseProjectId,
  type ProjectId,
  type Tick,
} from '@seele-daw/project-core'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import { createProjectPianoRollPresentation } from '@/features/piano-roll/project-piano-roll-presentation'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import { createProjectMidiClipPresentations } from '@/features/project-workspace/project-clip-presentation'
import {
  useProjectWorkbenchSelectionStore,
  type ProjectWorkbenchClipSelectionCandidate,
} from '@/features/project-workspace/project-workbench-selection-store'
import { createProjectTrackPresentations } from '@/features/project-workspace/project-track-presentation'
import { createProjectEntryLocation, PROJECT_ROUTE_QUERY } from '@/router/project-routes'
import UiButton from '@/ui/components/UiButton.vue'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
} from '@/workbench/project/active-project-state'
import {
  STUDIO_KEYBOARD_ACTION,
  STUDIO_KEYBOARD_SCOPE,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { useStudioKeyboardShortcuts } from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'
import { createProjectClipBarRange } from '@/workbench/project/clip/project-clip-bar-range'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  type FailedProjectEntryResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import { useProjectEntry } from '@/workbench/project/entry/vue/project-entry-context'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

const props = defineProps<{
  readonly projectId: string
}>()

interface ProjectPresentation {
  readonly barSpanTick: Tick
  readonly projectId: ProjectId | null
  readonly projectName: string
  readonly tempo: number
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
}

const { activeProject, state } = useActiveProject()
const { projectEntry } = useProjectEntry()
const { keyboardShortcuts } = useStudioKeyboardShortcuts()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const router = useRouter()
const requestedProjectId = shallowRef<ProjectId | null>(null)
const failure = shallowRef<FailedProjectEntryResolution | null>(null)
const isOpening = shallowRef(false)
const projectPresentation = shallowRef<ProjectPresentation>({
  barSpanTick: parsePositiveTick(PROJECT_PPQ * 4),
  projectId: null,
  projectName: 'Untitled Project',
  tempo: 120,
  timeSignatureDenominator: 4,
  timeSignatureNumerator: 4,
})
let requestGeneration = 0
let isUnmounted = false

const readyProject = computed(() => {
  const activeState = state.value
  return activeState.phase === ACTIVE_PROJECT_PHASE.READY &&
    activeState.projectId === requestedProjectId.value
    ? activeState
    : null
})
const projectSnapshot = computed(() => readyProject.value?.session.getSnapshot() ?? null)
const trackPresentations = computed(() => {
  const snapshot = projectSnapshot.value
  return snapshot === null ? Object.freeze([]) : createProjectTrackPresentations(snapshot)
})
const clipPresentations = computed(() => {
  const snapshot = projectSnapshot.value
  return snapshot === null ? Object.freeze([]) : createProjectMidiClipPresentations(snapshot)
})
const pianoRollPresentation = computed(() => {
  const snapshot = projectSnapshot.value
  const selectedClipId = workbenchSelection.selectedClipId
  return snapshot === null || selectedClipId === null
    ? null
    : createProjectPianoRollPresentation(snapshot, selectedClipId)
})
const clipSelectionCandidates = computed(
  (): readonly ProjectWorkbenchClipSelectionCandidate[] => {
    return Object.freeze(
      clipPresentations.value.map((clip) =>
        Object.freeze({ clipId: clip.id, trackId: clip.trackId }),
      ),
    )
  },
)

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

async function saveProject(): Promise<void> {
  try {
    await activeProject.save()
  } catch {
    // ActiveProjectService publishes the failed save state consumed by the Workbench.
  }
}

function canSaveProject(): boolean {
  const ready = readyProject.value
  return (
    ready !== null &&
    ready.isDirty &&
    ready.saveStatus !== ACTIVE_PROJECT_SAVE_STATUS.SAVING
  )
}

function undoProject(): boolean {
  const ready = readyProject.value
  if (ready === null || !ready.session.canUndo) return false
  return ready.session.undo() !== null
}

function redoProject(): boolean {
  const ready = readyProject.value
  if (ready === null || !ready.session.canRedo) return false
  return ready.session.redo() !== null
}

function describeSaveFailure(saveFailure: unknown): string | null {
  if (saveFailure instanceof Error && saveFailure.message.trim().length > 0) {
    return saveFailure.message
  }
  return saveFailure === null ? null : 'The project could not be saved.'
}

const disposeKeyboardShortcuts = keyboardShortcuts.register([
  {
    actionId: STUDIO_KEYBOARD_ACTION.PROJECT_SAVE,
    bindings: keyboardShortcuts.bindingsFor(
      STUDIO_KEYBOARD_ACTION.PROJECT_SAVE,
    ),
    description: 'Save the active local project.',
    isEnabled: canSaveProject,
    label: 'Save project',
    run: () => {
      if (!canSaveProject()) return false
      void saveProject()
      return true
    },
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
  },
  {
    actionId: STUDIO_KEYBOARD_ACTION.HISTORY_UNDO,
    bindings: keyboardShortcuts.bindingsFor(
      STUDIO_KEYBOARD_ACTION.HISTORY_UNDO,
    ),
    description: 'Undo the latest committed project edit.',
    isEnabled: () => readyProject.value?.session.canUndo === true,
    label: 'Undo',
    run: undoProject,
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
  },
  {
    actionId: STUDIO_KEYBOARD_ACTION.HISTORY_REDO,
    bindings: keyboardShortcuts.bindingsFor(
      STUDIO_KEYBOARD_ACTION.HISTORY_REDO,
    ),
    description: 'Redo the latest undone project edit.',
    isEnabled: () => readyProject.value?.session.canRedo === true,
    label: 'Redo',
    run: redoProject,
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
  },
])

watch(
  () => props.projectId,
  (projectId) => void openRequestedProject(projectId),
  { immediate: true },
)

watch(
  () => readyProject.value?.projectId ?? null,
  (projectId) => {
    const ready = readyProject.value
    if (projectId === null || ready === null) {
      projectPresentation.value = {
        barSpanTick: parsePositiveTick(PROJECT_PPQ * 4),
        projectId: null,
        projectName: 'Untitled Project',
        tempo: 120,
        timeSignatureDenominator: 4,
        timeSignatureNumerator: 4,
      }
      return
    }

    const snapshot = ready.session.getSnapshot()
    const tempo = snapshot.tempoEvents[0]
    const timeSignature = snapshot.timeSignatureEvents[0]
    projectPresentation.value = {
      barSpanTick: createProjectClipBarRange(snapshot, ZERO_TICK).spanTick,
      projectId,
      projectName: snapshot.project.name,
      tempo: tempo?.bpm ?? 120,
      timeSignatureDenominator: timeSignature?.denominator ?? 4,
      timeSignatureNumerator: timeSignature?.numerator ?? 4,
    }
  },
  { immediate: true },
)

watch(
  [
    () => readyProject.value?.projectId ?? null,
    trackPresentations,
    clipSelectionCandidates,
  ],
  ([projectId, tracks, clips]) => {
    if (projectId === null) return

    workbenchSelection.reconcileProject(
      projectId,
      tracks.map((track) => track.id),
      clips,
    )
  },
  { immediate: true },
)

onUnmounted(() => {
  disposeKeyboardShortcuts()
  isUnmounted = true
  requestGeneration += 1
  const projectId = requestedProjectId.value
  if (projectId !== null) workbenchSelection.leaveProject(projectId)
})
</script>

<template>
  <ProjectWorkbenchShell
    v-if="readyProject"
    :bar-span-tick="projectPresentation.barSpanTick"
    :can-redo="readyProject.session.canRedo"
    :can-undo="readyProject.session.canUndo"
    :clips="clipPresentations"
    :is-dirty="readyProject.isDirty"
    :piano-roll-presentation="pianoRollPresentation"
    :project-id="readyProject.projectId"
    :project-name="projectPresentation.projectName"
    :project-session="readyProject.session"
    :save-failure-message="describeSaveFailure(readyProject.saveFailure)"
    :save-status="readyProject.saveStatus"
    :tempo="projectPresentation.tempo"
    :time-signature-denominator="projectPresentation.timeSignatureDenominator"
    :time-signature-numerator="projectPresentation.timeSignatureNumerator"
    :tracks="trackPresentations"
    @leave-project="router.push(createProjectEntryLocation())"
    @redo="redoProject"
    @save="saveProject"
    @undo="undoProject"
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
