import { computed, shallowRef, type ShallowRef } from 'vue'
import {
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createEditorPointerInputAdapter,
  createPianoRollSustainPedalInteractionSession,
  resolvePianoRollDomSustainPedalEventHit,
  type EditorPointerInputAdapter,
  type PianoRollGrid,
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
import type { SustainPedalEdits } from '@/workbench/edits/sustain-pedal-edits'
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
  sustainPedal,
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
  readonly sustainPedal: SustainPedalEdits
  readonly reportFailure: (cause: unknown, committed?: boolean) => void
  readonly reportSuccess: () => void
  readonly requestFocus: () => void
}) {
  const interactionSession = createPianoRollSustainPedalInteractionSession()
  const interactionState = shallowRef<PianoRollSustainPedalInteractionState>(
    interactionSession.state,
  )
  let pointerInputAdapter: EditorPointerInputAdapter | null = null
  let disposed = false
  let beginning = false
  let projectedRevision = getReadModel().modelRevision
  const handleInteractionIntent = createProjectPianoRollSustainPedalIntentHandler({
    getAuthorityRevision: () => projectedRevision,
    interactionSession,
    sustainPedal,
    reportFailure: (cause, committed) => reportFailure(cause, committed),
    reportSuccess: () => reportSuccess(),
    setSelectedEventIds,
  })
  const unsubscribeInteractionSession = interactionSession.subscribe((state) => {
    interactionState.value = state
    if (state.pointerId === null && !beginning) pointerInputAdapter?.cancel()
  })

  function invalidate(): void {
    if (disposed) return
    try {
      interactionSession.cancel()
    } finally {
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
    pointerInputAdapter?.dispose()
    pointerInputAdapter = null
    unsubscribeInteractionSession()
    interactionSession.dispose()
  }
  function mount(): void {
    const surface = laneSurface.value
    if (disposed || pointerInputAdapter !== null || surface === null) return
    pointerInputAdapter = createEditorPointerInputAdapter({
      onInput: (input) => {
        if (disposed) return
        if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL) {
          interactionSession.handlePointerInput(input)
          return
        }
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
        if (outcome.failure !== null) reportFailure(outcome.failure)
        if (outcome.intent !== null) handleInteractionIntent(outcome.intent)
        if (interactionSession.state.pointerId === null) pointerInputAdapter?.cancel()
      },
      resolveHit: resolvePianoRollDomSustainPedalEventHit,
      surface,
    })
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
