import { PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT } from '@seele-daw/editor'
import type {
  ProjectPianoRollSustainPedalIntentHandler,
  ProjectPianoRollSustainPedalIntentHandlerDependencies,
} from '@/features/piano-roll/types/piano-roll-intent'

/** Claims one frozen CC64 completion at Studio's command and selection boundary. */
export function createProjectPianoRollSustainPedalIntentHandler(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
): ProjectPianoRollSustainPedalIntentHandler {
  return (intent) => {
    const { interactionSession, projectMidiSustainPedal } = dependencies
    if (!interactionSession.claimCompletion(intent.interactionId)) return
    const { target } = intent
    const authority = { expectedSession: target.session, baseRevision: target.baseRevision }
    let result
    try {
      switch (intent.type) {
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION:
          interactionSession.finish(intent.interactionId)
          dependencies.setSelectedEventIds(intent.selectedEventIds)
          dependencies.reportSuccess()
          return
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT:
          if (target.trackId !== null) {
            result = projectMidiSustainPedal.placeOnTrack({
              ...authority,
              activeClipId: target.activeClipId,
              channel: target.channel,
              trackId: target.trackId,
              projectTick: intent.placement.timelineTick,
              value: intent.placement.value,
            })
          } else {
            if (target.activeClipId === null)
              throw new Error('The Clip Focus Sustain Pedal target is missing.')
            result = projectMidiSustainPedal.placeInClip({
              ...authority,
              clipId: target.activeClipId,
              channel: target.channel,
              clipTick: intent.placement.timelineTick,
              value: intent.placement.value,
            })
          }
          break
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS:
          result = projectMidiSustainPedal.moveEvents({
            ...authority,
            clipId: intent.gesture.scope.clipId,
            deltaTick: intent.preview.deltaTick,
            eventIds: intent.preview.eventIds,
          })
          break
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE:
          result = projectMidiSustainPedal.replaceEventValue({
            ...authority,
            clipId: intent.gesture.scope.clipId,
            eventId: intent.preview.eventId,
            value: intent.preview.value,
          })
          break
      }
    } catch (cause) {
      interactionSession.finish(intent.interactionId)
      dependencies.reportFailure(cause)
      return
    }

    // The command has succeeded. Projection failures cannot undo that fact.
    try {
      if (result === null) interactionSession.finish(intent.interactionId)
      else
        interactionSession.resolveCommit({
          interactionId: intent.interactionId,
          authorityRevision: dependencies.getAuthorityRevision(),
          commitRevision: result.commit.modelRevision,
        })
      if (result !== null) {
        if (
          intent.type === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS &&
          intent.gesture.selectOnlyOnMoveCommit
        )
          dependencies.setSelectedEventIds([intent.gesture.anchorEvent.event.id])
        if (
          intent.type === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE &&
          intent.gesture.selectOnlyOnValueCommit
        )
          dependencies.setSelectedEventIds([intent.preview.eventId])
      }
      dependencies.reportSuccess()
    } catch (cause) {
      dependencies.reportFailure(cause, result !== null)
    }
  }
}
