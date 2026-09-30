import { computed, shallowRef, type ShallowRef, type StyleValue } from 'vue'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  TIMELINE_GRID_SNAP_MODE,
  createPianoRollPointerInputAdapter,
  pianoRollCssPixelToMidiPitch,
  pianoRollCssPixelToTimelineTickPosition,
  pianoRollMidiPitchToCssPixel,
  pianoRollTimelineTickToCssPixel,
  resolvePianoRollDomNoteHit,
  resolvePianoRollTrackNotePlacement,
  resolveTimelineGridTick,
  type PianoRollGrid,
  type PianoRollPointerInput,
  type PianoRollPointerInputAdapter,
  type PianoRollTimelineViewport,
  type PianoRollTrackNotePlacement,
} from '@seele-daw/editor'
import {
  parseTick,
  type ClipId,
  type MidiPitch,
  type NoteId,
  type Tick,
} from '@seele-daw/project-core'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import { PIANO_ROLL_TOOL } from '@/features/piano-roll/types/piano-roll-preferences'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { useProjectMidiNotes } from '@/workbench/project/midi-note/vue/project-midi-note-context'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

export function useTrackPlacement({
  canvasHost,
  surfaceElement,
  getViewport,
  getPresentation,
  getTimelineEndTick,
  getBarSpanTick,
  createDisplayGrid,
  activateClip,
  activateNote,
  failureMessage,
}: {
  readonly canvasHost: Readonly<ShallowRef<HTMLElement | null>>
  readonly surfaceElement: Readonly<ShallowRef<HTMLElement | null>>
  readonly getViewport: () => PianoRollTimelineViewport | null
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getTimelineEndTick: () => Tick
  readonly getBarSpanTick: () => Tick
  readonly createDisplayGrid: () => PianoRollGrid
  readonly activateClip: (clipId: ClipId) => void
  readonly activateNote: (noteId: NoteId) => void
  readonly failureMessage: ShallowRef<string | null>
}) {
  interface TrackPlacementPreview {
    readonly pitch: MidiPitch
    readonly placement: PianoRollTrackNotePlacement
  }

  const { projectMidiNotes } = useProjectMidiNotes()
  const pianoRollPreferences = usePianoRollPreferencesStore()
  const toasts = useUiToastStore()
  const placementPreview = shallowRef<TrackPlacementPreview | null>(null)
  let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
  let disposed = false
  const previewNoteStyle = computed((): StyleValue | null => {
    const currentViewport = getViewport()
    const preview = placementPreview.value
    if (currentViewport === null || preview === null) return null

    const rowHeight =
      currentViewport.heightCssPixel /
      (currentViewport.maximumPitch - currentViewport.minimumPitch + 1)
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

  function clampTrackStartTick(candidate: Tick): Tick {
    const lastInteriorTick = parseTick(getTimelineEndTick() - 1)
    if (candidate <= lastInteriorTick) return candidate
    if (!pianoRollPreferences.snapEnabled) return lastInteriorTick
    const subdivision = pianoRollPreferences.subdivisionSpanTick
    return parseTick(Math.floor(lastInteriorTick / subdivision) * subdivision)
  }

  function resolvePlacementAt(xCssPixel: number, yCssPixel: number): TrackPlacementPreview | null {
    const currentViewport = getViewport()
    if (currentViewport === null) return null
    if (
      xCssPixel < 0 ||
      xCssPixel > currentViewport.widthCssPixel ||
      yCssPixel < 0 ||
      yCssPixel >= currentViewport.heightCssPixel
    ) {
      return null
    }

    const projectStartTick = clampTrackStartTick(
      resolveTimelineGridTick({
        grid: createDisplayGrid(),
        snapEnabled: pianoRollPreferences.snapEnabled,
        snapMode: TIMELINE_GRID_SNAP_MODE.FLOOR,
        tickPosition: pianoRollCssPixelToTimelineTickPosition(currentViewport, xCssPixel),
      }),
    )
    return Object.freeze({
      pitch: pianoRollCssPixelToMidiPitch(currentViewport, yCssPixel),
      placement: resolvePianoRollTrackNotePlacement({
        barSpanTick: getBarSpanTick(),
        noteDurationTick: pianoRollPreferences.subdivisionSpanTick,
        projectStartTick,
        readModel: getPresentation().readModel,
      }),
    })
  }

  function localPoint(event: PointerEvent): {
    readonly xCssPixel: number
    readonly yCssPixel: number
  } | null {
    const host = canvasHost.value
    if (host === null) return null
    const bounds = host.getBoundingClientRect()
    return {
      xCssPixel: event.clientX - bounds.left,
      yCssPixel: event.clientY - bounds.top,
    }
  }

  function handleHover(event: PointerEvent): void {
    if (pianoRollPreferences.activeTool !== PIANO_ROLL_TOOL.PENCIL) {
      placementPreview.value = null
      return
    }
    const host = canvasHost.value
    const point = localPoint(event)
    if (host === null || point === null || resolvePianoRollDomNoteHit(event, host) !== null) {
      placementPreview.value = null
      return
    }
    placementPreview.value = resolvePlacementAt(point.xCssPixel, point.yCssPixel)
  }

  function handlePointerInput(input: PianoRollPointerInput): void {
    if (disposed) return
    if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
      surfaceElement.value?.focus({ preventScroll: true })
      return
    }
    if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL) {
      placementPreview.value = null
      return
    }
    if (input.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END || input.hasExceededDragThreshold) {
      return
    }

    if (input.hit !== null) {
      activateNote(input.hit.noteId)
      placementPreview.value = null
      return
    }
    if (pianoRollPreferences.activeTool !== PIANO_ROLL_TOOL.PENCIL) return

    const preview = resolvePlacementAt(
      input.originPosition.xCssPixel,
      input.originPosition.yCssPixel,
    )
    placementPreview.value = preview
    if (preview === null) return
    if (preview.placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED) {
      failureMessage.value = preview.placement.message
      toasts.warning('MIDI note placement needs attention', preview.placement.message)
      return
    }

    try {
      const result = projectMidiNotes.placeMidiNoteOnTrack({
        activeClipId: getPresentation().readModel.activeClipId,
        barSpanTick: getBarSpanTick(),
        baseRevision: getPresentation().readModel.modelRevision,
        noteDurationTick: preview.placement.noteDurationTick,
        pitch: preview.pitch,
        projectStartTick: preview.placement.projectStartTick,
        trackId: getPresentation().trackId,
      })
      activateClip(result.clipId)
      placementPreview.value = null
      failureMessage.value = null
    } catch (cause) {
      const message = describeCause(
        cause,
        'The Project rejected the Track MIDI Note placement. Please try again.',
      )
      failureMessage.value = message
      toasts.danger('MIDI note could not be placed', message)
    }
  }

  function clearPreview(): void {
    placementPreview.value = null
  }
  function invalidate(): void {
    pointerInputAdapter?.cancel()
    clearPreview()
  }

  return {
    placementPreview: computed(() => placementPreview.value),
    previewNoteStyle,
    previewClipStyle,
    previewMessage,
    handleHover,
    clearPreview,
    invalidate,
    mount() {
      const host = canvasHost.value
      if (disposed || host === null || pointerInputAdapter !== null) return
      pointerInputAdapter = createPianoRollPointerInputAdapter({
        observer: {
          onError: ({ cause }) => {
            if (disposed) return
            failureMessage.value = describeCause(
              cause,
              'The Track Piano Roll pointer input failed.',
            )
          },
          onInput: handlePointerInput,
        },
        surface: host,
      })
    },
    dispose() {
      disposed = true
      pointerInputAdapter?.dispose()
      pointerInputAdapter = null
      clearPreview()
    },
  }
}
