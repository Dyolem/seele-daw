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
import { STUDIO_DEFAULT_KEYMAP } from '@/workbench/keyboard/studio-default-keymap'
import type { StudioKeyboardKeymap } from '@/workbench/keyboard/studio-keyboard-binding'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/studio-keyboard-binding-registry'
import { createStudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'

export interface StudioActionRuntimeOptions {
  readonly bindingRegistry: StudioKeyboardBindingRegistry
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
  try {
    const keyboard = createStudioKeyboardInputRouter({
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
    return {
      actions,
      keyboard,
      ...targets,
      dispose() {
        try {
          keyboard.dispose()
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
    try {
      actions.dispose()
    } finally {
      disposeTargets()
    }
    throw cause
  }
}

export type StudioActionRuntime = ReturnType<typeof createStudioActionRuntime>
