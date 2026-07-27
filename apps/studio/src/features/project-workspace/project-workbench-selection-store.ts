import type { ProjectId, TrackId } from '@seele-daw/project-core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Owns lightweight editor selection without copying Project facts into Vue state. */
export const useProjectWorkbenchSelectionStore = defineStore(
  'project-workbench-selection',
  () => {
    const projectId = shallowRef<ProjectId | null>(null)
    const selectedTrackId = shallowRef<TrackId | null>(null)

    function activateProject(nextProjectId: ProjectId): void {
      if (projectId.value === nextProjectId) return

      projectId.value = nextProjectId
      selectedTrackId.value = null
    }

    function selectTrack(trackId: TrackId): void {
      if (projectId.value === null) return

      selectedTrackId.value = trackId
    }

    function clearTrackSelection(): void {
      selectedTrackId.value = null
    }

    function reconcileProject(
      nextProjectId: ProjectId,
      availableTrackIds: readonly TrackId[],
    ): void {
      activateProject(nextProjectId)

      const selected = selectedTrackId.value
      if (selected !== null && !availableTrackIds.includes(selected)) {
        selectedTrackId.value = null
      }
    }

    function leaveProject(leavingProjectId: ProjectId): void {
      if (projectId.value !== leavingProjectId) return

      projectId.value = null
      selectedTrackId.value = null
    }

    function reset(): void {
      projectId.value = null
      selectedTrackId.value = null
    }

    return {
      projectId,
      selectedTrackId,
      activateProject,
      selectTrack,
      clearTrackSelection,
      reconcileProject,
      leaveProject,
      reset,
    }
  },
)
