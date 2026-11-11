import {
  PROJECT_PPQ,
  ZERO_TICK,
  parsePositiveTick,
  parseTick,
  type ProjectId,
  type Tick,
} from '@seele-daw/project-core'
import {
  AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
  deriveAudibleMidiTimelineRange,
} from '@seele-daw/playback'
import { computed, shallowRef, watch, type Ref } from 'vue'

import {
  createProjectPianoRollPresentation,
  createProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/presentation/project-piano-roll-presentation'
import { createProjectMidiClipPresentations } from '@/features/project-workspace/project-clip-presentation'
import { createProjectTrackPresentations } from '@/features/project-workspace/project-track-presentation'
import { useProjectWorkbenchSelectionStore } from '@/workbench/project/project-workbench-selection-store'
import { resolveInitialBarRange } from '@/workbench/edits/bar-range'
import type { ReadyActiveProjectState } from '@/workbench/project/active-project-state'

const DEFAULT_BAR_SPAN_TICK = parsePositiveTick(PROJECT_PPQ * 4)
const DEFAULT_TIMELINE_END_TICK = parseTick(
  DEFAULT_BAR_SPAN_TICK * AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
)

export interface ProjectPresentation {
  readonly barSpanTick: Tick
  readonly projectId: ProjectId | null
  readonly projectName: string
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
}

const UNTITLED_PROJECT: ProjectPresentation = Object.freeze({
  barSpanTick: DEFAULT_BAR_SPAN_TICK,
  projectId: null,
  projectName: 'Untitled Project',
  timeSignatureDenominator: 4,
  timeSignatureNumerator: 4,
})

/**
 * What the workbench shows of the ready Project, derived from its snapshot, with the workbench
 * selection kept to tracks and clips that still exist.
 */
export function useWorkspacePresentation(
  readyProject: Readonly<Ref<ReadyActiveProjectState | null>>,
) {
  const selection = useProjectWorkbenchSelectionStore()
  const snapshot = computed(() => readyProject.value?.session.getSnapshot() ?? null)

  // Name, bar span and meter are read when a Project opens; editing them is not supported yet.
  const project = shallowRef<ProjectPresentation>(UNTITLED_PROJECT)
  watch(
    () => readyProject.value?.projectId ?? null,
    (projectId) => {
      const current = readyProject.value?.session.getSnapshot()
      if (projectId === null || current === undefined) {
        project.value = UNTITLED_PROJECT
        return
      }
      const timeSignature = current.timeSignatureEvents[0]
      project.value = Object.freeze({
        barSpanTick: resolveInitialBarRange(current, ZERO_TICK).spanTick,
        projectId,
        projectName: current.project.name,
        timeSignatureDenominator: timeSignature?.denominator ?? 4,
        timeSignatureNumerator: timeSignature?.numerator ?? 4,
      })
    },
    { immediate: true },
  )

  const timelineEndTick = computed(() =>
    snapshot.value === null
      ? DEFAULT_TIMELINE_END_TICK
      : deriveAudibleMidiTimelineRange(snapshot.value).timelineEndTick,
  )
  const tracks = computed(() =>
    snapshot.value === null ? Object.freeze([]) : createProjectTrackPresentations(snapshot.value),
  )
  const clips = computed(() =>
    snapshot.value === null
      ? Object.freeze([])
      : createProjectMidiClipPresentations(snapshot.value),
  )
  const pianoRoll = computed(() =>
    snapshot.value === null || selection.selectedClipId === null
      ? null
      : createProjectPianoRollPresentation(snapshot.value, selection.selectedClipId),
  )
  const pianoRollTrack = computed(() =>
    snapshot.value === null || selection.selectedTrackId === null
      ? null
      : createProjectPianoRollTrackPresentation(
          snapshot.value,
          selection.selectedTrackId,
          selection.selectedClipId,
        ),
  )

  watch(
    [() => readyProject.value?.projectId ?? null, tracks, clips],
    ([projectId, currentTracks, currentClips]) => {
      if (projectId === null) return
      selection.reconcileProject(
        projectId,
        currentTracks.map((track) => track.id),
        currentClips.map((clip) => Object.freeze({ clipId: clip.id, trackId: clip.trackId })),
      )
    },
    { immediate: true },
  )

  return { project, timelineEndTick, tracks, clips, pianoRoll, pianoRollTrack }
}
