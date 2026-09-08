import { inject, onBeforeUnmount, watch, type InjectionKey } from 'vue'

import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'

export interface StudioActionVueContext {
  readonly actions: StudioActionCoordinator
  readonly keyboard: StudioKeyboardInputRouter
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
