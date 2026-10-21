import type { PianoRollPitchViewport } from '@seele-daw/editor'

export interface PianoRollSurfaceGeometry extends PianoRollPitchViewport {
  readonly widthCssPixel: number
}

export interface PianoRollPitchViewLayout {
  readonly viewport: PianoRollPitchViewport
  readonly scrollTop: number
  readonly contentHeight: number
}
