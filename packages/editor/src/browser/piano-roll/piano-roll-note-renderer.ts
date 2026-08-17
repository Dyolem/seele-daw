import type { MidiPitch, NoteId, Tick } from '@seele-daw/project-core'

export interface PianoRollNoteVisual {
  readonly borderColor: string
  readonly fillColor: string
  readonly glowColor: string | null
  readonly heightCssPixel: number
  readonly noteId: NoteId
  readonly opacity: number
  readonly pitch: MidiPitch
  readonly selected: boolean
  readonly visibleEndTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
  readonly xCssPixel: number
  readonly yCssPixel: number
}

export interface PianoRollNoteScene {
  readonly heightCssPixel: number
  readonly notes: readonly PianoRollNoteVisual[]
  readonly widthCssPixel: number
}

export interface PianoRollNoteRenderer {
  clear(): void
  dispose(): void
  render(scene: PianoRollNoteScene): void
}

export interface CreatePianoRollNoteRendererInput {
  readonly container: HTMLElement
  readonly devicePixelRatio?: number
}

export type PianoRollNoteRendererFactory = (
  input: CreatePianoRollNoteRendererInput,
) => PianoRollNoteRenderer
