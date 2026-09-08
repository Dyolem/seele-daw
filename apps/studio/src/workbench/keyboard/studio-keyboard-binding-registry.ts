import type {
  StudioKeyboardBinding,
  StudioKeyboardBindingValidation,
} from '@/workbench/keyboard/studio-keyboard-binding'

export type StudioKeyboardDispose = () => void

export interface StudioKeyboardBindingRegistry {
  identity(binding: StudioKeyboardBinding): string
  formatForDisplay(binding: StudioKeyboardBinding): string
  register(
    binding: StudioKeyboardBinding,
    listener: (event: KeyboardEvent) => void,
  ): StudioKeyboardDispose
  validate(input: string): StudioKeyboardBindingValidation
}
