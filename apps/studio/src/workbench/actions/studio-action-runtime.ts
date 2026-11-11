import type { ComputedRef } from 'vue'

import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioContextRegistry } from '@/workbench/actions/studio-context-registry'
import type {
  StudioKeyboardInput,
  StudioShortcutRecorder,
  StudioUserKeymap,
  StudioUserKeymapState,
} from '@/workbench/keyboard'

/**
 * The action catalogue with its keyboard input. The composition root creates one for the
 * application; views only bind their context targets and read the keymap.
 */
export interface StudioActionRuntime {
  readonly actions: StudioActionCoordinator
  readonly contexts: StudioContextRegistry
  readonly keyboard: StudioKeyboardInput
  readonly keymapState: ComputedRef<StudioUserKeymapState>
  readonly shortcutRecorder: StudioShortcutRecorder
  readonly userKeymap: StudioUserKeymap
  dispose(): void
}
