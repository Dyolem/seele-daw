import { inject, onBeforeUnmount, watch } from 'vue'

import type { StudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import { STUDIO_SERVICES_KEY, useStudio } from '@/workbench/studio-services'

export function useStudioActions(): Omit<StudioActionRuntime, 'dispose'> {
  return useStudio().actions
}

/** Reka owns keyboard interaction while its menu or dialog is open. */
export function useStudioKeyboardLayer(isOpen: () => boolean): void {
  const services = inject(STUDIO_SERVICES_KEY, null)
  let release: (() => void) | null = null
  watch(
    isOpen,
    (open) => {
      release?.()
      release = open ? (services?.actions.keyboard.suspend() ?? null) : null
    },
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => release?.())
}
