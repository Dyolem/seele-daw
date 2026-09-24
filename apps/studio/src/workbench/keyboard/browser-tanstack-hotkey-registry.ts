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

// Advisory matches describe known browser/OS assignments, not guaranteed event delivery.
const BROWSER_SHORTCUTS: Readonly<Record<string, string>> = Object.freeze({
  'Mod+Shift+C': 'open Developer Tools / Inspect Element',
  'Mod+L': 'focus the address bar',
  'Mod+K': 'search from the address bar',
  'Mod+N': 'open a new window',
  'Mod+T': 'open a new tab',
  'Mod+W': 'close the current tab',
  'Mod+R': 'reload the page',
  'Mod+O': 'open a file',
  'Mod+P': 'print the page',
  'Mod+Shift+N': 'open a private window',
  'Mod+Shift+T': 'reopen a closed tab',
  'Mod+Shift+W': 'close the current window',
  'Mod+Shift+R': 'reload without cached content',
  'Mod+Shift+M': 'open browser profile options',
  'Control+Tab': 'switch to the next tab',
  'Control+Shift+Tab': 'switch to the previous tab',
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [`Mod+${i + 1}`, 'switch browser tabs']),
  ),
})
const PLATFORM_SHORTCUTS = Object.freeze({
  mac: {
    'Mod+Alt+I': 'open Developer Tools',
    'Mod+Alt+J': 'open the developer console',
    'Mod+Alt+C': 'open Developer Tools / Inspect Element',
    'Mod+Alt+B': 'open the bookmark manager',
    'Mod+Alt+Shift+I': 'open browser feedback',
    'Mod+Shift+I': 'compose an email with a link to this page',
    'Mod+Shift+J': 'open downloads',
    'Mod+Alt+M': 'minimize all application windows',
    'Mod+,': 'open browser settings',
    'Mod+Q': 'quit the application',
    'Mod+Space': 'open Spotlight',
    'Mod+Tab': 'switch applications',
    'Control+Space': 'switch input sources',
  },
  other: {
    'Mod+Shift+I': 'open Developer Tools',
    'Mod+Shift+J': 'open the developer console',
    'Mod+Shift+O': 'open the bookmark manager',
    'Alt+Shift+I': 'open browser feedback',
    F12: 'open Developer Tools',
    F1: 'open browser help',
    F5: 'reload the page',
    F11: 'toggle browser fullscreen',
    'Control+F5': 'reload without cached content',
    'Alt+F4': 'close the current window',
    'Alt+Tab': 'switch applications',
    'Alt+Space': 'open the system window menu',
  },
})

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
    const knownShortcuts = {
      ...BROWSER_SHORTCUTS,
      ...(platform === 'mac' ? PLATFORM_SHORTCUTS.mac : PLATFORM_SHORTCUTS.other),
    }
    const known = Object.entries(knownShortcuts).find(
      ([key]) => normalizeHotkey(key, platform) === identity,
    )
    if (known)
      warnings.push(
        `${formatForDisplay(normalizedInput, { platform })} is commonly used by Chrome / Chromium or the operating system to ${known[1]}. It may be handled before Studio receives it. Choose another combination for reliable access.`,
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
