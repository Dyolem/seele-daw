import { HotkeyManager } from '@tanstack/hotkeys'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser-tanstack-hotkey-registry'

afterEach(() => {
  HotkeyManager.resetInstance()
  document.body.replaceChildren()
})

describe('BrowserTanStackHotkeyRegistry', () => {
  it('matches cross-platform Mod while leaving handled policy to the Coordinator', () => {
    const registry = createBrowserTanStackHotkeyRegistry({
      platform: 'mac',
      target: document,
    })
    const listener = vi.fn<(event: KeyboardEvent) => void>()
    const dispose = registry.register('Mod+S', listener)
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 's',
      metaKey: true,
    })

    document.body.dispatchEvent(event)

    expect(listener).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.defaultPrevented).toBe(false)
    expect(registry.formatForDisplay('Mod+S')).toContain('S')

    dispose()
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 's',
        metaKey: true,
      }),
    )
    expect(listener).toHaveBeenCalledOnce()
  })

  it('filters editable targets even for Mod and Escape bindings', () => {
    const registry = createBrowserTanStackHotkeyRegistry({
      platform: 'windows',
      target: document,
    })
    const save = vi.fn<(event: KeyboardEvent) => void>()
    const escape = vi.fn<(event: KeyboardEvent) => void>()
    const disposeSave = registry.register('Mod+S', save)
    const disposeEscape = registry.register('Escape', escape)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        ctrlKey: true,
        key: 's',
      }),
    )
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Escape',
      }),
    )

    expect(save).not.toHaveBeenCalled()
    expect(escape).not.toHaveBeenCalled()
    disposeSave()
    disposeEscape()
  })

  it('rejects invalid bindings before installing a listener', () => {
    const registry = createBrowserTanStackHotkeyRegistry({
      target: document,
    })

    expect(() =>
      registry.register('Mod++S', vi.fn<(event: KeyboardEvent) => void>()),
    ).toThrow('Invalid hotkey')
    expect(HotkeyManager.getInstance().getRegistrationCount()).toBe(0)
  })
})
