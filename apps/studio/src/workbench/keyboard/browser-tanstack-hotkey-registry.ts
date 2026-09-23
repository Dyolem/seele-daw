import {
  formatForDisplay,
  detectPlatform,
  hasNonModifierKey,
  parseHotkey,
  getHotkeyManager,
  normalizeHotkey,
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
  StudioKeyboardDispose,
} from '@/workbench/keyboard/studio-keyboard-binding-registry'

export type StudioKeyboardPlatform = 'linux' | 'mac' | 'windows'

export interface CreateBrowserTanStackHotkeyRegistryInput {
  readonly manager?: Pick<HotkeyManager, 'register'>
  readonly platform?: StudioKeyboardPlatform
  readonly target: Document
}

/** Validates dynamic Settings input without exposing TanStack result types to UI. */
export function validateStudioKeyboardBinding(
  input: string,
  platform: StudioKeyboardPlatform = detectPlatform(),
): StudioKeyboardBindingValidation {
  const normalizedInput = input.trim()
  const validation = validateHotkey(normalizedInput)
  const errors = [...validation.errors]
  const warnings = [...validation.warnings]
  if (validation.valid) {
    if (!hasNonModifierKey(normalizedInput, platform))
      errors.push('Choose a key together with the modifier, such as Mod+K.')
    const parsed = parseHotkey(normalizedInput, platform)
    if (parsed.key === 'Tab' && !parsed.ctrl && !parsed.alt && !parsed.meta)
      errors.push('Tab and Shift+Tab are reserved for moving focus between controls.')
    const identity = normalizeHotkey(normalizedInput, platform)
    // Advisory only: browser/OS shortcuts differ, and some key events never reach the page.
    const browserKeys = [
      'Mod+L',
      'Mod+N',
      'Mod+T',
      'Mod+W',
      'Mod+R',
      'Mod+Shift+N',
      'Mod+Shift+T',
      'Mod+Shift+W',
      'Mod+Shift+R',
      'Control+Tab',
      'Control+Shift+Tab',
    ]
    if (platform === 'mac') browserKeys.push('Mod+Q', 'Mod+Space')
    else browserKeys.push('Alt+F4', 'F5', 'F11')
    if (browserKeys.some((key) => normalizeHotkey(key, platform) === identity))
      warnings.push(
        'This combination is commonly used by the browser or operating system and may not reach Studio. Consider another shortcut.',
      )
  }
  const valid = errors.length === 0 && normalizedInput.length > 0

  return Object.freeze({
    binding: valid ? (normalizedInput as StudioKeyboardBinding) : null,
    errors: Object.freeze(errors),
    input,
    valid,
    warnings: Object.freeze(warnings),
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

  identity(binding: StudioKeyboardBinding): string {
    return normalizeHotkey(binding as Hotkey, this.#platform)
  }

  register(
    binding: StudioKeyboardBinding,
    listener: (event: KeyboardEvent) => void,
  ): StudioKeyboardDispose {
    const handle = this.#manager.register(binding as Hotkey, (event) => listener(event), {
      conflictBehavior: 'error',
      ignoreInputs: true,
      platform: this.#platform,
      // The input router prevents only after an Action accepts the invocation.
      preventDefault: false,
      stopPropagation: false,
      target: this.#target,
    })
    return () => handle.unregister()
  }

  validate(input: string): StudioKeyboardBindingValidation {
    return validateStudioKeyboardBinding(input, this.#platform)
  }
}

/** Isolates the alpha TanStack API behind Seele DAW's stable Binding Registry. */
export function createBrowserTanStackHotkeyRegistry(
  input: CreateBrowserTanStackHotkeyRegistryInput,
): StudioKeyboardBindingRegistry {
  return new BrowserTanStackHotkeyRegistry(input)
}
