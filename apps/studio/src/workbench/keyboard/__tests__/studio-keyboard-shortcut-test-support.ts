import type {
  StudioKeyboardBindingRegistry,
  StudioKeyboardShortcutDispose,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'

export class TestStudioKeyboardBindingRegistry
  implements StudioKeyboardBindingRegistry
{
  readonly listeners = new Map<string, (event: KeyboardEvent) => void>()
  readonly registrationCountByBinding = new Map<string, number>()
  readonly disposalCountByBinding = new Map<string, number>()

  dispatch(
    binding: string,
    init: KeyboardEventInit = {},
  ): KeyboardEvent {
    const listener = this.listeners.get(binding)
    if (listener === undefined) {
      throw new Error(`No test keyboard listener is registered for ${binding}`)
    }
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...init,
    })
    listener(event)
    return event
  }

  formatForDisplay(binding: string): string {
    return `display:${binding}`
  }

  register(
    binding: string,
    listener: (event: KeyboardEvent) => void,
  ): StudioKeyboardShortcutDispose {
    if (this.listeners.has(binding)) {
      throw new Error(`Duplicate test keyboard binding: ${binding}`)
    }
    this.listeners.set(binding, listener)
    this.registrationCountByBinding.set(
      binding,
      (this.registrationCountByBinding.get(binding) ?? 0) + 1,
    )

    let active = true
    return () => {
      if (!active) return
      active = false
      this.listeners.delete(binding)
      this.disposalCountByBinding.set(
        binding,
        (this.disposalCountByBinding.get(binding) ?? 0) + 1,
      )
    }
  }
}
