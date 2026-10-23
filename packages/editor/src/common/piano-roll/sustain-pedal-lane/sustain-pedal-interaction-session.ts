import { GestureSession } from '#internal/common/interaction/gesture-session'
import type { PianoRollPointerInput } from '#internal/common/piano-roll/piano-roll-input'
import { projectGestureAuthority } from '#internal/common/project-gesture-authority'
import type {
  PianoRollSustainPedalInteractionConfiguration,
  PianoRollSustainPedalInteractionTarget,
} from './sustain-pedal-interaction'
import type { PianoRollSustainPedalLaneHit } from './sustain-pedal-lane-input'
import { SustainPedalOperation, type SustainPedalOperationResult } from './sustain-pedal-operation'
import type { PianoRollSustainPedalTransformPreview } from './sustain-pedal-event-transform'

export type PianoRollSustainPedalInteractionSession = GestureSession<
  PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
  PianoRollSustainPedalTransformPreview,
  SustainPedalOperationResult,
  PianoRollSustainPedalInteractionTarget,
  PianoRollSustainPedalInteractionConfiguration
>

/** CC64 gestures; a press is ignored when its editing scope was read at another revision. */
export function createPianoRollSustainPedalInteractionSession(): PianoRollSustainPedalInteractionSession {
  return new GestureSession((input, configuration) => {
    const target = Object.freeze({ ...configuration.target })
    if (configuration.scope !== null && configuration.scope.modelRevision !== target.baseRevision) {
      return null
    }
    return {
      authority: projectGestureAuthority(target.session, target.baseRevision),
      operation: new SustainPedalOperation(configuration, input),
      target,
    }
  })
}
