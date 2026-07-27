import type { ClipId, ProjectId, TrackId } from '@seele-daw/project-core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export interface ProjectWorkbenchClipSelectionCandidate {
  readonly clipId: ClipId
  readonly trackId: TrackId
}

/** Owns lightweight editor selection without copying Project facts into Vue state. */
export const useProjectWorkbenchSelectionStore = defineStore(
  'project-workbench-selection',
  () => {
    const projectId = shallowRef<ProjectId | null>(null)
    const selectedTrackId = shallowRef<TrackId | null>(null)
    const selectedClipId = shallowRef<ClipId | null>(null)

    function activateProject(nextProjectId: ProjectId): void {
      if (projectId.value === nextProjectId) return

      projectId.value = nextProjectId
      selectedTrackId.value = null
      selectedClipId.value = null
    }

    function selectTrack(trackId: TrackId): void {
      if (projectId.value === null) return

      selectedTrackId.value = trackId
      selectedClipId.value = null
    }

    function selectClip(trackId: TrackId, clipId: ClipId): void {
      if (projectId.value === null) return

      selectedTrackId.value = trackId
      selectedClipId.value = clipId
    }

    function clearTrackSelection(): void {
      selectedTrackId.value = null
      selectedClipId.value = null
    }

    function clearClipSelection(): void {
      selectedClipId.value = null
    }

    function reconcileProject(
      nextProjectId: ProjectId,
      availableTrackIds: readonly TrackId[],
      availableClips: readonly ProjectWorkbenchClipSelectionCandidate[] = [],
    ): void {
      activateProject(nextProjectId)

      const selectedClip = selectedClipId.value
      if (selectedClip !== null) {
        const currentClip = availableClips.find((clip) => clip.clipId === selectedClip)

        if (
          currentClip !== undefined &&
          availableTrackIds.includes(currentClip.trackId)
        ) {
          selectedTrackId.value = currentClip.trackId
          return
        }

        selectedClipId.value = null
      }

      const selected = selectedTrackId.value
      if (selected !== null && !availableTrackIds.includes(selected)) {
        selectedTrackId.value = null
      }
    }

    function leaveProject(leavingProjectId: ProjectId): void {
      if (projectId.value !== leavingProjectId) return

      projectId.value = null
      selectedTrackId.value = null
      selectedClipId.value = null
    }

    function reset(): void {
      projectId.value = null
      selectedTrackId.value = null
      selectedClipId.value = null
    }

    return {
      projectId,
      selectedTrackId,
      selectedClipId,
      activateProject,
      selectTrack,
      selectClip,
      clearTrackSelection,
      clearClipSelection,
      reconcileProject,
      leaveProject,
      reset,
    }
  },
)
