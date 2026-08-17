import type { PianoRollViewport } from '@seele-daw/editor'
import type { Tick } from '@seele-daw/project-core'

interface PianoRollPlayheadProjectionInput {
  readonly clipSpanTick: Tick
  readonly clipStartTick: Tick
  readonly globalTick: number
  readonly viewport: Pick<
    PianoRollViewport,
    'visibleEndTick' | 'visibleSpanTick' | 'visibleStartTick' | 'widthCssPixel'
  >
}

/** Projects a continuous global Transport Tick into the visible Clip-local viewport. */
export function projectPianoRollPlayheadCssPixel(
  input: PianoRollPlayheadProjectionInput,
): number | null {
  const { viewport } = input
  if (
    !Number.isFinite(input.globalTick) ||
    !Number.isFinite(viewport.widthCssPixel) ||
    viewport.widthCssPixel <= 0 ||
    viewport.visibleSpanTick <= 0
  ) {
    return null
  }

  const clipLocalTick = input.globalTick - input.clipStartTick
  if (clipLocalTick < 0 || clipLocalTick > input.clipSpanTick) return null
  if (clipLocalTick < viewport.visibleStartTick || clipLocalTick > viewport.visibleEndTick) {
    return null
  }

  return (
    ((clipLocalTick - viewport.visibleStartTick) / viewport.visibleSpanTick) *
    viewport.widthCssPixel
  )
}
