import type { PianoRollActionTarget } from '@/features/piano-roll/actions/piano-roll-actions'
import type { StudioActionTargetBinding } from '@/workbench/actions/studio-action-target'

/** The editor supplies both the current capability and its stable focus surface. */
export interface PianoRollContextMenuTarget {
  readonly binding: StudioActionTargetBinding<PianoRollActionTarget>
  readonly focusElement: HTMLElement
}
