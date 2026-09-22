import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import { onTestFinished } from 'vitest'

import {
  STUDIO_ACTION,
  createStudioActionPresentation,
  type StudioActionCompletion,
  type StudioActionDefinition,
  type StudioActionFailure,
  type StudioActionPresentation,
} from '@/workbench/actions/studio-action'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import { createStudioActionTargetSlot } from '@/workbench/actions/studio-action-target'

export interface TestActionTarget {
  execute(): StudioActionCompletion | Promise<StudioActionCompletion>
  presentation?(): StudioActionPresentation
}

export function createActionInvocationFixture() {
  const targets = createStudioActionTargetSlot<TestActionTarget>()
  const failures: StudioActionFailure[] = []
  const definition: StudioActionDefinition = {
    ...describeStudioAction(STUDIO_ACTION.PROJECT_SAVE),
    label: 'Save',
    description: 'Save the project.',
    resolve() {
      const binding = targets.current
      if (binding === null) return null
      return {
        presentation: binding.value.presentation?.() ?? createStudioActionPresentation('Save'),
        isCurrent: binding.isCurrent,
        onInvalidated: binding.onInvalidated,
        execute: () => binding.value.execute(),
      }
    },
  }
  const actions = createStudioActionCoordinator({
    definitions: [definition],
    reportFailure: (failure) => {
      failures.push(failure)
    },
  })
  onTestFinished(() => {
    actions.dispose()
    targets.dispose()
  })
  return { actions, definition, targets, failures }
}
