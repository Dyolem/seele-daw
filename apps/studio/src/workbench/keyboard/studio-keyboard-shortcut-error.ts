export type StudioKeyboardShortcutErrorCode =
  | 'action-already-registered'
  | 'coordinator-disposed'
  | 'invalid-action'
  | 'scope-binding-conflict'

export interface StudioKeyboardShortcutErrorDetails {
  readonly actionId?: string
  readonly binding?: string
}

/** Stable application failures raised before a shortcut becomes active. */
export class StudioKeyboardShortcutError extends Error {
  readonly actionId: string | null
  readonly binding: string | null
  readonly code: StudioKeyboardShortcutErrorCode

  constructor(
    code: StudioKeyboardShortcutErrorCode,
    message: string,
    details: StudioKeyboardShortcutErrorDetails = {},
  ) {
    super(message)
    this.name = 'StudioKeyboardShortcutError'
    this.actionId = details.actionId ?? null
    this.binding = details.binding ?? null
    this.code = code
  }
}
