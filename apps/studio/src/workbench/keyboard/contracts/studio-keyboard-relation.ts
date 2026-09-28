import type { StudioActionId } from '@/workbench/actions/studio-action'
import type { StudioKeyboardBinding } from './studio-keyboard-binding'

export interface StudioKeyboardRelation {
  readonly kind: 'conflict' | 'exclusive' | 'priority'
  readonly priorityActionId: StudioActionId | null
  readonly binding: StudioKeyboardBinding
  readonly actionIds: readonly [StudioActionId, StudioActionId]
}
