import { type StudioActionId, type StudioActionFailure } from '@/workbench/actions/studio-action'
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
import {
  createStudioKeyboardKeymap,
  STUDIO_SHORTCUT_POLICIES,
} from '@/workbench/keyboard/studio-default-keymap'
import {
  STUDIO_KEYBOARD_CONTEXTS,
  studioKeyboardContextsOverlap,
  type StudioKeyboardContext,
} from '@/workbench/keyboard/studio-keyboard-context'
import { isWidgetOwnedKeyboardInput } from '@/workbench/keyboard/browser-keyboard-ownership'

export interface StudioKeyboardInputRouter {
  bindingsFor(actionId: StudioActionId): readonly StudioKeyboardBinding[]
  displayBindingsFor(actionId: StudioActionId): readonly string[]
  formatBinding(binding: StudioKeyboardBinding): string
  validateBindingInput(input: string): StudioKeyboardBindingValidation
  suspend(): StudioKeyboardDispose
  dispose(): void
}

export interface StudioKeyboardInputRouterOptions {
  readonly actions: StudioActionCoordinator
  readonly bindingRegistry: StudioKeyboardBindingRegistry
  readonly keymap: StudioKeyboardKeymap<StudioActionId>
  readonly isModalActive: () => boolean
  readonly isContextActive: (context: StudioKeyboardContext) => boolean
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
      const context = STUDIO_SHORTCUT_POLICIES[actionId].context
      if (
        route.actionIds.some((id) => {
          const other = STUDIO_SHORTCUT_POLICIES[id].context
          return (
            STUDIO_KEYBOARD_CONTEXTS[other].priority ===
              STUDIO_KEYBOARD_CONTEXTS[context].priority &&
            studioKeyboardContextsOverlap(other, context)
          )
        })
      ) {
        throw new Error(`Ambiguous keyboard binding in ${context}: ${binding}`)
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
        const policy = STUDIO_SHORTCUT_POLICIES[actionId]
        if (
          !options.isContextActive(policy.context) ||
          isWidgetOwnedKeyboardInput(event, policy.context)
        )
          continue
        if (event.repeat && !policy.allowRepeat) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
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
        (a, b) =>
          STUDIO_KEYBOARD_CONTEXTS[STUDIO_SHORTCUT_POLICIES[b].context].priority -
          STUDIO_KEYBOARD_CONTEXTS[STUDIO_SHORTCUT_POLICIES[a].context].priority,
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
    formatBinding: (binding) => options.bindingRegistry.formatForDisplay(binding),
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
