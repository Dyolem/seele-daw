import { inject, type InjectionKey } from 'vue'

import type { StudioKeyboardShortcutCoordinator } from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { StudioKeyboardShortcutVueError } from '@/workbench/keyboard/vue/studio-keyboard-shortcut-vue-error'

export interface StudioKeyboardShortcutVueContext {
  readonly keyboardShortcuts: StudioKeyboardShortcutCoordinator
}

export const STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY: InjectionKey<StudioKeyboardShortcutVueContext> =
  Symbol('StudioKeyboardShortcutVueContext')

/** Resolves the application-owned keyboard Action registry. */
export function useStudioKeyboardShortcuts(): StudioKeyboardShortcutVueContext {
  const context = inject(STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY, null)

  if (context === null) {
    throw new StudioKeyboardShortcutVueError(
      'missing-context',
      'Studio Keyboard Shortcut Vue Context has not been provided',
    )
  }

  return context
}
