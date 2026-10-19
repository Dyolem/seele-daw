import { STUDIO_EDITOR_ACTION_CONTEXT_KEY } from '@/symbols'
import { inject, onBeforeUnmount, watch, type WatchSource } from 'vue'
import type {
  StudioEditorSelectionTarget,
  StudioInteractionTarget,
} from '@/workbench/actions/studio-editor-actions'
import type {
  StudioActionTargetBinding,
  StudioActionTargetSlot,
} from '@/workbench/actions/studio-action-target'

export interface StudioEditorActionContext {
  readonly selectionTarget: StudioActionTargetSlot<StudioEditorSelectionTarget>
  readonly interactionTarget: StudioActionTargetSlot<StudioInteractionTarget>
}

export function useStudioEditorActionTargets(): StudioEditorActionContext {
  const targets = inject(STUDIO_EDITOR_ACTION_CONTEXT_KEY, null)
  if (targets === null) throw new Error('Studio editor Action targets have not been provided')
  return targets
}

/** Focus selects a capability. Mounting another surface never steals that selection target. */
export function useStudioEditorSelectionTarget(
  target: StudioEditorSelectionTarget,
  identity: readonly WatchSource[],
) {
  const { selectionTarget } = useStudioEditorActionTargets()
  let binding: StudioActionTargetBinding<StudioEditorSelectionTarget> | null = null
  let release: (() => void) | null = null
  function activate(): void {
    if (binding?.isCurrent()) return
    release?.()
    release = selectionTarget.bind(target)
    binding = selectionTarget.current
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
  const { interactionTarget } = useStudioEditorActionTargets()
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
      const unbind = interactionTarget.bind(target)
      const unsubscribe = interactionTarget.current?.onInvalidated(cancelActive)
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
