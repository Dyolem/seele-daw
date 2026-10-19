import type { StudioActionCompletion } from '@/workbench/actions/studio-action'

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
