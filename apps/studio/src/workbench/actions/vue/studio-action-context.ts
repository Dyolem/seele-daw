import { STUDIO_SERVICES_KEY } from '@/symbols'
import { inject, onBeforeUnmount, watch, type ComputedRef } from 'vue'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import { useStudio } from '@/workbench/studio-services'
import type {
  StudioKeyboardInput,
  StudioUserKeymap,
  StudioUserKeymapState,
  StudioShortcutRecorder,
} from '@/workbench/keyboard'

export interface StudioActionVueContext {
  readonly shortcutRecorder: StudioShortcutRecorder
  readonly userKeymap: StudioUserKeymap
  readonly keymapState: ComputedRef<StudioUserKeymapState>
  readonly actions: StudioActionCoordinator
  readonly keyboard: StudioKeyboardInput
}

export function useStudioActions(): StudioActionVueContext {
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
