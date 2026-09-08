import { onTestFinished } from 'vitest'

import {
  createStudioActionRuntime,
  type StudioActionRuntimeOptions,
} from '@/bootstrap/studio-action-runtime'
import { PIANO_ROLL_ACTION_TARGET_KEY } from '@/features/piano-roll/actions/piano-roll-action-context'
import { PROJECT_WORKBENCH_ACTION_TARGET_KEY } from '@/features/project-workspace/actions/project-workbench-action-context'
import type { StudioActionFailure } from '@/workbench/actions/studio-action'
import { STUDIO_ACTION_CONTEXT_KEY } from '@/workbench/actions/vue/studio-action-context'
import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'

export function createTestStudioActionRuntime(
  options: Omit<Partial<StudioActionRuntimeOptions>, 'bindingRegistry' | 'reportFailure'> = {},
) {
  const bindingRegistry = new TestStudioKeyboardBindingRegistry()
  const failures: StudioActionFailure[] = []
  const runtime = createStudioActionRuntime({
    bindingRegistry,
    isModalActive: () => false,
    ...options,
    reportFailure: (failure) => {
      failures.push(failure)
    },
  })
  onTestFinished(() => runtime.dispose())
  return {
    bindingRegistry,
    runtime,
    failures,
    provide: {
      [STUDIO_ACTION_CONTEXT_KEY as symbol]: runtime,
      [PIANO_ROLL_ACTION_TARGET_KEY as symbol]: runtime.pianoRollTarget,
      [PROJECT_WORKBENCH_ACTION_TARGET_KEY as symbol]: runtime.workbenchTarget,
    },
  }
}
