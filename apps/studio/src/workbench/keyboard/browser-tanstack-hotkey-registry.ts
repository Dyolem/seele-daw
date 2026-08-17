import {
  formatForDisplay,
  getHotkeyManager,
  validateHotkey,
  type Hotkey,
  type HotkeyManager,
} from '@tanstack/hotkeys'

import { StudioKeyboardShortcutError } from '@/workbench/keyboard/studio-keyboard-shortcut-error'

import type {
  StudioKeyboardBinding,
  StudioKeyboardBindingValidation,
} from '@/workbench/keyboard/studio-keyboard-binding'
import type {
  StudioKeyboardBindingRegistry,
  StudioKeyboardShortcutDispose,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'

export type StudioKeyboardPlatform = 'linux' | 'mac' | 'windows'

export interface CreateBrowserTanStackHotkeyRegistryInput {
  readonly manager?: Pick<HotkeyManager, 'register'>
  readonly platform?: StudioKeyboardPlatform
  readonly target: Document
}

/** Validates dynamic Settings input without exposing TanStack result types to UI. */
export function validateStudioKeyboardBinding(input: string): StudioKeyboardBindingValidation {
  const normalizedInput = input.trim()
  const validation = validateHotkey(normalizedInput)
  const valid = validation.valid && normalizedInput.length > 0

  return Object.freeze({
    binding: valid ? (normalizedInput as StudioKeyboardBinding) : null,
    errors: Object.freeze([...validation.errors]),
    input,
    valid,
    warnings: Object.freeze([...validation.warnings]),
  })
}

/** Parses dynamic input after a Settings UI has had a chance to show validation. */
export function parseStudioKeyboardBinding(input: string): StudioKeyboardBinding {
  const validation = validateStudioKeyboardBinding(input)
  if (validation.binding !== null) return validation.binding

  throw new StudioKeyboardShortcutError(
    'invalid-binding',
    `Invalid Studio keyboard binding: ${validation.errors.join(', ')}`,
    { binding: input },
  )
}

class BrowserTanStackHotkeyRegistry implements StudioKeyboardBindingRegistry {
  readonly #manager: Pick<HotkeyManager, 'register'>
  readonly #platform: StudioKeyboardPlatform | undefined
  readonly #target: Document

  constructor(input: CreateBrowserTanStackHotkeyRegistryInput) {
    this.#manager = input.manager ?? getHotkeyManager()
    this.#platform = input.platform
    this.#target = input.target
  }

  formatForDisplay(binding: StudioKeyboardBinding): string {
    return formatForDisplay(binding as Hotkey, {
      platform: this.#platform,
    })
  }

  register(
    binding: StudioKeyboardBinding,
    listener: (event: KeyboardEvent) => void,
  ): StudioKeyboardShortcutDispose {
    const handle = this.#manager.register(binding as Hotkey, (event) => listener(event), {
      conflictBehavior: 'error',
      ignoreInputs: true,
      platform: this.#platform,
      // The Coordinator prevents only after an enabled Action reports handled.
      preventDefault: false,
      stopPropagation: false,
      target: this.#target,
    })
    return () => handle.unregister()
  }

  validate(input: string): StudioKeyboardBindingValidation {
    return validateStudioKeyboardBinding(input)
  }
}

/** Isolates the alpha TanStack API behind Seele DAW's stable Binding Registry. */
export function createBrowserTanStackHotkeyRegistry(
  input: CreateBrowserTanStackHotkeyRegistryInput,
): StudioKeyboardBindingRegistry {
  return new BrowserTanStackHotkeyRegistry(input)
}
