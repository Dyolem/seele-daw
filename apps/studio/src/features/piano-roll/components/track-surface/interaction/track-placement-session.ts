import {
  GestureSession,
  projectGestureAuthority,
  type PianoRollPointerInput,
} from '@seele-daw/editor'

import type {
  TrackPlacementConfiguration,
  TrackPlacementPreview,
  TrackPlacementResult,
} from '@/features/piano-roll/components/track-surface/types/track-placement'
import { TrackPlacementOperation } from './track-placement-operation'

export type TrackPlacementSession = GestureSession<
  PianoRollPointerInput,
  TrackPlacementPreview,
  TrackPlacementResult,
  TrackPlacementConfiguration,
  TrackPlacementConfiguration
>

/** Places a note on the Track at a frozen read model revision. */
export function createTrackPlacementSession(): TrackPlacementSession {
  return new GestureSession((input, configuration) => {
    const target = Object.freeze({
      ...configuration,
      grid: Object.freeze({ ...configuration.grid }),
      viewport: Object.freeze({ ...configuration.viewport }),
    })
    return {
      authority: projectGestureAuthority(target.session, target.readModel.modelRevision),
      operation: new TrackPlacementOperation(target, input),
      target,
      previewOnPress: true,
    }
  })
}
