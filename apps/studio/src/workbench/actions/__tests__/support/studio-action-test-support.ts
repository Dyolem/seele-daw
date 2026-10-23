import { onTestFinished } from 'vitest'
import { provideTestStudioServices } from '@/__tests__/support/studio-services-test-support'
import {
  createStudioActionRuntime,
  type StudioActionRuntimeOptions,
} from '@/bootstrap/studio-action-runtime'
import type { StudioActionFailure } from '@/workbench/actions/studio-action'
import {
  TestStudioKeyboardBindingRegistry,
  createTestUserKeymapStorage,
} from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'

export function createTestStudioActionRuntime(
  options: Omit<Partial<StudioActionRuntimeOptions>, 'bindingRegistry' | 'reportFailure'> = {},
) {
  const bindingRegistry = new TestStudioKeyboardBindingRegistry()
  const failures: StudioActionFailure[] = []
  const storage = createTestUserKeymapStorage()
  const runtime = createStudioActionRuntime({
    bindingRegistry,
    isModalActive: () => false,
    ...options,
    userKeymapStorage: options.userKeymapStorage ?? storage,
    reportFailure: (failure) => {
      failures.push(failure)
    },
  })
  onTestFinished(() => runtime.dispose())
  return {
    bindingRegistry,
    storage,
    runtime,
    failures,
    /** Provides only the action services; tests needing more call `provideTestStudioServices`. */
    provide: provideTestStudioServices({ actions: runtime }),
  }
}
