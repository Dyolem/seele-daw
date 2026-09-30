import type {
  ClipId,
  MidiChannel,
  MidiControlValue,
  ModelRevision,
  Tick,
} from '@seele-daw/project-core'
import type { StudioActionCompletion } from '@/workbench/actions/studio-action'

export interface PianoRollSustainPedalLanePlacement {
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly modelRevision: ModelRevision
  readonly timelineTick: Tick
  readonly value: MidiControlValue
}

/** Public capabilities exposed by a lane; parents do not depend on its Vue component instance. */
export interface PianoRollSustainPedalLaneHandle {
  cancelInteraction(): StudioActionCompletion
  clearSelection(): StudioActionCompletion
  hasCancellableInteraction(): boolean
  hasSelection(): boolean
  isFocused(): boolean
  prepareContextMenu(event: MouseEvent): HTMLElement | null
  removeSelectedEvents(): StudioActionCompletion
}
