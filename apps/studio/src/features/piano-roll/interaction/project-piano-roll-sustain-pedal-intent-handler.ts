import {
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT,
  resolvePianoRollSustainPedalSelection,
  type PianoRollSustainPedalMoveEventsIntent,
  type PianoRollSustainPedalReplaceValueIntent,
  type PianoRollSustainPedalResolveSelectionIntent,
} from '@seele-daw/editor'

import type {
  ProjectPianoRollSustainPedalIntentHandler,
  ProjectPianoRollSustainPedalIntentHandlerDependencies,
} from '@/features/piano-roll/types/piano-roll-intent'

function handleSelectionIntent(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
  intent: PianoRollSustainPedalResolveSelectionIntent,
): void {
  try {
    const resolution = resolvePianoRollSustainPedalSelection({
      pointerInput: intent.pointerInput,
      scope: dependencies.getInteractionScope(),
      selectedEventIds: dependencies.getSelectedEventIds(),
    })
    if (resolution !== null) {
      dependencies.setSelectedEventIds(resolution.selectedEventIds)
      dependencies.reportSuccess()
    }
  } catch (cause) {
    dependencies.reportFailure(cause)
  }
}

function handleMoveIntent(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
  intent: PianoRollSustainPedalMoveEventsIntent,
): void {
  try {
    const result =
      intent.preview.deltaTick === 0
        ? null
        : dependencies.projectMidiSustainPedal.moveEvents({
            baseRevision: intent.gesture.baseRevision,
            clipId: intent.gesture.scope.clipId,
            deltaTick: intent.preview.deltaTick,
            eventIds: intent.preview.eventIds,
          })
    if (result === null) {
      dependencies.interactionSession.skipTransformCommit()
    } else {
      dependencies.interactionSession.resolveTransformCommit({
        authorityRevision: dependencies.getAuthorityRevision(),
        commitRevision: result.commit.modelRevision,
      })
      if (intent.gesture.selectOnlyOnMoveCommit) {
        dependencies.setSelectedEventIds([intent.gesture.anchorEvent.event.id])
      }
    }
    dependencies.reportSuccess()
  } catch (cause) {
    dependencies.interactionSession.skipTransformCommit()
    dependencies.reportFailure(cause)
  }
}

function handleReplaceValueIntent(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
  intent: PianoRollSustainPedalReplaceValueIntent,
): void {
  try {
    const result =
      intent.preview.value === intent.gesture.anchorEvent.event.value
        ? null
        : dependencies.projectMidiSustainPedal.replaceEventValue({
            baseRevision: intent.gesture.baseRevision,
            clipId: intent.gesture.scope.clipId,
            eventId: intent.preview.eventId,
            value: intent.preview.value,
          })
    if (result === null) {
      dependencies.interactionSession.skipTransformCommit()
    } else {
      dependencies.interactionSession.resolveTransformCommit({
        authorityRevision: dependencies.getAuthorityRevision(),
        commitRevision: result.commit.modelRevision,
      })
      if (intent.gesture.selectOnlyOnValueCommit) {
        dependencies.setSelectedEventIds([intent.preview.eventId])
      }
    }
    dependencies.reportSuccess()
  } catch (cause) {
    dependencies.interactionSession.skipTransformCommit()
    dependencies.reportFailure(cause)
  }
}

/** Applies one CC64 Editor intent at Studio's command, selection and feedback boundary. */
export function createProjectPianoRollSustainPedalIntentHandler(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
): ProjectPianoRollSustainPedalIntentHandler {
  return (intent) => {
    switch (intent.type) {
      case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION:
        handleSelectionIntent(dependencies, intent)
        return
      case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS:
        handleMoveIntent(dependencies, intent)
        return
      case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE:
        handleReplaceValueIntent(dependencies, intent)
        return
      case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT:
        // Placement still follows the Surface-specific Clip or Track use case.
        return
    }
  }
}
