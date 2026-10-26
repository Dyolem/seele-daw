import { useTrackPlacementPreview } from './use-track-placement-preview'
import { createTrackPlacementSession } from '@/features/piano-roll/components/track-surface/interaction/track-placement-session'
import { resolveTrackPlacement } from '@/features/piano-roll/components/track-surface/interaction/track-placement-operation'
import type {
  TrackPlacementConfiguration,
  TrackPlacementIntent,
  TrackPlacementPreview,
} from '@/features/piano-roll/components/track-surface/types/track-placement'
import { useStudioInteractionTarget } from '@/workbench/actions/vue/studio-editor-action-context'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
} from '@/workbench/actions/studio-action'
import { computed, shallowRef, watch, type ShallowRef } from 'vue'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  completeGesture,
  createEditorPointerInputAdapter,
  resolvePianoRollDomNoteHit,
  type EditorPointerInputAdapter,
  type PianoRollGrid,
  type PianoRollPointerInput,
  type PianoRollTimelineViewport,
} from '@seele-daw/editor'
import { type ClipId, type Tick, type ProjectSession } from '@seele-daw/project-core'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import { PIANO_ROLL_TOOL } from '@/features/piano-roll/types/piano-roll-preferences'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { useStudio } from '@/workbench/studio-services'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

export function useTrackPlacement({
  canvasHost,
  surfaceElement,
  getViewport,
  getPresentation,
  getSession,
  getTimelineEndTick,
  getBarSpanTick,
  createDisplayGrid,
  activateClip,
  acceptPlacedClip,
  failureMessage,
}: {
  readonly canvasHost: Readonly<ShallowRef<HTMLElement | null>>
  readonly surfaceElement: Readonly<ShallowRef<HTMLElement | null>>
  readonly getViewport: () => PianoRollTimelineViewport | null
  readonly getSession: () => Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getTimelineEndTick: () => Tick
  readonly getBarSpanTick: () => Tick
  readonly createDisplayGrid: () => PianoRollGrid
  readonly acceptPlacedClip: (clipId: ClipId) => void
  readonly activateClip: (clipId: ClipId) => void
  readonly failureMessage: ShallowRef<string | null>
}) {
  const { notes } = useStudio().edits
  const pianoRollPreferences = usePianoRollPreferencesStore()
  const toasts = useUiToastStore()
  const placementPreview = shallowRef<TrackPlacementPreview | null>(null)
  let pointerInputAdapter: EditorPointerInputAdapter | null = null
  let disposed = false
  let beginning = false
  let captureBounds: DOMRect | null = null
  const session = createTrackPlacementSession()
  const state = shallowRef(session.state)
  let projectedRevision = getPresentation().readModel.modelRevision
  session.subscribe((next) => {
    const previous = state.value
    state.value = next
    placementPreview.value = next.preview
    if (next.pointerId === null) {
      captureBounds = null
      if (!beginning && previous.pointerId !== null) pointerInputAdapter?.cancel()
    }
  })
  const { previewNoteStyle, previewClipStyle, previewMessage } = useTrackPlacementPreview({
    placementPreview,
    getViewport,
    getPresentation,
    getTimelineEndTick,
    getBarSpanTick,
  })

  function configuration(): TrackPlacementConfiguration | null {
    const viewport = getViewport()
    if (viewport === null) return null
    return {
      session: getSession(),
      readModel: getPresentation().readModel,
      viewport,
      grid: createDisplayGrid(),
      tool: pianoRollPreferences.activeTool,
      snapEnabled: pianoRollPreferences.snapEnabled,
      barSpanTick: getBarSpanTick(),
      timelineEndTick: getTimelineEndTick(),
      noteDurationTick: pianoRollPreferences.subdivisionSpanTick,
    }
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
    if (disposed || state.value.interactionId !== null) return
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
    const current = configuration()
    placementPreview.value = current === null ? null : resolveTrackPlacement(current, point)
  }

  function reportFailure(cause: unknown, committed = false): void {
    invalidate()
    const message = describeCause(cause, 'The Track Piano Roll interaction could not complete.')
    failureMessage.value = message
    if (committed) toasts.warning('MIDI note was placed but could not be displayed', message)
    else toasts.danger('MIDI note could not be placed', message)
  }

  function complete(intent: TrackPlacementIntent): void {
    let placedClipId: ClipId | null = null
    completeGesture(session, intent.interactionId, {
      apply: () => {
        if (intent.target.session !== getSession()) return null
        if (intent.type === 'activate-clip') {
          activateClip(intent.clipId)
          return null
        }
        const { preview, target } = intent
        if (preview.placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED) {
          failureMessage.value = preview.placement.message
          toasts.warning('MIDI note placement needs attention', preview.placement.message)
          return null
        }
        const placed = notes.placeOnTrack({
          expectedSession: target.session,
          activeClipId: target.readModel.activeClipId,
          barSpanTick: target.barSpanTick,
          baseRevision: target.readModel.modelRevision,
          noteDurationTick: preview.placement.noteDurationTick,
          pitch: preview.pitch,
          projectStartTick: preview.placement.projectStartTick,
          trackId: target.readModel.trackId,
        })
        placedClipId = placed.clipId
        return placed.commit
      },
      authorityRevision: () => projectedRevision,
      afterCommit: () => {
        if (placedClipId !== null) acceptPlacedClip(placedClipId)
        failureMessage.value = null
      },
      onFailure: reportFailure,
    })
  }

  function stableMapping(): boolean {
    if (captureBounds === null) return true
    const current = canvasHost.value?.getBoundingClientRect()
    if (
      current?.left === captureBounds.left &&
      current.top === captureBounds.top &&
      current.width === captureBounds.width &&
      current.height === captureBounds.height
    )
      return true
    invalidate()
    return false
  }
  function checkMapping(): void {
    if (disposed) return
    try {
      stableMapping()
    } catch (cause) {
      reportFailure(cause)
    }
  }
  function handlePointerInput(input: PianoRollPointerInput): void {
    if (disposed) return
    if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
      surfaceElement.value?.focus({ preventScroll: true })
      const current = configuration()
      if (current === null) {
        pointerInputAdapter?.cancel()
        return
      }
      const bounds = canvasHost.value?.getBoundingClientRect() ?? null
      beginning = true
      let failure: unknown = null
      try {
        failure = session.handlePointerInput(input, current).failure
      } finally {
        beginning = false
      }
      if (failure !== null) reportFailure(failure)
      else if (session.state.pointerId !== null) captureBounds = bounds
      else pointerInputAdapter?.cancel()
      return
    }
    if (input.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL && !stableMapping()) return
    const { failure, intent } = session.handlePointerInput(input)
    if (failure !== null) reportFailure(failure)
    else if (intent !== null) complete(intent)
  }

  function clearPreview(): void {
    if (state.value.interactionId === null) placementPreview.value = null
  }
  function invalidate(): void {
    try {
      session.cancel()
    } finally {
      pointerInputAdapter?.cancel()
      captureBounds = null
      placementPreview.value = null
    }
  }
  const stopTarget = watch(
    [
      getSession,
      () => getPresentation().projectId,
      () => getPresentation().trackId,
      getViewport,
      getTimelineEndTick,
      getBarSpanTick,
    ],
    invalidate,
    { flush: 'sync' },
  )
  const stopClip = watch(
    () => getPresentation().readModel.activeClipId,
    () => {
      if (state.value.pointerId !== null) invalidate()
      else clearPreview()
    },
    { flush: 'sync' },
  )
  const stopProjection = watch(
    () => getPresentation().readModel.modelRevision,
    (revision) => {
      projectedRevision = revision
      try {
        session.notifyAuthorityRevision(revision)
      } catch (cause) {
        reportFailure(cause, state.value.awaitingAuthority)
      }
    },
    { flush: 'post' },
  )
  useStudioInteractionTarget({
    isActive: () => state.value.pointerId !== null,
    cancel: () => {
      if (state.value.pointerId === null) return STUDIO_ACTION_NOT_APPLIED
      invalidate()
      return STUDIO_ACTION_COMPLETED
    },
  })

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
      pointerInputAdapter = createEditorPointerInputAdapter({
        onInput: handlePointerInput,
        resolveHit: resolvePianoRollDomNoteHit,
        surface: host,
      })
      window.addEventListener('scroll', checkMapping, true)
      window.addEventListener('resize', checkMapping)
    },
    dispose() {
      if (disposed) return
      stopTarget()
      stopClip()
      stopProjection()
      window.removeEventListener('scroll', checkMapping, true)
      window.removeEventListener('resize', checkMapping)
      invalidate()
      disposed = true
      pointerInputAdapter?.dispose()
      pointerInputAdapter = null
      session.dispose()
      clearPreview()
    },
  }
}
