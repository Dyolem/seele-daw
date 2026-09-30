import { computed, shallowRef, type ShallowRef } from 'vue'
import {
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT,
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
  ClipId,
  MidiChannel,
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
import type { PianoRollSustainPedalLanePlacement } from '@/features/piano-roll/types/piano-roll-sustain-pedal'
import type { SustainPedalLaneReadModel } from '@/features/piano-roll/components/sustain-pedal/types/sustain-pedal-lane'

export function useSustainPedalInteraction({
  laneSurface,
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
  placeEvent,
}: {
  readonly laneSurface: Readonly<ShallowRef<HTMLElement | null>>
  readonly getReadModel: () => SustainPedalLaneReadModel
  readonly getViewport: () => PianoRollValueLaneViewport | null
  readonly getGrid: () => PianoRollGrid
  readonly isSnapEnabled: () => boolean
  readonly isPencilEnabled: () => boolean
  readonly getSelectedEventIds: () => readonly MidiSustainPedalEventId[]
  readonly setSelectedEventIds: (ids: readonly MidiSustainPedalEventId[]) => void
  readonly resolveEditingScope: () => PianoRollSustainPedalEditingScope | null
  readonly projectMidiSustainPedal: ProjectMidiSustainPedalCoordinator
  readonly reportFailure: (cause: unknown) => void
  readonly reportSuccess: () => void
  readonly requestFocus: () => void
  readonly placeEvent: (placement: PianoRollSustainPedalLanePlacement) => void
}) {
  interface ActiveLaneInteractionConfiguration {
    readonly activeClipId: ClipId | null
    readonly channel: MidiChannel
    readonly modelRevision: ModelRevision
    readonly scope: PianoRollSustainPedalEditingScope | null
  }

  const interactionSession = createPianoRollSustainPedalInteractionSession()
  const interactionState = shallowRef<PianoRollSustainPedalInteractionState>(
    interactionSession.state,
  )
  let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
  let activeInteractionConfiguration: ActiveLaneInteractionConfiguration | null = null
  let disposed = false
  const handleInteractionIntent = createProjectPianoRollSustainPedalIntentHandler({
    getAuthorityRevision: () => getReadModel().modelRevision,
    getInteractionScope: () => activeInteractionConfiguration?.scope ?? null,
    getSelectedEventIds: () => getSelectedEventIds(),
    interactionSession,
    projectMidiSustainPedal,
    reportFailure: (cause) => reportFailure(cause),
    reportSuccess: () => reportSuccess(),
    setSelectedEventIds,
  })
  const unsubscribeInteractionSession = interactionSession.subscribe({
    onStateChange: (state) => {
      interactionState.value = state
    },
  })

  function invalidate(): void {
    if (disposed) return
    if (!(pointerInputAdapter?.cancel() ?? false)) interactionSession.cancel()
    activeInteractionConfiguration = null
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
    pointerInputAdapter = createPianoRollSemanticPointerInputAdapter({
      observer: {
        onError: ({ cause }) => {
          if (disposed) return
          activeInteractionConfiguration = null
          interactionSession.cancel()
          reportFailure(cause)
        },
        onInput: (input) => {
          if (disposed) return
          const currentViewport = getViewport()
          if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
            surface.focus({ preventScroll: true })
            requestFocus()
            const model = getReadModel()
            if (currentViewport === null) return
            try {
              activeInteractionConfiguration = Object.freeze({
                activeClipId: 'clipId' in model ? model.clipId : model.activeClipId,
                channel: model.channel,
                modelRevision: model.modelRevision,
                scope: resolveEditingScope(),
              })
            } catch (cause) {
              activeInteractionConfiguration = null
              reportFailure(cause)
              return
            }
          }
          const configuration = activeInteractionConfiguration
          const outcome = interactionSession.handlePointerInput(
            input,
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN &&
              configuration !== null &&
              currentViewport !== null
              ? {
                  grid: getGrid(),
                  scope: configuration.scope,
                  selectedEventIds: getSelectedEventIds(),
                  snapEnabled: isSnapEnabled(),
                  tool: isPencilEnabled()
                    ? PIANO_ROLL_INTERACTION_TOOL.PENCIL
                    : PIANO_ROLL_INTERACTION_TOOL.CURSOR,
                  viewport: currentViewport,
                }
              : undefined,
          )
          if (outcome.failure !== null) reportFailure(outcome.failure)
          if (outcome.intent !== null) {
            if (
              outcome.intent.type === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT &&
              configuration !== null
            ) {
              const placement = outcome.intent.placement
              placeEvent(
                Object.freeze({
                  ...placement,
                  activeClipId: configuration.activeClipId,
                  channel: configuration.channel,
                  modelRevision: configuration.modelRevision,
                }),
              )
            } else {
              handleInteractionIntent(outcome.intent)
            }
          }
          if (
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.END ||
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL
          ) {
            activeInteractionConfiguration = null
          }
        },
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
      if (interactionState.value.pointerId !== null) {
        invalidate()
      }
      interactionSession.notifyAuthorityRevision(revision)
    },
  }
}
