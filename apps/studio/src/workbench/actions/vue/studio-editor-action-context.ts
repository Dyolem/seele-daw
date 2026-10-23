import { onBeforeUnmount, watch, type WatchSource } from 'vue'

import type { StudioContextBinding } from '@/workbench/actions/studio-context-registry'
import {
  EDITOR_SELECTION_CONTEXT,
  INTERACTION_CONTEXT,
  type StudioEditorSelectionTarget,
  type StudioInteractionTarget,
} from '@/workbench/actions/studio-editor-actions'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'

/** Focus selects a capability. Mounting another surface never steals that selection target. */
export function useStudioEditorSelectionTarget(
  target: StudioEditorSelectionTarget,
  identity: readonly WatchSource[],
) {
  const { contexts } = useStudioActions()
  let binding: StudioContextBinding<StudioEditorSelectionTarget> | null = null
  let release: (() => void) | null = null
  function activate(): void {
    if (binding?.isCurrent()) return
    release?.()
    release = contexts.bind(EDITOR_SELECTION_CONTEXT, target)
    binding = contexts.current(EDITOR_SELECTION_CONTEXT)
  }
  const stop = watch(
    identity,
    () => {
      const wasCurrent = binding?.isCurrent() ?? false
      release?.()
      binding = null
      release = null
      if (wasCurrent || target.isFocused()) activate()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    stop()
    release?.()
  })
  return {
    activate,
    get binding() {
      return binding
    },
  }
}

/** A live gesture owns Cancel independently of the last focused selection. */
export function useStudioInteractionTarget(target: StudioInteractionTarget): void {
  const { contexts } = useStudioActions()
  let release: (() => void) | null = null
  function cancelActive(): void {
    try {
      if (target.isActive()) target.cancel()
    } catch (cause) {
      // A failed consumer must not prevent another Surface or the runtime from releasing ownership.
      console.error('Studio interaction cleanup failed', cause)
    }
  }
  const stop = watch(
    target.isActive,
    (active) => {
      // Ownership follows active transitions, not each reactive Preview update.
      release?.()
      release = null
      if (!active) return
      const unbind = contexts.bind(INTERACTION_CONTEXT, target)
      const unsubscribe = contexts.current(INTERACTION_CONTEXT)?.onInvalidated(cancelActive)
      release = () => {
        unsubscribe?.()
        unbind()
      }
    },
    { flush: 'sync', immediate: true },
  )
  onBeforeUnmount(() => {
    stop()
    release?.()
    cancelActive()
  })
}
