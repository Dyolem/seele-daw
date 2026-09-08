import {
  createPianoRollActions,
  type PianoRollActionTarget,
} from '@/features/piano-roll/actions/piano-roll-actions'
import {
  createProjectWorkbenchActions,
  type ProjectWorkbenchActionTarget,
} from '@/features/project-workspace/actions/project-workbench-actions'
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

/** One application catalogue and one physical keymap outlive all mounted editing surfaces. */
export function createStudioActionRuntime(options: StudioActionRuntimeOptions) {
  const workbenchTarget = createStudioActionTargetSlot<ProjectWorkbenchActionTarget>()
  const pianoRollTarget = createStudioActionTargetSlot<PianoRollActionTarget>()
  const actions = createStudioActionCoordinator({
    definitions: [
      ...createProjectWorkbenchActions(workbenchTarget),
      ...createPianoRollActions(pianoRollTarget),
    ],
    reportFailure: options.reportFailure,
  })
  try {
    const keyboard = createStudioKeyboardInputRouter({
      actions,
      bindingRegistry: options.bindingRegistry,
      keymap: options.keymap ?? STUDIO_DEFAULT_KEYMAP,
      reportFailure: options.reportFailure,
      isModalActive: options.isModalActive,
      isScopeActive(scope) {
        if (scope === 'global') return true
        if (scope === 'workbench') return workbenchTarget.current?.value.getReadyProject() != null
        const editor = pianoRollTarget.current?.value
        if (!(editor?.isFocused() ?? false)) return false
        return scope === 'editor' || (editor?.hasInteraction() ?? false)
      },
    })
    return {
      actions,
      keyboard,
      workbenchTarget,
      pianoRollTarget,
      dispose() {
        try {
          keyboard.dispose()
        } finally {
          actions.dispose()
          pianoRollTarget.dispose()
          workbenchTarget.dispose()
        }
      },
    }
  } catch (cause) {
    actions.dispose()
    pianoRollTarget.dispose()
    workbenchTarget.dispose()
    throw cause
  }
}

export type StudioActionRuntime = ReturnType<typeof createStudioActionRuntime>
