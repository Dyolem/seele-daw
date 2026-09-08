import {
  STUDIO_ACTION,
  type StudioActionId,
  type StudioActionFailure,
} from '@/workbench/actions/studio-action'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type {
  StudioKeyboardBinding,
  StudioKeyboardBindingValidation,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'
import type {
  StudioKeyboardBindingRegistry,
  StudioKeyboardDispose,
} from '@/workbench/keyboard/studio-keyboard-binding-registry'
import { createStudioKeyboardKeymap } from '@/workbench/keyboard/studio-default-keymap'

export type StudioKeyboardScope = 'global' | 'workbench' | 'editor' | 'interaction'

const SCOPE_PRIORITY = { global: 0, workbench: 1, editor: 2, interaction: 3 } as const
const ACTION_SCOPES: Readonly<Record<StudioActionId, StudioKeyboardScope>> = {
  [STUDIO_ACTION.HISTORY_REDO]: 'workbench',
  [STUDIO_ACTION.HISTORY_UNDO]: 'workbench',
  [STUDIO_ACTION.PIANO_ROLL_INTERACTION_CANCEL]: 'interaction',
  [STUDIO_ACTION.PIANO_ROLL_SELECTION_CLEAR]: 'editor',
  [STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE]: 'editor',
  [STUDIO_ACTION.PLAYBACK_TOGGLE]: 'workbench',
  [STUDIO_ACTION.PROJECT_SAVE]: 'workbench',
}

export interface StudioKeyboardInputRouter {
  bindingsFor(actionId: StudioActionId): readonly StudioKeyboardBinding[]
  displayBindingsFor(actionId: StudioActionId): readonly string[]
  validateBindingInput(input: string): StudioKeyboardBindingValidation
  suspend(): StudioKeyboardDispose
  dispose(): void
}

export interface StudioKeyboardInputRouterOptions {
  readonly actions: StudioActionCoordinator
  readonly bindingRegistry: StudioKeyboardBindingRegistry
  readonly keymap: StudioKeyboardKeymap<StudioActionId>
  readonly isModalActive: () => boolean
  readonly isScopeActive: (scope: StudioKeyboardScope) => boolean
  readonly reportFailure: (failure: StudioActionFailure) => void
}

/** Resolves input ownership before invoking the input-independent Action executor. */
export function createStudioKeyboardInputRouter(
  options: StudioKeyboardInputRouterOptions,
): StudioKeyboardInputRouter {
  const keymap = createStudioKeyboardKeymap(options.keymap)
  const routes = new Map<string, { binding: StudioKeyboardBinding; actionIds: StudioActionId[] }>()
  const releases: StudioKeyboardDispose[] = []
  const suspended = new Set<symbol>()
  let disposed = false
  for (const { actionId } of options.actions.catalogue) {
    for (const binding of keymap[actionId]) {
      const identity = options.bindingRegistry.identity(binding)
      let route = routes.get(identity)
      if (route === undefined) {
        route = { binding, actionIds: [] }
        routes.set(identity, route)
      }
      if (route.actionIds.includes(actionId)) continue
      if (route.actionIds.some((id) => ACTION_SCOPES[id] === ACTION_SCOPES[actionId])) {
        throw new Error(`Ambiguous keyboard binding in ${ACTION_SCOPES[actionId]}: ${binding}`)
      }
      route.actionIds.push(actionId)
    }
  }

  function reportResolutionFailure(actionId: StudioActionId | undefined, cause: unknown): void {
    if (actionId === undefined) return
    try {
      options.reportFailure(
        Object.freeze({ actionId, source: 'keyboard', operation: 'resolve', cause }),
      )
    } catch (reportCause) {
      console.error('Studio keyboard failure reporting failed', reportCause)
    }
  }

  function dispatch(actionIds: readonly StudioActionId[], event: KeyboardEvent): void {
    if (
      disposed ||
      suspended.size > 0 ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229
    )
      return
    try {
      // Modal ownership is a barrier even when the modal has no matching Action.
      if (options.isModalActive()) return
    } catch (cause) {
      reportResolutionFailure(actionIds[0], cause)
      return
    }
    for (const actionId of actionIds) {
      try {
        // Only query the matching scope: a broken editor must not disable Workbench Save.
        if (!options.isScopeActive(ACTION_SCOPES[actionId])) continue
        const invocation = options.actions.invoke(actionId, 'keyboard')
        if (invocation.status === 'unavailable') continue
      } catch (cause) {
        reportResolutionFailure(actionId, cause)
      }
      // Input acceptance is independent of eventual business success, including sync failures.
      event.preventDefault()
      event.stopPropagation()
      return
    }
  }

  try {
    for (const route of routes.values()) {
      route.actionIds.sort(
        (a, b) => SCOPE_PRIORITY[ACTION_SCOPES[b]] - SCOPE_PRIORITY[ACTION_SCOPES[a]],
      )
      releases.push(
        options.bindingRegistry.register(route.binding, (event) =>
          dispatch(route.actionIds, event),
        ),
      )
    }
  } catch (cause) {
    for (const release of releases.reverse()) release()
    throw cause
  }
  return {
    bindingsFor: (actionId) => keymap[actionId],
    displayBindingsFor: (actionId) =>
      Object.freeze(
        keymap[actionId].map((binding) => options.bindingRegistry.formatForDisplay(binding)),
      ),
    validateBindingInput: (input) => options.bindingRegistry.validate(input),
    suspend() {
      const owner = Symbol('keyboard-input-owner')
      if (!disposed) suspended.add(owner)
      return () => {
        suspended.delete(owner)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      suspended.clear()
      for (const release of releases.reverse()) release()
      releases.length = 0
    },
  }
}
