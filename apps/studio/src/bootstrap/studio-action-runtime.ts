import { DisposalStack } from '@/bootstrap/disposal-stack'
import type { StudioActionFailure } from '@/workbench/actions/studio-action'
import { STUDIO_ACTIONS } from '@/bootstrap/studio-actions'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioActionRuntime } from '@/workbench/actions/studio-action-runtime'
import { createStudioContextRegistry } from '@/workbench/actions/studio-context-registry'
import {
  createBrowserStudioShortcutRecorder,
  createBrowserUserKeymapStorage,
  createStudioKeyboardInputRouter,
  createStudioKeyboardVueBinding,
  createStudioUserKeymap,
  type StudioKeyboardBindingRegistry,
  type StudioKeyboardKeymapOverrides,
  type StudioUserKeymapStorage,
} from '@/workbench/keyboard/setup'

export interface StudioActionRuntimeOptions {
  readonly bindingRegistry: StudioKeyboardBindingRegistry
  readonly userKeymapStorage?: StudioUserKeymapStorage
  readonly isModalActive: () => boolean
  /** Replaces declared default bindings, e.g. to free a key in a test. */
  readonly keymap?: StudioKeyboardKeymapOverrides
  readonly reportFailure: (failure: StudioActionFailure) => void
}

/** The catalogue and keyboard input outlive views; views only bind their context targets. */
export function createStudioActionRuntime(options: StudioActionRuntimeOptions) {
  const stack = new DisposalStack()
  try {
    const contexts = stack.own(createStudioContextRegistry())
    const actions = stack.own(
      createStudioActionCoordinator({
        actions: STUDIO_ACTIONS,
        contexts,
        reportFailure: options.reportFailure,
      }),
    )
    const router = stack.own(
      createStudioKeyboardInputRouter({
        actions,
        bindingRegistry: options.bindingRegistry,
        keymap: options.keymap ?? {},
        reportFailure: options.reportFailure,
        isModalActive: options.isModalActive,
        isContextActive: (context) => contexts.isActive(context),
      }),
    )
    const userKeymap = stack.own(
      createStudioUserKeymap({
        catalogue: actions.catalogue,
        registry: options.bindingRegistry,
        router,
        storage: options.userKeymapStorage ?? createBrowserUserKeymapStorage(),
      }),
    )
    const keyboardBinding = stack.own(createStudioKeyboardVueBinding(router, userKeymap))
    const shortcutRecorder = stack.own(
      createBrowserStudioShortcutRecorder(keyboardBinding.keyboard),
    )
    return {
      actions,
      contexts,
      keyboard: keyboardBinding.keyboard,
      keymapState: keyboardBinding.keymapState,
      shortcutRecorder,
      userKeymap,
      dispose: () => stack.dispose(),
    } satisfies StudioActionRuntime
  } catch (cause) {
    stack.dispose()
    throw cause
  }
}
