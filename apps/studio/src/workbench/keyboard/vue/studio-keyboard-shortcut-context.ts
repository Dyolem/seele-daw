import { inject, onBeforeUnmount, type InjectionKey } from 'vue'

import type {
  StudioKeyboardShortcutCoordinator,
  StudioKeyboardShortcutDefinition,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
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

/**
 * Owns Action registrations for the current component instance.
 *
 * Vue queues `onUnmounted` after replacement component setup. Releasing globally unique Action IDs
 * in `onBeforeUnmount` prevents mutually exclusive component branches from overlapping ownership.
 */
export function useStudioKeyboardShortcutRegistration(
  keyboardShortcuts: StudioKeyboardShortcutCoordinator,
  definitions: readonly StudioKeyboardShortcutDefinition[],
): void {
  const dispose = keyboardShortcuts.register(definitions)
  onBeforeUnmount(dispose)
}
