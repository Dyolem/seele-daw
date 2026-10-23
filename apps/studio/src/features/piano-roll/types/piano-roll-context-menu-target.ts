import type { StudioEditorSelectionTarget } from '@/workbench/actions/studio-editor-actions'
import type { StudioContextBinding } from '@/workbench/actions/studio-context-registry'

/** The editor supplies both the current capability and its stable focus surface. */
export interface PianoRollContextMenuTarget {
  readonly binding: StudioContextBinding<StudioEditorSelectionTarget>
  readonly focusElement: HTMLElement
}
