<script setup lang="ts">
import { provide } from 'vue'
import { TEMPO_EVENT_ACTION_CONTEXT_KEY } from '@/features/project-workspace/tempo-track/tempo-event-action-context'
import {
  PROJECT_PPQ,
  ZERO_TICK,
  parseTempoBpm,
  parsePositiveTick,
  parseProjectId,
  parseTick,
  type ProjectId,
  type TempoBpm,
  type TempoEventId,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import {
  AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
  deriveAudibleMidiTimelineRange,
} from '@seele-daw/playback'
import { computed, onBeforeUnmount, onUnmounted, shallowRef, watch } from 'vue'
import { isNavigationFailure, useRouter } from 'vue-router'

import {
  createProjectPianoRollPresentation,
  createProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import { presentProjectWorkbenchActions } from '@/features/project-workspace/actions/project-workbench-action-controls'
import { useProjectWorkbenchMidiImport } from '@/features/project-workspace/actions/use-project-workbench-midi-import'
import type { ProjectWorkbenchWorkspaceHandle } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import { createProjectMidiClipPresentations } from '@/features/project-workspace/project-clip-presentation'
import {
  PROJECT_TEMPO_CONTROL_MODE,
  createProjectTempoControlPresentation,
  formatProjectTempoBpm,
  parseProjectTempoInput,
  type ProjectTempoControlPresentation,
} from '@/features/project-workspace/tempo/tempo-control'
import {
  useProjectWorkbenchSelectionStore,
  type ProjectWorkbenchClipSelectionCandidate,
} from '@/features/project-workspace/project-workbench-selection-store'
import { createProjectTrackPresentations } from '@/features/project-workspace/project-track-presentation'
import { formatProjectTimelineTime } from '@/features/project-workspace/timeline/presentation'
import { createProjectEntryLocation, PROJECT_ROUTE_QUERY } from '@/router/project-routes'
import UiButton from '@/ui/components/UiButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import { useProjectWorkbenchActionTarget } from '@/features/project-workspace/actions/project-workbench-action-context'
import { createProjectClipBarRange } from '@/workbench/project/clip/project-clip-bar-range'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  type FailedProjectEntryResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import { useProjectEntry } from '@/workbench/project/entry/vue/project-entry-context'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'
import { useProjectTempoEvents } from '@/workbench/project/tempo-event/vue/project-tempo-event-context'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

const props = defineProps<{
  readonly projectId: string
}>()

const DEFAULT_BAR_SPAN_TICK = parsePositiveTick(PROJECT_PPQ * 4)
const DEFAULT_TIMELINE_END_TICK = parseTick(
  DEFAULT_BAR_SPAN_TICK * AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
)
const ZERO_VISUAL_POSITION_TICK = 0 as ProjectPlaybackVisualPosition['positionTick']

interface ProjectPresentation {
  readonly barSpanTick: Tick
  readonly projectId: ProjectId | null
  readonly projectName: string
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
}

const DEFAULT_TEMPO_CONTROL_PRESENTATION = Object.freeze<ProjectTempoControlPresentation>({
  bpm: parseTempoBpm(120),
  displayBpm: '120',
  mode: PROJECT_TEMPO_CONTROL_MODE.SINGLE,
})

const { activeProject, state } = useActiveProject()
const { projectEntry } = useProjectEntry()
const { projectTempoEvents } = useProjectTempoEvents()
const { actions, keyboard } = useStudioActions()
const workbenchActionTarget = useProjectWorkbenchActionTarget()
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
const workbenchShell = shallowRef<ProjectWorkbenchWorkspaceHandle | null>(null)
const isShowingProjects = shallowRef(false)
const selectedTempoEventId = shallowRef<TempoEventId | null>(null)
const projectPresentation = shallowRef<ProjectPresentation>({
  barSpanTick: DEFAULT_BAR_SPAN_TICK,
  projectId: null,
  projectName: 'Untitled Project',
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
const midiImport = useProjectWorkbenchMidiImport({
  getRouteProjectId: () => props.projectId,
  getReadyProject: () => readyProject.value,
  // Continuous visual position becomes an authored integer tick, without musical grid snapping.
  getPlacementTick: () => parseTick(Math.round(playbackVisualPosition.value.positionTick)),
})
const midiFileInput = midiImport.input
const projectSnapshot = computed(() => readyProject.value?.session.getSnapshot() ?? null)
const tempoEvents = computed((): readonly TempoEventRecord[] => {
  return projectSnapshot.value?.tempoEvents ?? Object.freeze([])
})
const tempoControlPresentation = computed(() => {
  const snapshot = projectSnapshot.value
  if (snapshot === null) return DEFAULT_TEMPO_CONTROL_PRESENTATION
  const visualPosition = playbackVisualPosition.value
  return createProjectTempoControlPresentation(
    snapshot.tempoEvents,
    visualPosition.projectId === snapshot.project.id
      ? visualPosition.positionTick
      : ZERO_VISUAL_POSITION_TICK,
  )
})
const tempoEditable = computed(
  () =>
    tempoControlPresentation.value.mode === PROJECT_TEMPO_CONTROL_MODE.SINGLE &&
    playbackState.value.phase !== PROJECT_PLAYBACK_PHASE.LOADING,
)
const tempoEditingDisabled = computed(
  () => playbackState.value.phase === PROJECT_PLAYBACK_PHASE.LOADING,
)
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
  formatProjectTimelineTime(playbackVisualPosition.value.positionProjectSecond),
)
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

function beginTempoEdit(): void {
  if (playbackState.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING) {
    projectPlayback.pause()
  }
}

function describeTempoEditFailure(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return 'The Project tempo could not be changed.'
}

function ensureTempoPlaybackIsInactive(): boolean {
  if (playbackState.value.phase === PROJECT_PLAYBACK_PHASE.LOADING) return false
  if (playbackState.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING) return true

  projectPlayback.pause()
  return playbackState.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING
}

function replaceSingleTempoBpm(bpm: TempoBpm): void {
  const ready = readyProject.value
  if (ready === null) return
  const tempoEvents = ready.session.getSnapshot().tempoEvents
  if (tempoEvents.length !== 1) {
    toasts.info(
      'Tempo Map is read-only',
      'Use the dedicated Tempo Track to edit individual Tempo Events.',
    )
    return
  }

  const tempoEvent = tempoEvents[0]
  if (
    tempoEvent === undefined ||
    formatProjectTempoBpm(tempoEvent.bpm) === formatProjectTempoBpm(bpm)
  ) {
    return
  }

  projectTempoEvents.replaceTempoEventBpm({ bpm, tempoEventId: tempoEvent.id })
}

function commitTempoInput(input: string): void {
  const parsed = parseProjectTempoInput(input)
  if (parsed.status === 'rejected') {
    toasts.warning('Tempo was not changed', parsed.message)
    return
  }
  if (formatProjectTempoBpm(parsed.bpm) === tempoControlPresentation.value.displayBpm) return
  if (!ensureTempoPlaybackIsInactive()) {
    toasts.danger('Tempo could not be changed', 'Playback could not be paused safely.')
    return
  }

  try {
    replaceSingleTempoBpm(parsed.bpm)
  } catch (cause) {
    toasts.danger('Tempo could not be changed', describeTempoEditFailure(cause))
  }
}

function selectTempoEvent(tempoEventId: TempoEventId): void {
  if (tempoEvents.value.some(({ id }) => id === tempoEventId)) {
    selectedTempoEventId.value = tempoEventId
  }
}

function prepareTempoEventCommand(failureTitle: string): boolean {
  if (ensureTempoPlaybackIsInactive()) return true
  toasts.danger(failureTitle, 'Playback could not be paused safely.')
  return false
}

function addTempoEvent(bpm: TempoBpm, tick: Tick): void {
  const failureTitle = 'Tempo Event could not be added'
  if (!prepareTempoEventCommand(failureTitle)) return
  try {
    const result = projectTempoEvents.addTempoEvent({ bpm, tick })
    selectedTempoEventId.value = result.tempoEventId
  } catch (cause) {
    toasts.danger(failureTitle, describeTempoEditFailure(cause))
  }
}

function moveTempoEvent(tempoEventId: TempoEventId, tick: Tick): void {
  const failureTitle = 'Tempo Event could not be moved'
  if (!prepareTempoEventCommand(failureTitle)) return
  try {
    projectTempoEvents.moveTempoEvent({ tempoEventId, tick })
  } catch (cause) {
    toasts.danger(failureTitle, describeTempoEditFailure(cause))
  }
}

function replaceTempoEventBpm(tempoEventId: TempoEventId, bpm: TempoBpm): void {
  const tempoEvent = tempoEvents.value.find(({ id }) => id === tempoEventId)
  if (tempoEvent === undefined || tempoEvent.bpm === bpm) return
  const failureTitle = 'Tempo Event BPM could not be changed'
  if (!prepareTempoEventCommand(failureTitle)) return
  try {
    projectTempoEvents.replaceTempoEventBpm({ bpm, tempoEventId })
  } catch (cause) {
    toasts.danger(failureTitle, describeTempoEditFailure(cause))
  }
}

function commitTempoEventInput(tempoEventId: TempoEventId, input: string): void {
  const parsed = parseProjectTempoInput(input)
  if (parsed.status === 'rejected') {
    toasts.warning('Tempo Event was not changed', parsed.message)
    return
  }
  const tempoEvent = tempoEvents.value.find(({ id }) => id === tempoEventId)
  if (
    tempoEvent === undefined ||
    formatProjectTempoBpm(tempoEvent.bpm) === formatProjectTempoBpm(parsed.bpm)
  ) {
    return
  }
  replaceTempoEventBpm(tempoEventId, parsed.bpm)
}

provide(TEMPO_EVENT_ACTION_CONTEXT_KEY, { removeTempoEvent })

function removeTempoEvent(tempoEventId: TempoEventId): StudioActionCompletion {
  const failureTitle = 'Tempo Event could not be removed'
  if (!prepareTempoEventCommand(failureTitle)) return STUDIO_ACTION_NOT_APPLIED
  try {
    projectTempoEvents.removeTempoEvent(tempoEventId)
    if (selectedTempoEventId.value === tempoEventId) selectedTempoEventId.value = null
    return STUDIO_ACTION_COMPLETED
  } catch (cause) {
    toasts.danger(failureTitle, describeTempoEditFailure(cause))
    return { status: 'failed', cause, reported: true }
  }
}

function describeSaveFailure(saveFailure: unknown): string | null {
  if (saveFailure instanceof Error && saveFailure.message.trim().length > 0) {
    return saveFailure.message
  }
  return saveFailure === null ? null : 'The project could not be saved.'
}

let releaseActionTarget: (() => void) | null = null
const stopActionTarget = watch(
  () => readyProject.value?.session ?? null,
  (session) => {
    releaseActionTarget?.()
    releaseActionTarget = null
    if (session === null) return
    releaseActionTarget = workbenchActionTarget.bind({
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

watch(
  () => readyProject.value?.projectId ?? null,
  (projectId) => {
    const ready = readyProject.value
    if (projectId === null || ready === null) {
      projectPresentation.value = {
        barSpanTick: DEFAULT_BAR_SPAN_TICK,
        projectId: null,
        projectName: 'Untitled Project',
        timeSignatureDenominator: 4,
        timeSignatureNumerator: 4,
      }
      return
    }

    const snapshot = ready.session.getSnapshot()
    const timeSignature = snapshot.timeSignatureEvents[0]
    projectPresentation.value = {
      barSpanTick: createProjectClipBarRange(snapshot, ZERO_TICK).spanTick,
      projectId,
      projectName: snapshot.project.name,
      timeSignatureDenominator: timeSignature?.denominator ?? 4,
      timeSignatureNumerator: timeSignature?.numerator ?? 4,
    }
  },
  { immediate: true },
)

watch(
  () => readyProject.value?.projectId ?? null,
  () => {
    selectedTempoEventId.value = null
  },
)

watch(tempoEvents, (events) => {
  const selectedId = selectedTempoEventId.value
  if (selectedId !== null && !events.some(({ id }) => id === selectedId)) {
    selectedTempoEventId.value = null
  }
})

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
    :bar-span-tick="projectPresentation.barSpanTick"
    :clips="clipPresentations"
    :is-dirty="readyProject.isDirty"
    :piano-roll-presentation="pianoRollPresentation"
    :piano-roll-track-presentation="pianoRollTrackPresentation"
    :playback-feedback="playbackState.feedback?.message ?? null"
    :playback-time="playbackTime"
    :project-id="readyProject.projectId"
    :project-name="projectPresentation.projectName"
    :project-session="readyProject.session"
    :save-failure-message="describeSaveFailure(readyProject.saveFailure)"
    :save-status="readyProject.saveStatus"
    :selected-tempo-event-id="selectedTempoEventId"
    :tempo-display-bpm="tempoControlPresentation.displayBpm"
    :tempo-editing-disabled="tempoEditingDisabled"
    :tempo-editable="tempoEditable"
    :tempo-events="tempoEvents"
    :tempo-mode="tempoControlPresentation.mode"
    :time-signature-denominator="projectPresentation.timeSignatureDenominator"
    :time-signature-numerator="projectPresentation.timeSignatureNumerator"
    :timeline-end-tick="timelineEndTick"
    :tracks="trackPresentations"
    @invoke-action="actions.invoke"
    @tempo-commit="commitTempoInput"
    @tempo-edit-start="beginTempoEdit"
    @tempo-event-add="addTempoEvent"
    @tempo-event-bpm-change="replaceTempoEventBpm"
    @tempo-event-bpm-commit="commitTempoEventInput"
    @tempo-event-move="moveTempoEvent"
    @tempo-event-remove="removeTempoEvent"
    @tempo-event-select="selectTempoEvent"
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
