import { GestureSession } from '#internal/common/interaction/gesture-session'
import type { PianoRollPointerInput } from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollViewport } from '#internal/common/piano-roll/piano-roll-viewport'
import { projectGestureAuthority } from '#internal/common/project-gesture-authority'
import {
  createPianoRollNoteOperation,
  type PianoRollOperationPreview,
  type PianoRollOperationResult,
} from './piano-roll-note-operation'
import type {
  PianoRollInteractionConfiguration,
  PianoRollInteractionTarget,
} from './piano-roll-interaction'

function sameMapping(a: PianoRollViewport, b: PianoRollViewport): boolean {
  return (
    a.clipId === b.clipId &&
    a.widthCssPixel === b.widthCssPixel &&
    a.heightCssPixel === b.heightCssPixel &&
    a.visibleSpanTick === b.visibleSpanTick &&
    a.visibleStartTick === b.visibleStartTick &&
    a.minimumPitch === b.minimumPitch &&
    a.maximumPitch === b.maximumPitch &&
    a.pitchRowHeightCssPixel === b.pitchRowHeightCssPixel &&
    a.pitchOffsetCssPixel === b.pitchOffsetCssPixel
  )
}

/** Note gestures in one Clip. Pointer positions only map through the viewport they began in. */
export class PianoRollInteractionSession extends GestureSession<
  PianoRollPointerInput,
  PianoRollOperationPreview,
  PianoRollOperationResult,
  PianoRollInteractionTarget,
  PianoRollInteractionConfiguration
> {
  constructor() {
    super((input, configuration) => {
      const frozen = Object.freeze({
        ...configuration,
        context: Object.freeze({ ...configuration.context }),
        grid: Object.freeze({ ...configuration.grid }),
        selectedNoteIds: Object.freeze([...configuration.selectedNoteIds]),
        viewport:
          configuration.viewport === null ? null : Object.freeze({ ...configuration.viewport }),
      })
      const baseRevision = frozen.session.modelRevision
      return {
        authority: projectGestureAuthority(frozen.session, baseRevision),
        operation: createPianoRollNoteOperation(frozen, input),
        target: Object.freeze({
          baseRevision,
          context: frozen.context,
          session: frozen.session,
          viewport: frozen.viewport,
        }),
      }
    })
  }

  notifyViewport(viewport: PianoRollViewport | null): void {
    const original = this.target?.viewport
    if (original === undefined || original === viewport) return
    if (original === null || viewport === null || !sameMapping(original, viewport)) this.cancel()
  }
}

export function createPianoRollInteractionSession(): PianoRollInteractionSession {
  return new PianoRollInteractionSession()
}
