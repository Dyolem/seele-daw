export type StudioKeyboardShortcutVueErrorCode = 'missing-context'

/** Raised when shortcut capabilities are requested outside the Studio application tree. */
export class StudioKeyboardShortcutVueError extends Error {
  readonly code: StudioKeyboardShortcutVueErrorCode

  constructor(code: StudioKeyboardShortcutVueErrorCode, message: string) {
    super(message)
    this.name = 'StudioKeyboardShortcutVueError'
    this.code = code
  }
}
