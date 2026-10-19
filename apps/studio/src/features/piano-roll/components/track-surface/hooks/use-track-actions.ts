import { computed, shallowRef, type ShallowRef } from 'vue'
import type { ClipId, MidiChannel, ProjectSession } from '@seele-daw/project-core'
import type { PianoRollSustainPedalLaneHandle } from '@/features/piano-roll/types/piano-roll-sustain-pedal'
import type { PianoRollContextMenuTarget } from '@/features/piano-roll/types/piano-roll-context-menu-target'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { STUDIO_ACTION_NOT_APPLIED } from '@/workbench/actions/studio-action'
import {
  useStudioEditorSelectionTarget,
  useStudioInteractionTarget,
} from '@/workbench/actions/vue/studio-editor-action-context'

export function useTrackActions({
  sustainPedalLane,
  getPresentation,
  getSession,
  getSustainPedalChannel,
  suspendTimelineFollow,
}: {
  readonly sustainPedalLane: Readonly<ShallowRef<PianoRollSustainPedalLaneHandle | null>>
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getSession: () => Pick<ProjectSession, 'query' | 'subscribe'>
  readonly getSustainPedalChannel: () => MidiChannel
  readonly suspendTimelineFollow: () => void
}) {
  const workbenchSelection = useProjectWorkbenchSelectionStore()
  const isSustainPedalTarget = shallowRef(false)
  const activeClipId = computed(() => getPresentation().readModel.activeClipId)
  function activateClip(clipId: ClipId): void {
    if (!getPresentation().readModel.clips.some(({ clip }) => clip.clipId === clipId)) {
      return
    }
    acceptPlacedClip(clipId)
  }

  // A successful placement may create a Clip before its new presentation arrives.
  function acceptPlacedClip(clipId: ClipId): void {
    suspendTimelineFollow()
    workbenchSelection.selectClip(getPresentation().trackId, clipId)
  }

  function selectActiveClip(clipId: ClipId | null): void {
    if (clipId === null) workbenchSelection.clearClipSelection()
    else activateClip(clipId)
  }
  function handleFocusIn(): void {
    isSustainPedalTarget.value = sustainPedalLane.value?.isFocused() ?? false
    selectionTarget.activate()
  }

  function prepareContextMenu(event: MouseEvent): PianoRollContextMenuTarget | null {
    const focusElement = sustainPedalLane.value?.prepareContextMenu(event)
    if (!focusElement) return null
    selectionTarget.activate()
    const binding = selectionTarget.binding
    return binding ? { binding, focusElement } : null
  }

  const selectionTarget = useStudioEditorSelectionTarget(
    {
      isFocused: () => sustainPedalLane.value?.isFocused() ?? false,
      hasSelection: () =>
        isSustainPedalTarget.value && (sustainPedalLane.value?.hasSelection() ?? false),
      selectionLabel: () => 'Sustain Pedal events',
      deleteSelection: () =>
        sustainPedalLane.value?.removeSelectedEvents() ?? STUDIO_ACTION_NOT_APPLIED,
      clearSelection: () => sustainPedalLane.value?.clearSelection() ?? STUDIO_ACTION_NOT_APPLIED,
    },
    [
      () => getSession(),
      () => getPresentation().projectId,
      () => getPresentation().trackId,
      () => getPresentation().readModel.activeClipId,
      () =>
        getPresentation().readModel.clips.find(
          ({ clip }) => clip.clipId === getPresentation().readModel.activeClipId,
        )?.clip.sourceId,
      () => getSustainPedalChannel(),
      isSustainPedalTarget,
    ],
  )
  useStudioInteractionTarget({
    isActive: () => sustainPedalLane.value?.hasCancellableInteraction() ?? false,
    cancel: () => sustainPedalLane.value?.cancelInteraction() ?? STUDIO_ACTION_NOT_APPLIED,
  })

  return {
    activeClipId,
    activateClip,
    acceptPlacedClip,
    selectActiveClip,
    handleFocusIn,
    prepareContextMenu,
  }
}
