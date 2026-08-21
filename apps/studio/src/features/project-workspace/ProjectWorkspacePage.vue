<script setup lang="ts">
import {
  PROJECT_PPQ,
  ZERO_TICK,
  parsePositiveTick,
  parseProjectId,
  parseTick,
  type ProjectId,
  type Tick,
} from '@seele-daw/project-core'
import {
  AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
  deriveAudibleMidiTimelineRange,
} from '@seele-daw/playback'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
  createProjectPianoRollPresentation,
  createProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import { createProjectMidiClipPresentations } from '@/features/project-workspace/project-clip-presentation'
import {
  useProjectWorkbenchSelectionStore,
  type ProjectWorkbenchClipSelectionCandidate,
} from '@/features/project-workspace/project-workbench-selection-store'
import { createProjectTrackPresentations } from '@/features/project-workspace/project-track-presentation'
import {
  createProjectEntryLocation,
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import UiButton from '@/ui/components/UiButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
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
import {
  reportProjectMidiImportSuccess,
  reportProjectMidiTrackImportSuccess,
} from '@/workbench/project/midi-import/project-midi-import-feedback'
import { useProjectMidiImport } from '@/workbench/project/midi-import/vue/project-midi-import-context'
import { useProjectNavigationDecision } from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

const props = defineProps<{
  readonly projectId: string
}>()

const DEFAULT_BAR_SPAN_TICK = parsePositiveTick(PROJECT_PPQ * 4)
const DEFAULT_TIMELINE_END_TICK = parseTick(
  DEFAULT_BAR_SPAN_TICK * AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
)

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
const { projectMidiImport } = useProjectMidiImport()
const projectNavigationDecision = useProjectNavigationDecision()
const { keyboardShortcuts } = useStudioKeyboardShortcuts()
const {
  projectPlayback,
  state: playbackState,
  visualPosition: playbackVisualPosition,
} = useProjectPlayback()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const toasts = useUiToastStore()
const router = useRouter()
const requestedProjectId = shallowRef<ProjectId | null>(null)
const failure = shallowRef<FailedProjectEntryResolution | null>(null)
const isOpening = shallowRef(false)
const isImportingMidi = shallowRef(false)
const midiFileInput = shallowRef<HTMLInputElement | null>(null)
interface PendingMidiImport {
  readonly placementTick: Tick | null
  readonly target: 'new-project' | 'new-tracks'
}
const pendingMidiImport = shallowRef<PendingMidiImport | null>(null)
const projectPresentation = shallowRef<ProjectPresentation>({
  barSpanTick: DEFAULT_BAR_SPAN_TICK,
  projectId: null,
  projectName: 'Untitled Project',
  tempo: 120,
  timeSignatureDenominator: 4,
  timeSignatureNumerator: 4,
})
let requestGeneration = 0
let midiImportGeneration = 0
let isUnmounted = false

const readyProject = computed(() => {
  const activeState = state.value
  return activeState.phase === ACTIVE_PROJECT_PHASE.READY &&
    activeState.projectId === requestedProjectId.value
    ? activeState
    : null
})
const projectSnapshot = computed(() => readyProject.value?.session.getSnapshot() ?? null)
const timelineEndTick = computed(() => {
  const snapshot = projectSnapshot.value
  return snapshot === null
    ? DEFAULT_TIMELINE_END_TICK
    : deriveAudibleMidiTimelineRange(snapshot).timelineEndTick
})
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
const pianoRollTrackPresentation = computed(() => {
  const snapshot = projectSnapshot.value
  const selectedTrackId = workbenchSelection.selectedTrackId
  return snapshot === null || selectedTrackId === null
    ? null
    : createProjectPianoRollTrackPresentation(
        snapshot,
        selectedTrackId,
        workbenchSelection.selectedClipId,
      )
})
const clipSelectionCandidates = computed((): readonly ProjectWorkbenchClipSelectionCandidate[] => {
  return Object.freeze(
    clipPresentations.value.map((clip) =>
      Object.freeze({ clipId: clip.id, trackId: clip.trackId }),
    ),
  )
})

const playbackTime = computed(() =>
  formatPlaybackTime(playbackVisualPosition.value.positionProjectSecond),
)
const playbackCanReturnToLastStartPosition = computed(() => {
  // These projections make the Coordinator-owned capability reactive without duplicating its
  // Return Anchor in component state.
  void playbackState.value
  void playbackVisualPosition.value
  return projectPlayback.canReturnToLastStartPosition()
})
const playbackCanToggle = computed(
  () =>
    playbackState.value.phase !== PROJECT_PLAYBACK_PHASE.LOADING &&
    (playbackState.value.planStatus === 'partial' || playbackState.value.planStatus === 'playable'),
)

function formatPlaybackTime(projectSecond: number): string {
  const safeMillisecond = Math.max(0, Math.floor(projectSecond * 1_000))
  const minute = Math.floor(safeMillisecond / 60_000)
  const second = Math.floor((safeMillisecond % 60_000) / 1_000)
  const millisecond = safeMillisecond % 1_000
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}`
}

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

function describeMidiImportFailure(failureCause: unknown): string {
  if (failureCause instanceof Error && failureCause.message.trim().length > 0) {
    return failureCause.message
  }
  return 'The MIDI file could not be imported. Please try another file.'
}

function requestMidiFile(target: 'new-project' | 'new-tracks'): void {
  if (readyProject.value === null || isImportingMidi.value) return
  const input = midiFileInput.value
  if (input === null) return
  pendingMidiImport.value = Object.freeze({
    // The visual playhead is continuous, while authored Project facts use integer ticks. This
    // nearest-tick conversion is representation normalization, not musical grid snapping.
    placementTick:
      target === 'new-tracks'
        ? parseTick(Math.round(playbackVisualPosition.value.positionTick))
        : null,
    target,
  })
  input.click()
}

async function importSelectedMidiFile(): Promise<void> {
  const input = midiFileInput.value
  const file = input?.files?.item(0) ?? null
  const request = pendingMidiImport.value
  pendingMidiImport.value = null
  if (input !== null) input.value = ''
  if (file === null || request === null || readyProject.value === null || isImportingMidi.value) {
    return
  }

  const generation = ++midiImportGeneration
  isImportingMidi.value = true
  try {
    if (request.target === 'new-project') {
      const result = await projectMidiImport.importLocalFileReplacingActiveProject(file)
      if (isUnmounted || generation !== midiImportGeneration || result === null) return

      reportProjectMidiImportSuccess(toasts, result)
      await router.push(createProjectWorkspaceLocation(result.projectId))
    } else {
      if (request.placementTick === null) return
      const result = await projectMidiImport.importLocalFileAsNewTracks(file, request.placementTick)
      if (isUnmounted || generation !== midiImportGeneration) return

      const firstTrackId = result.importedTrackIds[0]
      if (firstTrackId !== undefined) workbenchSelection.selectTrack(firstTrackId)
      reportProjectMidiTrackImportSuccess(toasts, result)
    }
  } catch (failureCause) {
    if (!isUnmounted && generation === midiImportGeneration) {
      toasts.danger('MIDI could not be imported', describeMidiImportFailure(failureCause))
    }
  } finally {
    if (!isUnmounted && generation === midiImportGeneration) isImportingMidi.value = false
  }
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
  return ready !== null && ready.isDirty && ready.saveStatus !== ACTIVE_PROJECT_SAVE_STATUS.SAVING
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
    actionId: STUDIO_KEYBOARD_ACTION.PLAYBACK_TOGGLE,
    bindings: keyboardShortcuts.bindingsFor(STUDIO_KEYBOARD_ACTION.PLAYBACK_TOGGLE),
    description: 'Play or pause the active Project.',
    isEnabled: () =>
      playbackCanToggle.value && projectNavigationDecision.pendingDecision.value === null,
    label: 'Play or pause',
    run: () => projectPlayback.togglePlayPause(),
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
  },
  {
    actionId: STUDIO_KEYBOARD_ACTION.PROJECT_SAVE,
    bindings: keyboardShortcuts.bindingsFor(STUDIO_KEYBOARD_ACTION.PROJECT_SAVE),
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
    bindings: keyboardShortcuts.bindingsFor(STUDIO_KEYBOARD_ACTION.HISTORY_UNDO),
    description: 'Undo the latest committed project edit.',
    isEnabled: () => readyProject.value?.session.canUndo === true,
    label: 'Undo',
    run: undoProject,
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
  },
  {
    actionId: STUDIO_KEYBOARD_ACTION.HISTORY_REDO,
    bindings: keyboardShortcuts.bindingsFor(STUDIO_KEYBOARD_ACTION.HISTORY_REDO),
    description: 'Redo the latest undone project edit.',
    isEnabled: () => readyProject.value?.session.canRedo === true,
    label: 'Redo',
    run: redoProject,
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
  },
])

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

watch(
  () => readyProject.value?.projectId ?? null,
  (projectId) => {
    const ready = readyProject.value
    if (projectId === null || ready === null) {
      projectPresentation.value = {
        barSpanTick: DEFAULT_BAR_SPAN_TICK,
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
  [() => readyProject.value?.projectId ?? null, trackPresentations, clipSelectionCandidates],
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
  if (playbackCanReturnToLastStartPosition.value) {
    projectPlayback.returnToLastStartPosition()
  }
  disposeKeyboardShortcuts()
  isUnmounted = true
  requestGeneration += 1
  midiImportGeneration += 1
  pendingMidiImport.value = null
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
    @change="importSelectedMidiFile"
  />

  <ProjectWorkbenchShell
    v-if="readyProject"
    :bar-span-tick="projectPresentation.barSpanTick"
    :can-redo="readyProject.session.canRedo"
    :can-undo="readyProject.session.canUndo"
    :clips="clipPresentations"
    :is-dirty="readyProject.isDirty"
    :is-midi-importing="isImportingMidi"
    :piano-roll-presentation="pianoRollPresentation"
    :piano-roll-track-presentation="pianoRollTrackPresentation"
    :playback-can-toggle="playbackCanToggle"
    :playback-can-return-to-last-start-position="playbackCanReturnToLastStartPosition"
    :playback-feedback="playbackState.feedback?.message ?? null"
    :playback-phase="playbackState.phase"
    :playback-time="playbackTime"
    :project-id="readyProject.projectId"
    :project-name="projectPresentation.projectName"
    :project-session="readyProject.session"
    :save-failure-message="describeSaveFailure(readyProject.saveFailure)"
    :save-status="readyProject.saveStatus"
    :tempo="projectPresentation.tempo"
    :time-signature-denominator="projectPresentation.timeSignatureDenominator"
    :time-signature-numerator="projectPresentation.timeSignatureNumerator"
    :timeline-end-tick="timelineEndTick"
    :tracks="trackPresentations"
    @import-midi-as-new-project="requestMidiFile('new-project')"
    @import-midi-as-new-tracks="requestMidiFile('new-tracks')"
    @leave-project="router.push(createProjectEntryLocation())"
    @playback-return-to-last-start-position="projectPlayback.returnToLastStartPosition()"
    @playback-toggle="projectPlayback.togglePlayPause()"
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
