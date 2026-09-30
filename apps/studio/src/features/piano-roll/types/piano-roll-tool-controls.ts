import type { StudioActionControl } from '@/workbench/actions/studio-action-control'
import type { PianoRollGridPreset, PianoRollTool } from './piano-roll-preferences'

export interface PianoRollToolControlsPresentation {
  readonly cursor: StudioActionControl
  readonly pencil: StudioActionControl
  readonly snap: StudioActionControl
}

export interface PianoRollToolControlsProps {
  readonly activeTool: PianoRollTool
  readonly controls: PianoRollToolControlsPresentation
  readonly gridPreset: PianoRollGridPreset
  readonly snapEnabled: boolean
}
