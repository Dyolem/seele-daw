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
import { type StudioKeyboardContext } from '@/workbench/keyboard/studio-keyboard-context'
import { analyzeStudioKeyboardRoutes } from '@/workbench/keyboard/studio-keyboard-routes'
import { isWidgetOwnedKeyboardInput } from '@/workbench/keyboard/browser-keyboard-ownership'

export interface StudioKeyboardInput {
  readonly keymap: StudioKeyboardKeymap<StudioActionId>
  bindingsFor(actionId: StudioActionId): readonly StudioKeyboardBinding[]
  displayBindingsFor(actionId: StudioActionId): readonly string[]
  formatBinding(binding: StudioKeyboardBinding): string
  validateBindingInput(input: string): StudioKeyboardBindingValidation
  suspend(): StudioKeyboardDispose
}

export interface StudioKeyboardInputRouter extends StudioKeyboardInput {
  replaceKeymap(
    keymap: StudioKeyboardKeymap<StudioActionId>,
    persist: () => void,
    publish?: () => void,
  ): void
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
  let keymap = createStudioKeyboardKeymap(options.keymap)
  let routes = analyzeStudioKeyboardRoutes(
    options.actions.catalogue,
    keymap,
    options.bindingRegistry,
  ).routes
  const registrations = new Map<string, StudioKeyboardDispose>()
  const suspended = new Set<symbol>()
  let replacing = false
  let disposed = false

  function releaseRegistration(release: StudioKeyboardDispose): void {
    try {
      release()
    } catch (cause) {
      // A cleanup failure cannot undo a persisted map; removed routes no longer dispatch.
      console.error('Studio keyboard registration cleanup failed', cause)
    }
  }

  function replaceKeymap(
    candidate: StudioKeyboardKeymap<StudioActionId>,
    persist: () => void,
    publish: () => void = () => {},
  ): void {
    if (disposed) throw new Error('The keyboard router has been disposed.')
    if (replacing) throw new Error('A keymap replacement is already in progress.')
    const nextKeymap = createStudioKeyboardKeymap(candidate)
    const next = analyzeStudioKeyboardRoutes(
      options.actions.catalogue,
      nextKeymap,
      options.bindingRegistry,
    )
    if (next.conflicts.length)
      throw new Error('Ambiguous keyboard binding in overlapping contexts.')
    const prepared = new Map<string, StudioKeyboardDispose>()
    replacing = true
    try {
      try {
        for (const [identity, route] of next.routes) {
          if (registrations.has(identity)) continue
          // Callbacks resolve the published route by identity; swaps reuse physical registrations.
          prepared.set(
            identity,
            options.bindingRegistry.register(route.binding, (event) =>
              dispatch(routes.get(identity)?.actionIds ?? [], event),
            ),
          )
        }
        persist()
      } catch (cause) {
        for (const release of [...prepared.values()].reverse()) releaseRegistration(release)
        throw cause
      }
      keymap = nextKeymap
      routes = next.routes
      for (const [identity, release] of prepared) registrations.set(identity, release)
      // Publication cannot reject a committed record; the owner isolates subscriber failures.
      publish()
      for (const [identity, release] of registrations) {
        if (routes.has(identity)) continue
        registrations.delete(identity)
        releaseRegistration(release)
      }
    } finally {
      replacing = false
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
      replacing ||
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

  replaceKeymap(keymap, () => {})
  return {
    get keymap() {
      return keymap
    },
    replaceKeymap,
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
      for (const release of [...registrations.values()].reverse()) releaseRegistration(release)
      registrations.clear()
    },
  }
}
