import { PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT, completeGesture } from '@seele-daw/editor'
import type { ProjectCommit } from '@seele-daw/project-core'

import type {
  ProjectPianoRollSustainPedalIntentHandler,
  ProjectPianoRollSustainPedalIntentHandlerDependencies,
} from '@/features/piano-roll/types/piano-roll-intent'

/** Applies one completed CC64 gesture as a Project edit, then updates the event selection. */
export function createProjectPianoRollSustainPedalIntentHandler(
  dependencies: ProjectPianoRollSustainPedalIntentHandlerDependencies,
): ProjectPianoRollSustainPedalIntentHandler {
  const { interactionSession, sustainPedal } = dependencies

  return (intent) => {
    const { target } = intent
    const authority = { expectedSession: target.session, baseRevision: target.baseRevision }
    let selectAfterCommit: (() => void) | null = null
    const settled = (commit: ProjectCommit | null) => {
      if (commit === null) dependencies.reportSuccess()
      return commit
    }

    completeGesture(interactionSession, intent.interactionId, {
      apply: () => {
        switch (intent.type) {
          case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION:
            dependencies.setSelectedEventIds(intent.selectedEventIds)
            return settled(null)
          case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT: {
            const placement = {
              ...authority,
              channel: target.channel,
              value: intent.placement.value,
            }
            if (target.trackId !== null) {
              return sustainPedal.placeOnTrack({
                ...placement,
                activeClipId: target.activeClipId,
                trackId: target.trackId,
                projectTick: intent.placement.timelineTick,
              }).commit
            }
            if (target.activeClipId === null) {
              throw new Error('The Clip Focus Sustain Pedal target is missing.')
            }
            return sustainPedal.placeInClip({
              ...placement,
              clipId: target.activeClipId,
              clipTick: intent.placement.timelineTick,
            }).commit
          }
          case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS: {
            const { gesture } = intent
            if (gesture.selectOnlyOnMoveCommit) {
              selectAfterCommit = () =>
                dependencies.setSelectedEventIds([gesture.anchorEvent.event.id])
            }
            return settled(
              sustainPedal.move({
                ...authority,
                clipId: gesture.scope.clipId,
                deltaTick: intent.preview.deltaTick,
                eventIds: intent.preview.eventIds,
              }),
            )
          }
          case PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE: {
            const { gesture, preview } = intent
            if (gesture.selectOnlyOnValueCommit) {
              selectAfterCommit = () => dependencies.setSelectedEventIds([preview.eventId])
            }
            return settled(
              sustainPedal.replaceValue({
                ...authority,
                clipId: gesture.scope.clipId,
                eventId: preview.eventId,
                value: preview.value,
              }),
            )
          }
        }
      },
      authorityRevision: dependencies.getAuthorityRevision,
      afterCommit: () => {
        selectAfterCommit?.()
        dependencies.reportSuccess()
      },
      onFailure: dependencies.reportFailure,
    })
  }
}
