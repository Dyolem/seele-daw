import type { Tick } from '@seele-daw/project-core'
import { computed, onBeforeUnmount, watch } from 'vue'

import { ARRANGEMENT_BAR_CONTEXT } from '@/features/project-workspace/actions/arrangement-keyboard-actions'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import {
  PROJECT_ADD_TRACK_TYPE,
  type ProjectAddTrackType,
} from '@/features/project-workspace/workbench-shell/project-add-track-option'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import { useStudio } from '@/workbench/studio-services'

const UNAVAILABLE_TRACK_LABELS: Readonly<
  Record<Exclude<ProjectAddTrackType, 'instrument'>, string>
> = Object.freeze({
  [PROJECT_ADD_TRACK_TYPE.AUDIO]: 'Voice / audio',
  [PROJECT_ADD_TRACK_TYPE.BASS]: 'Bass',
  [PROJECT_ADD_TRACK_TYPE.DRUM_MACHINE]: 'Drum machine',
  [PROJECT_ADD_TRACK_TYPE.GUITAR]: 'Guitar',
  [PROJECT_ADD_TRACK_TYPE.SAMPLER]: 'Sampler',
})

function describe(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim().length > 0 ? cause.message : fallback
}

export interface ArrangementEditsLayout {
  readonly projectId: string
  readonly timelineEndTick: Tick
  readonly tracks: readonly ProjectTrackPresentation[]
}

/** Track and clip edits made from the arrangement, and the selection they leave behind. */
export function useArrangementEdits(
  layout: ArrangementEditsLayout,
  view: { suspendFollow(): void; openClip(): void },
) {
  const { clips: clipEdits, tracks: trackEdits } = useStudio().edits
  const { actions, contexts, keyboard } = useStudioActions()
  const selection = useProjectWorkbenchSelectionStore()
  const toasts = useUiToastStore()
  let releaseBarTarget: (() => void) | null = null

  function createEmptyClip(track: ProjectTrackPresentation, tick: Tick): StudioActionCompletion {
    try {
      const result = clipEdits.addEmpty({ targetTick: tick, trackId: track.id })
      selection.selectClip(result.trackId, result.clipId)
      view.suspendFollow()
      view.openClip()
      return STUDIO_ACTION_COMPLETED
    } catch (cause) {
      toasts.danger(
        'MIDI clip could not be added',
        describe(cause, 'The Project rejected the Clip command. Please try again.'),
      )
      return { status: 'failed', cause, reported: true }
    }
  }

  /** A focused bar is the target of Create MIDI clip. */
  function bindBarTarget(track: ProjectTrackPresentation, tick: Tick, event: Event): void {
    const element = event.currentTarget
    if (!(element instanceof HTMLElement)) return
    releaseBarTarget?.()
    releaseBarTarget = contexts.bind(ARRANGEMENT_BAR_CONTEXT, {
      isFocused: () => element === document.activeElement && element.isConnected,
      execute: () => {
        const current = layout.tracks.find(({ id }) => id === track.id)
        return current && tick < layout.timelineEndTick
          ? createEmptyClip(current, tick)
          : STUDIO_ACTION_NOT_APPLIED
      },
    })
  }

  watch(
    () => layout.projectId,
    () => {
      releaseBarTarget?.()
      releaseBarTarget = null
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => releaseBarTarget?.())

  return {
    bindBarTarget,
    createClipFromBar(track: ProjectTrackPresentation, tick: Tick, event: MouseEvent): void {
      bindBarTarget(track, tick, event)
      actions.invoke('arrangement.clip.create', 'toolbar')
    },
    createClipHint: computed(() => {
      const bindings = keyboard.displayBindingsFor('arrangement.clip.create').join(' / ')
      return `Double-click${bindings ? ` or press ${bindings}` : ''} to create a MIDI clip`
    }),
    addTrack(trackType: ProjectAddTrackType): void {
      if (trackType !== PROJECT_ADD_TRACK_TYPE.INSTRUMENT) {
        toasts.info(
          `${UNAVAILABLE_TRACK_LABELS[trackType]} is in development`,
          'This track type will become available in a later product slice.',
        )
        return
      }
      try {
        selection.selectTrack(trackEdits.addInstrumentTrack().trackId)
      } catch (cause) {
        toasts.danger(
          'Instrument track could not be added',
          describe(cause, 'The Project rejected the Track command. Please try again.'),
        )
      }
    },
    selectTrack(track: ProjectTrackPresentation): void {
      view.suspendFollow()
      selection.selectTrack(track.id)
    },
    selectClip(clip: ProjectMidiClipPresentation): void {
      view.suspendFollow()
      selection.selectClip(clip.trackId, clip.id)
    },
  }
}
