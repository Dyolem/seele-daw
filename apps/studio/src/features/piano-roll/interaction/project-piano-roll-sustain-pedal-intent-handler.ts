import { PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT } from '@seele-daw/editor'
import type { ProjectCommit } from '@seele-daw/project-core'
import type {
  ProjectPianoRollSustainPedalIntentHandler,
  ProjectPianoRollSustainPedalIntentHandlerDependencies,
} from '@/features/piano-roll/types/piano-roll-intent'

/** Claims one frozen CC64 completion at Studio's command and selection boundary. */
export function createProjectPianoRollSustainPedalIntentHandler(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
): ProjectPianoRollSustainPedalIntentHandler {
  return (intent) => {
    const { interactionSession, sustainPedal } = dependencies
    if (!interactionSession.claimCompletion(intent.interactionId)) return
    const { target } = intent
    const authority = { expectedSession: target.session, baseRevision: target.baseRevision }
    let commit: ProjectCommit | null = null
    try {
      switch (intent.type) {
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION:
          interactionSession.finish(intent.interactionId)
          dependencies.setSelectedEventIds(intent.selectedEventIds)
          dependencies.reportSuccess()
          return
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT:
          if (target.trackId !== null) {
            commit = sustainPedal.placeOnTrack({
              ...authority,
              activeClipId: target.activeClipId,
              channel: target.channel,
              trackId: target.trackId,
              projectTick: intent.placement.timelineTick,
              value: intent.placement.value,
            }).commit
          } else {
            if (target.activeClipId === null)
              throw new Error('The Clip Focus Sustain Pedal target is missing.')
            commit = sustainPedal.placeInClip({
              ...authority,
              clipId: target.activeClipId,
              channel: target.channel,
              clipTick: intent.placement.timelineTick,
              value: intent.placement.value,
            }).commit
          }
          break
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS:
          commit = sustainPedal.move({
            ...authority,
            clipId: intent.gesture.scope.clipId,
            deltaTick: intent.preview.deltaTick,
            eventIds: intent.preview.eventIds,
          })
          break
        case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE:
          commit = sustainPedal.replaceValue({
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
      if (commit === null) interactionSession.finish(intent.interactionId)
      else
        interactionSession.resolveCommit({
          interactionId: intent.interactionId,
          authorityRevision: dependencies.getAuthorityRevision(),
          commitRevision: commit.modelRevision,
        })
      if (commit !== null) {
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
      dependencies.reportFailure(cause, commit !== null)
    }
  }
}
