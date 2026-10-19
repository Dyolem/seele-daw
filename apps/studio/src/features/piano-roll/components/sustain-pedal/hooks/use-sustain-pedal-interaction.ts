import { computed, shallowRef, type ShallowRef } from 'vue'
import {
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollSustainPedalInteractionSession,
  createPianoRollSemanticPointerInputAdapter,
  resolvePianoRollDomSustainPedalEventHit,
  type PianoRollGrid,
  type PianoRollPointerInputAdapter,
  type PianoRollSustainPedalEditingScope,
  type PianoRollSustainPedalInteractionState,
  type PianoRollValueLaneViewport,
} from '@seele-daw/editor'
import type {
  ProjectSession,
  MidiSustainPedalEventId,
  ModelRevision,
} from '@seele-daw/project-core'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { createProjectPianoRollSustainPedalIntentHandler } from '@/features/piano-roll/interaction/project-piano-roll-sustain-pedal-intent-handler'
import type { ProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import type { SustainPedalLaneReadModel } from '@/features/piano-roll/components/sustain-pedal/types/sustain-pedal-lane'

export function useSustainPedalInteraction({
  laneSurface,
  getSession,
  getReadModel,
  getViewport,
  getGrid,
  isSnapEnabled,
  isPencilEnabled,
  getSelectedEventIds,
  setSelectedEventIds,
  resolveEditingScope,
  projectMidiSustainPedal,
  reportFailure,
  reportSuccess,
  requestFocus,
}: {
  readonly laneSurface: Readonly<ShallowRef<HTMLElement | null>>
  readonly getSession: () => Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly getReadModel: () => SustainPedalLaneReadModel
  readonly getViewport: () => PianoRollValueLaneViewport | null
  readonly getGrid: () => PianoRollGrid
  readonly isSnapEnabled: () => boolean
  readonly isPencilEnabled: () => boolean
  readonly getSelectedEventIds: () => readonly MidiSustainPedalEventId[]
  readonly setSelectedEventIds: (ids: readonly MidiSustainPedalEventId[]) => void
  readonly resolveEditingScope: () => PianoRollSustainPedalEditingScope | null
  readonly projectMidiSustainPedal: ProjectMidiSustainPedalCoordinator
  readonly reportFailure: (cause: unknown, committed?: boolean) => void
  readonly reportSuccess: () => void
  readonly requestFocus: () => void
}) {
  const interactionSession = createPianoRollSustainPedalInteractionSession()
  const interactionState = shallowRef<PianoRollSustainPedalInteractionState>(
    interactionSession.state,
  )
  let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
  let disposed = false
  let beginning = false
  let captureBounds: DOMRect | null = null
  let projectedRevision = getReadModel().modelRevision
  const handleInteractionIntent = createProjectPianoRollSustainPedalIntentHandler({
    getAuthorityRevision: () => projectedRevision,
    interactionSession,
    projectMidiSustainPedal,
    reportFailure: (cause, committed) => reportFailure(cause, committed),
    reportSuccess: () => reportSuccess(),
    setSelectedEventIds,
  })
  const unsubscribeInteractionSession = interactionSession.subscribe({
    onStateChange: (state) => {
      interactionState.value = state
      if (state.pointerId === null) {
        captureBounds = null
        if (!beginning) pointerInputAdapter?.cancel()
      }
    },
  })

  function invalidate(): void {
    if (disposed) return
    try {
      interactionSession.cancel()
    } finally {
      captureBounds = null
      if (!beginning) pointerInputAdapter?.cancel()
    }
  }
  function hasCancellableInteraction(): boolean {
    return !disposed && interactionState.value.pointerId !== null
  }
  function cancelInteraction(): StudioActionCompletion {
    if (!hasCancellableInteraction()) return STUDIO_ACTION_NOT_APPLIED
    invalidate()
    reportSuccess()
    return STUDIO_ACTION_COMPLETED
  }
  function dispose(): void {
    if (disposed) return
    invalidate()
    disposed = true
    window.removeEventListener('scroll', checkMapping, true)
    window.removeEventListener('resize', checkMapping)
    pointerInputAdapter?.dispose()
    pointerInputAdapter = null
    unsubscribeInteractionSession()
    interactionSession.dispose()
  }
  function stableMapping(): boolean {
    if (captureBounds === null) return true
    const current = laneSurface.value?.getBoundingClientRect()
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
      invalidate()
      reportFailure(cause)
    }
  }
  function mount(): void {
    const surface = laneSurface.value
    if (disposed || pointerInputAdapter !== null || surface === null) return
    pointerInputAdapter = createPianoRollSemanticPointerInputAdapter({
      observer: {
        onError: ({ cause }) => {
          if (disposed) return
          interactionSession.cancel()
          reportFailure(cause)
        },
        onInput: (input) => {
          if (disposed) return
          if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL) {
            interactionSession.handlePointerInput(input)
            return
          }
          if (!stableMapping()) return
          const bounds = surface.getBoundingClientRect()
          const currentViewport = getViewport()
          if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
            surface.focus({ preventScroll: true })
            requestFocus()
          }
          if (currentViewport === null) {
            invalidate()
            return
          }
          const model = getReadModel()
          beginning = input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN
          let outcome
          try {
            outcome = interactionSession.handlePointerInput(
              input,
              input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN
                ? {
                    target: {
                      session: getSession(),
                      baseRevision: model.modelRevision,
                      activeClipId: 'clipId' in model ? model.clipId : model.activeClipId,
                      trackId: 'trackId' in model ? model.trackId : null,
                      channel: model.channel,
                    },
                    grid: getGrid(),
                    scope: resolveEditingScope(),
                    selectedEventIds: getSelectedEventIds(),
                    snapEnabled: isSnapEnabled(),
                    tool: isPencilEnabled()
                      ? PIANO_ROLL_INTERACTION_TOOL.PENCIL
                      : PIANO_ROLL_INTERACTION_TOOL.CURSOR,
                    viewport: currentViewport,
                  }
                : undefined,
            )
          } finally {
            beginning = false
          }
          if (
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN &&
            interactionSession.state.pointerId !== null
          )
            captureBounds = bounds
          if (outcome.failure !== null) reportFailure(outcome.failure)
          if (outcome.intent !== null) handleInteractionIntent(outcome.intent)
          if (interactionSession.state.pointerId === null) pointerInputAdapter?.cancel()
        },
      },
      resolveHit: resolvePianoRollDomSustainPedalEventHit,
      surface,
    })
    window.addEventListener('scroll', checkMapping, true)
    window.addEventListener('resize', checkMapping)
  }

  return {
    interactionState: computed(() => interactionState.value),
    hasCancellableInteraction,
    cancelInteraction,
    invalidate,
    mount,
    dispose,
    notifyAuthorityRevision(revision: ModelRevision) {
      if (disposed) return
      projectedRevision = revision
      interactionSession.notifyAuthorityRevision(revision)
      if (interactionSession.state.pointerId === null) pointerInputAdapter?.cancel()
    },
  }
}
