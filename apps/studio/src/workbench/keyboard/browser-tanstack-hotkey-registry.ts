import {
  assertValidHotkey,
  formatForDisplay,
  getHotkeyManager,
  type Hotkey,
  type HotkeyManager,
} from '@tanstack/hotkeys'

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

class BrowserTanStackHotkeyRegistry implements StudioKeyboardBindingRegistry {
  readonly #manager: Pick<HotkeyManager, 'register'>
  readonly #platform: StudioKeyboardPlatform | undefined
  readonly #target: Document

  constructor(input: CreateBrowserTanStackHotkeyRegistryInput) {
    this.#manager = input.manager ?? getHotkeyManager()
    this.#platform = input.platform
    this.#target = input.target
  }

  formatForDisplay(binding: string): string {
    assertValidHotkey(binding)
    return formatForDisplay(binding as Hotkey, {
      platform: this.#platform,
    })
  }

  register(
    binding: string,
    listener: (event: KeyboardEvent) => void,
  ): StudioKeyboardShortcutDispose {
    assertValidHotkey(binding)
    const handle = this.#manager.register(
      binding as Hotkey,
      (event) => listener(event),
      {
        conflictBehavior: 'error',
        ignoreInputs: true,
        platform: this.#platform,
        // The Coordinator prevents only after an enabled Action reports handled.
        preventDefault: false,
        stopPropagation: false,
        target: this.#target,
      },
    )
    return () => handle.unregister()
  }
}

/** Isolates the alpha TanStack API behind Seele DAW's stable Binding Registry. */
export function createBrowserTanStackHotkeyRegistry(
  input: CreateBrowserTanStackHotkeyRegistryInput,
): StudioKeyboardBindingRegistry {
  return new BrowserTanStackHotkeyRegistry(input)
}
