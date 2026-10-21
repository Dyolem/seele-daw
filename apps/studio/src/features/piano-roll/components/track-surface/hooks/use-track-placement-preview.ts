import { computed, type ShallowRef, type StyleValue } from 'vue'
import {
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  pianoRollMidiPitchToCssPixel,
  pianoRollTimelineTickToCssPixel,
  type PianoRollTimelineViewport,
} from '@seele-daw/editor'
import { parseTick, type Tick } from '@seele-daw/project-core'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import type { TrackPlacementPreview } from '@/features/piano-roll/components/track-surface/types/track-placement'

/** Projects the active or hover preview without owning its lifetime. */
export function useTrackPlacementPreview({
  placementPreview,
  getViewport,
  getPresentation,
  getTimelineEndTick,
  getBarSpanTick,
}: {
  readonly placementPreview: Readonly<ShallowRef<TrackPlacementPreview | null>>
  readonly getViewport: () => PianoRollTimelineViewport | null
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getTimelineEndTick: () => Tick
  readonly getBarSpanTick: () => Tick
}) {
  const previewNoteStyle = computed((): StyleValue | null => {
    const currentViewport = getViewport()
    const preview = placementPreview.value
    if (currentViewport === null || preview === null) return null

    const rowHeight = currentViewport.pitchRowHeightCssPixel
    const inset = Math.min(1, rowHeight / 5)
    const x = pianoRollTimelineTickToCssPixel(currentViewport, preview.placement.projectStartTick)
    const endX = pianoRollTimelineTickToCssPixel(
      currentViewport,
      parseTick(Math.min(currentViewport.visibleEndTick, preview.placement.projectEndTick)),
    )
    return {
      blockSize: `${Math.max(1, rowHeight - inset * 2)}px`,
      inlineSize: `${Math.max(1, endX - x)}px`,
      transform: `translate3d(${x}px, ${
        pianoRollMidiPitchToCssPixel(currentViewport, preview.pitch) + inset
      }px, 0)`,
    }
  })

  const previewClipStyle = computed((): StyleValue | null => {
    const preview = placementPreview.value?.placement
    if (preview === undefined || preview.status !== PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY) {
      return null
    }

    let startTick: Tick
    let endTick: Tick
    if (preview.action === PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP) {
      startTick = preview.clipStartTick
      endTick = parseTick(
        Math.min(getTimelineEndTick(), preview.clipStartTick + preview.clipSpanTick),
      )
    } else if (preview.action === PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP) {
      const target = getPresentation().readModel.clips.find(
        ({ clip }) => clip.clipId === preview.clipId,
      )
      if (target === undefined) return null
      startTick = target.clip.endTick
      endTick = parseTick(Math.min(getTimelineEndTick(), preview.projectEndTick))
    } else {
      return null
    }

    return {
      inlineSize: `${((endTick - startTick) / getTimelineEndTick()) * 100}%`,
      insetInlineStart: `${(startTick / getTimelineEndTick()) * 100}%`,
    }
  })

  const previewMessage = computed(() => {
    const placement = placementPreview.value?.placement
    if (placement === undefined) return null
    if (placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED) {
      return placement.message
    }
    switch (placement.action) {
      case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP:
        return 'Add note to the Active Clip'
      case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP:
        return `Create a Clip at bar ${Math.floor(placement.clipStartTick / getBarSpanTick()) + 1}`
      case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP:
        return 'Extend the Clip and add the note in one edit'
    }
    return null
  })

  return { previewNoteStyle, previewClipStyle, previewMessage }
}
