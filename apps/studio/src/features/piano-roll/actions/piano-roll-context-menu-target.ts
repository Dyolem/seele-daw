import type { StudioEditorSelectionTarget } from '@/workbench/actions/studio-editor-actions'
import type { StudioActionTargetBinding } from '@/workbench/actions/studio-action-target'

/** The editor supplies both the current capability and its stable focus surface. */
export interface PianoRollContextMenuTarget {
  readonly binding: StudioActionTargetBinding<StudioEditorSelectionTarget>
  readonly focusElement: HTMLElement
}
