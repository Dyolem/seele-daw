import { createKeyboardInputOwner } from '@/symbols'
import { type StudioActionId, type StudioActionFailure } from '@/workbench/actions/studio-action'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type {
  StudioKeyboardBinding,
  StudioKeyboardBindingValidation,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/contracts/studio-keyboard-binding'
import type { StudioKeyboardInput } from '@/workbench/keyboard/contracts/studio-keyboard-input'
import type {
  StudioKeyboardBindingRegistry,
  StudioKeyboardDispose,
} from '@/workbench/keyboard/contracts/studio-keyboard-binding-registry'
import {
  createStudioKeyboardKeymap,
  STUDIO_SHORTCUT_POLICIES,
} from '@/workbench/keyboard/keymap/studio-default-keymap'
import { type StudioKeyboardContext } from '@/workbench/keyboard/keymap/studio-keyboard-context'
import { analyzeStudioKeyboardRoutes } from '@/workbench/keyboard/keymap/studio-keyboard-routes'
import { isWidgetOwnedKeyboardInput } from '@/workbench/keyboard/runtime/browser-keyboard-ownership'

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
class StudioKeyboardInputRouterImpl implements StudioKeyboardInputRouter {
  readonly #options: StudioKeyboardInputRouterOptions
  readonly #registrations = new Map<string, StudioKeyboardDispose>()
  readonly #suspended = new Set<symbol>()
  #keymap: StudioKeyboardKeymap<StudioActionId>
  #routes: ReturnType<typeof analyzeStudioKeyboardRoutes>['routes']
  #replacing = false
  #disposed = false

  constructor(options: StudioKeyboardInputRouterOptions) {
    this.#options = options
    this.#keymap = createStudioKeyboardKeymap(options.keymap)
    this.#routes = analyzeStudioKeyboardRoutes(
      options.actions.catalogue,
      this.#keymap,
      options.bindingRegistry,
    ).routes
  }

  get keymap(): StudioKeyboardKeymap<StudioActionId> {
    return this.#keymap
  }

  // Public capabilities remain bound when passed through Vue or used as callbacks.
  readonly bindingsFor = (actionId: StudioActionId): readonly StudioKeyboardBinding[] =>
    this.#keymap[actionId]

  readonly displayBindingsFor = (actionId: StudioActionId): readonly string[] =>
    Object.freeze(this.#keymap[actionId].map(this.formatBinding))

  readonly formatBinding = (binding: StudioKeyboardBinding): string =>
    this.#options.bindingRegistry.formatForDisplay(binding)

  readonly validateBindingInput = (input: string): StudioKeyboardBindingValidation =>
    this.#options.bindingRegistry.validate(input)

  readonly replaceKeymap = (
    candidate: StudioKeyboardKeymap<StudioActionId>,
    persist: () => void,
    publish: () => void = () => {},
  ): void => {
    if (this.#disposed) throw new Error('The keyboard router has been disposed.')
    if (this.#replacing) throw new Error('A keymap replacement is already in progress.')
    const nextKeymap = createStudioKeyboardKeymap(candidate)
    const next = analyzeStudioKeyboardRoutes(
      this.#options.actions.catalogue,
      nextKeymap,
      this.#options.bindingRegistry,
    )
    if (next.conflicts.length)
      throw new Error('Ambiguous keyboard binding in overlapping contexts.')
    const prepared = new Map<string, StudioKeyboardDispose>()
    this.#replacing = true
    try {
      try {
        for (const [identity, route] of next.routes) {
          if (this.#registrations.has(identity)) continue
          // Callbacks resolve the published route by identity; swaps reuse physical registrations.
          prepared.set(
            identity,
            this.#options.bindingRegistry.register(route.binding, (event) =>
              this.#dispatch(this.#routes.get(identity)?.actionIds ?? [], event),
            ),
          )
        }
        persist()
      } catch (cause) {
        for (const release of [...prepared.values()].reverse()) this.#releaseRegistration(release)
        throw cause
      }
      this.#keymap = nextKeymap
      this.#routes = next.routes
      for (const [identity, release] of prepared) this.#registrations.set(identity, release)
      // Publication cannot reject a committed record; the owner isolates subscriber failures.
      publish()
      for (const [identity, release] of this.#registrations) {
        if (this.#routes.has(identity)) continue
        this.#registrations.delete(identity)
        this.#releaseRegistration(release)
      }
    } finally {
      this.#replacing = false
    }
  }

  readonly suspend = (): StudioKeyboardDispose => {
    const owner = createKeyboardInputOwner()
    if (!this.#disposed) this.#suspended.add(owner)
    return () => {
      this.#suspended.delete(owner)
    }
  }

  readonly dispose = (): void => {
    if (this.#disposed) return
    this.#disposed = true
    this.#suspended.clear()
    for (const release of [...this.#registrations.values()].reverse())
      this.#releaseRegistration(release)
    this.#registrations.clear()
  }

  #releaseRegistration(release: StudioKeyboardDispose): void {
    try {
      release()
    } catch (cause) {
      // A cleanup failure cannot undo a persisted map; removed routes no longer dispatch.
      console.error('Studio keyboard registration cleanup failed', cause)
    }
  }

  #reportResolutionFailure(actionId: StudioActionId | undefined, cause: unknown): void {
    if (actionId === undefined) return
    try {
      this.#options.reportFailure(
        Object.freeze({ actionId, source: 'keyboard', operation: 'resolve', cause }),
      )
    } catch (reportCause) {
      console.error('Studio keyboard failure reporting failed', reportCause)
    }
  }

  #dispatch(actionIds: readonly StudioActionId[], event: KeyboardEvent): void {
    if (
      this.#disposed ||
      this.#replacing ||
      this.#suspended.size > 0 ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229
    )
      return
    try {
      // Modal ownership is a barrier even when the modal has no matching Action.
      if (this.#options.isModalActive()) return
    } catch (cause) {
      this.#reportResolutionFailure(actionIds[0], cause)
      return
    }
    for (const actionId of actionIds) {
      try {
        // Only query the matching scope: a broken editor must not disable Workbench Save.
        const policy = STUDIO_SHORTCUT_POLICIES[actionId]
        if (
          !this.#options.isContextActive(policy.context) ||
          isWidgetOwnedKeyboardInput(event, policy.context)
        )
          continue
        if (event.repeat && !policy.allowRepeat) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const invocation = this.#options.actions.invoke(actionId, 'keyboard')
        if (invocation.status === 'unavailable') continue
      } catch (cause) {
        this.#reportResolutionFailure(actionId, cause)
      }
      // Input acceptance is independent of eventual business success, including sync failures.
      event.preventDefault()
      event.stopPropagation()
      return
    }
  }
}

/** Activates physical registrations before publishing the fully constructed input capability. */
export function createStudioKeyboardInputRouter(
  options: StudioKeyboardInputRouterOptions,
): StudioKeyboardInputRouter {
  const router = new StudioKeyboardInputRouterImpl(options)
  router.replaceKeymap(router.keymap, () => {})
  return router
}
