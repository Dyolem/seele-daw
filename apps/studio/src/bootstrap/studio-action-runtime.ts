import {
  createStudioEditorActions,
  type StudioEditorSelectionTarget,
  type StudioInteractionTarget,
} from '@/workbench/actions/studio-editor-actions'
import {
  createProjectWorkbenchActions,
  type ProjectWorkbenchActionTarget,
} from '@/features/project-workspace/actions/project-workbench-actions'
import {
  createArrangementKeyboardActions,
  type ArrangementKeyboardTarget,
} from '@/features/project-workspace/actions/arrangement-keyboard-actions'
import {
  createPianoRollToolActions,
  type PianoRollToolActionTarget,
} from '@/features/piano-roll/actions/piano-roll-tool-actions'
import {
  createStudioInterfaceActions,
  type StudioInterfaceActionTarget,
} from '@/workbench/actions/studio-interface-actions'
import type { StudioActionFailure, StudioActionId } from '@/workbench/actions/studio-action'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import { createStudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
import { createBrowserStudioShortcutRecorder } from '@/workbench/keyboard/browser-tanstack-hotkey-recorder'
import { createStudioUserKeymap } from '@/workbench/keyboard/studio-user-keymap'
import { createStudioKeyboardVueBinding } from '@/workbench/keyboard/vue/studio-keyboard-vue-binding'
import {
  createBrowserUserKeymapStorage,
  type StudioUserKeymapStorage,
} from '@/workbench/keyboard/browser-user-keymap-storage'
import { STUDIO_DEFAULT_KEYMAP } from '@/workbench/keyboard/studio-default-keymap'
import type { StudioKeyboardKeymap } from '@/workbench/keyboard/studio-keyboard-binding'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/studio-keyboard-binding-registry'
import { createStudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'

export interface StudioActionRuntimeOptions {
  readonly bindingRegistry: StudioKeyboardBindingRegistry
  readonly userKeymapStorage?: StudioUserKeymapStorage
  readonly isModalActive: () => boolean
  readonly keymap?: StudioKeyboardKeymap<StudioActionId>
  readonly reportFailure: (failure: StudioActionFailure) => void
}

/** The catalogue outlives views; selection focus and active interaction have separate owners. */
export function createStudioActionRuntime(options: StudioActionRuntimeOptions) {
  const workbenchTarget = createStudioActionTargetSlot<ProjectWorkbenchActionTarget>()
  const selectionTarget = createStudioActionTargetSlot<StudioEditorSelectionTarget>()
  const interactionTarget = createStudioActionTargetSlot<StudioInteractionTarget>()
  const arrangementClipTarget = createStudioActionTargetSlot<ArrangementKeyboardTarget>()
  const arrangementBarTarget = createStudioActionTargetSlot<ArrangementKeyboardTarget>()
  const pianoRollToolTarget = createStudioActionTargetSlot<PianoRollToolActionTarget>()
  const interfaceTarget = createStudioActionTargetSlot<StudioInterfaceActionTarget>()
  const targets = {
    workbenchTarget,
    selectionTarget,
    interactionTarget,
    arrangementClipTarget,
    arrangementBarTarget,
    pianoRollToolTarget,
    interfaceTarget,
  }
  const actions = createStudioActionCoordinator({
    definitions: [
      ...createProjectWorkbenchActions(workbenchTarget),
      ...createStudioEditorActions(selectionTarget, interactionTarget),
      ...createArrangementKeyboardActions(arrangementClipTarget, arrangementBarTarget),
      ...createPianoRollToolActions(pianoRollToolTarget),
      ...createStudioInterfaceActions(interfaceTarget),
    ],
    reportFailure: options.reportFailure,
  })
  function disposeTargets(): void {
    for (const target of Object.values(targets)) target.dispose()
  }
  let keyboard: ReturnType<typeof createStudioKeyboardInputRouter> | null = null
  try {
    keyboard = createStudioKeyboardInputRouter({
      actions,
      bindingRegistry: options.bindingRegistry,
      keymap: options.keymap ?? STUDIO_DEFAULT_KEYMAP,
      reportFailure: options.reportFailure,
      isModalActive: options.isModalActive,
      isContextActive(context) {
        switch (context) {
          case 'global':
            return true
          case 'workbench':
            return workbenchTarget.current?.value.getReadyProject() != null
          case 'editor-selection':
            return selectionTarget.current?.value.isFocused() ?? false
          case 'interaction':
            return interactionTarget.current?.value.isActive() ?? false
          case 'piano-roll':
            return pianoRollToolTarget.current?.value.isFocused() ?? false
          case 'arrangement-clip':
            return arrangementClipTarget.current?.value.isFocused() ?? false
          case 'arrangement-bar':
            return arrangementBarTarget.current?.value.isFocused() ?? false
        }
      },
    })
    const ownedKeyboard = keyboard
    const userKeymap = createStudioUserKeymap({
      catalogue: actions.catalogue,
      registry: options.bindingRegistry,
      router: keyboard,
      storage: options.userKeymapStorage ?? createBrowserUserKeymapStorage(),
    })
    const keyboardBinding = createStudioKeyboardVueBinding(keyboard, userKeymap)
    const shortcutRecorder = createBrowserStudioShortcutRecorder(keyboardBinding.keyboard)
    return {
      shortcutRecorder,
      actions,
      keyboard: keyboardBinding.keyboard,
      userKeymap,
      keymapState: keyboardBinding.keymapState,
      ...targets,
      dispose() {
        try {
          shortcutRecorder.dispose()
          keyboardBinding.dispose()
          userKeymap.dispose()
          ownedKeyboard.dispose()
        } finally {
          try {
            actions.dispose()
          } finally {
            disposeTargets()
          }
        }
      },
    }
  } catch (cause) {
    keyboard?.dispose()
    try {
      actions.dispose()
    } finally {
      disposeTargets()
    }
    throw cause
  }
}

export type StudioActionRuntime = ReturnType<typeof createStudioActionRuntime>
