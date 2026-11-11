import type { StudioActionId } from '@/workbench/actions/studio-action'
import type { StudioKeyboardKeymap } from './studio-keyboard-binding'
import type { StudioKeyboardRelation } from './studio-keyboard-relation'

export interface StudioUserKeymapIssue {
  readonly actionId: StudioActionId
  readonly message: string
}

export interface StudioUserKeymapState {
  readonly keymap: StudioKeyboardKeymap<StudioActionId>
  readonly modifiedActionIds: readonly StudioActionId[]
  readonly unknownActionIds: readonly string[]
  readonly rejectedOverrides: readonly StudioUserKeymapIssue[]
  readonly problem: Readonly<{
    code: 'invalid-record' | 'unsupported-version' | 'storage-unavailable' | 'registration-failed'
    message: string
  }> | null
  readonly canEdit: boolean
}

export type StudioUserKeymapResult =
  | { readonly status: 'saved' }
  | {
      readonly status: 'rejected'
      readonly code: 'validation' | 'storage' | 'registration' | 'unavailable'
      readonly message: string
    }

export interface StudioUserKeymapInspection {
  readonly error: string | null
  readonly relations: readonly StudioKeyboardRelation[]
  readonly conflicts: readonly StudioKeyboardRelation[]
  readonly reassignBlockedReason: string | null
}

/** Settings can inspect and update preferences; composition owns subscriptions and disposal. */
export interface StudioUserKeymap {
  readonly state: StudioUserKeymapState
  bindingsForEditing(actionId: StudioActionId): readonly string[]
  inspectBindings(actionId: StudioActionId, inputs: readonly string[]): StudioUserKeymapInspection
  setBindings(actionId: StudioActionId, inputs: readonly string[]): StudioUserKeymapResult
  reassignBindings(
    actionId: StudioActionId,
    inputs: readonly string[],
    expectedState: StudioUserKeymapState,
  ): StudioUserKeymapResult
  restoreAction(actionId: StudioActionId): StudioUserKeymapResult
  restoreAll(): StudioUserKeymapResult
}
