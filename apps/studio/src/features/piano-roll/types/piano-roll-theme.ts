import type { PianoRollGridCanvasTheme } from '@seele-daw/editor'

export interface PianoRollSurfaceThemeSnapshot {
  readonly grid: PianoRollGridCanvasTheme
  readonly noteBorderColor: string
  readonly noteFillColor: string
  readonly selectedNoteBorderColor: string
  readonly selectedNoteGlowColor: string
}
