import { GestureSession, projectGestureAuthority } from '@seele-daw/editor'

import type { TempoEditTarget } from '@/workbench/edits/tempo-edits'
import type {
  TempoTrackDragConfiguration,
  TempoTrackDragPreview,
  TempoTrackDragResult,
  TempoTrackPointerInput,
} from '@/features/project-workspace/tempo-track/types/tempo-track-drag'
import { TempoTrackDragOperation } from './tempo-track-drag-operation'

export type TempoTrackDragSession = GestureSession<
  TempoTrackPointerInput,
  TempoTrackDragPreview,
  TempoTrackDragResult,
  TempoEditTarget,
  TempoTrackDragConfiguration
>

/** Drags one Tempo point; a press only starts when the view shows the current revision. */
export function createTempoTrackDragSession(): TempoTrackDragSession {
  return new GestureSession((input, { session, mapping, projectedRevision }) => {
    const snapshot = session.getSnapshot()
    const event = snapshot.tempoEvents.find(({ id }) => id === input.hit?.tempoEventId)
    if (
      snapshot.modelRevision !== projectedRevision ||
      event === undefined ||
      mapping.width <= 0 ||
      mapping.height <= 0
    ) {
      return null
    }
    return {
      authority: projectGestureAuthority(session, snapshot.modelRevision),
      operation: new TempoTrackDragOperation(event, mapping, input),
      target: Object.freeze({ expectedSession: session, baseRevision: snapshot.modelRevision }),
      previewOnPress: true,
    }
  })
}
