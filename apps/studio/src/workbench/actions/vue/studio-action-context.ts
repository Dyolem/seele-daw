import { inject, onBeforeUnmount, watch, type InjectionKey, type ComputedRef } from 'vue'

import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInput } from '@/workbench/keyboard/studio-keyboard-input-router'

import type {
  StudioUserKeymap,
  StudioUserKeymapState,
} from '@/workbench/keyboard/studio-user-keymap'

import type { StudioShortcutRecorder } from '@/workbench/keyboard/browser-tanstack-hotkey-recorder'

export interface StudioActionVueContext {
  readonly shortcutRecorder: StudioShortcutRecorder
  readonly userKeymap: StudioUserKeymap
  readonly keymapState: ComputedRef<StudioUserKeymapState>
  readonly actions: StudioActionCoordinator
  readonly keyboard: StudioKeyboardInput
}

export const STUDIO_ACTION_CONTEXT_KEY: InjectionKey<StudioActionVueContext> =
  Symbol('StudioActionVueContext')

export function useStudioActions(): StudioActionVueContext {
  const context = inject(STUDIO_ACTION_CONTEXT_KEY, null)
  if (context === null) throw new Error('Studio Action Context has not been provided')
  return context
}

/** Reka owns keyboard interaction while its menu or dialog is open. */
export function useStudioKeyboardLayer(isOpen: () => boolean): void {
  const context = inject(STUDIO_ACTION_CONTEXT_KEY, null)
  let release: (() => void) | null = null
  watch(
    isOpen,
    (open) => {
      release?.()
      release = open ? (context?.keyboard.suspend() ?? null) : null
    },
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => release?.())
}
