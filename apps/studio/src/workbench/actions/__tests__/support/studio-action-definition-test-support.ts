import { onTestFinished } from 'vitest'

import {
  defineStudioAction,
  defineStudioContext,
  type StudioActionCompletion,
  type StudioActionFailure,
  type StudioActionState,
} from '@/workbench/actions/studio-action'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import { createStudioContextRegistry } from '@/workbench/actions/studio-context-registry'

export interface TestActionTarget {
  execute(): StudioActionCompletion | Promise<StudioActionCompletion>
  state?(): Omit<StudioActionState, 'execute'>
}

const TEST_CONTEXT = defineStudioContext<TestActionTarget>({
  id: 'test',
  label: 'Test',
  priority: 0,
  isActive: () => true,
})

/** One Save action bound to whatever target the test supplies. */
export function createActionInvocationFixture() {
  const contexts = createStudioContextRegistry()
  const failures: StudioActionFailure[] = []
  const action = defineStudioAction({
    id: 'project.save',
    context: TEST_CONTEXT,
    label: 'Save',
    description: 'Save the project.',
    category: 'project',
    resolve: (target) => ({ ...target.state?.(), execute: () => target.execute() }),
  })
  const actions = createStudioActionCoordinator({
    actions: [action],
    contexts,
    reportFailure: (failure) => {
      failures.push(failure)
    },
  })
  onTestFinished(() => {
    actions.dispose()
    contexts.dispose()
  })
  return {
    action,
    actions,
    contexts,
    failures,
    targets: {
      bind: (target: TestActionTarget) => contexts.bind(TEST_CONTEXT, target),
      get current() {
        return contexts.current(TEST_CONTEXT)
      },
    },
  }
}
