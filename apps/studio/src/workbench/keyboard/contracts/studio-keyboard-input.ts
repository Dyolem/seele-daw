import type { StudioActionId } from '@/workbench/actions/studio-action'
import type {
  StudioKeyboardBinding,
  StudioKeyboardBindingValidation,
  StudioKeyboardKeymap,
} from './studio-keyboard-binding'
import type { StudioKeyboardDispose } from './studio-keyboard-binding-registry'

/** Consumer access to effective bindings and temporary ownership of keyboard input. */
export interface StudioKeyboardInput {
  readonly keymap: StudioKeyboardKeymap<StudioActionId>
  bindingsFor(actionId: StudioActionId): readonly StudioKeyboardBinding[]
  displayBindingsFor(actionId: StudioActionId): readonly string[]
  formatBinding(binding: StudioKeyboardBinding): string
  validateBindingInput(input: string): StudioKeyboardBindingValidation
  suspend(): StudioKeyboardDispose
}
