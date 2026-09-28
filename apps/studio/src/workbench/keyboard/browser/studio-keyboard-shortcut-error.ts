export type StudioKeyboardShortcutErrorCode = 'invalid-binding'

export interface StudioKeyboardShortcutErrorDetails {
  readonly binding?: string
}

/** Stable application failures raised before a shortcut becomes active. */
export class StudioKeyboardShortcutError extends Error {
  readonly binding: string | null
  readonly code: StudioKeyboardShortcutErrorCode

  constructor(
    code: StudioKeyboardShortcutErrorCode,
    message: string,
    details: StudioKeyboardShortcutErrorDetails = {},
  ) {
    super(message)
    this.name = 'StudioKeyboardShortcutError'
    this.binding = details.binding ?? null
    this.code = code
  }
}
