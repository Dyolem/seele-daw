import { HotkeyManager } from '@tanstack/hotkeys'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBrowserTanStackHotkeyRegistry,
  parseStudioKeyboardBinding,
  validateStudioKeyboardBinding,
} from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'

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
    const saveBinding = defineStudioKeyboardBinding('Mod+S')
    const dispose = registry.register(saveBinding, listener)
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 's',
      metaKey: true,
    })

    document.body.dispatchEvent(event)

    expect(listener).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.defaultPrevented).toBe(false)
    expect(registry.formatForDisplay(saveBinding)).toContain('S')

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
    const disposeSave = registry.register(
      defineStudioKeyboardBinding('Mod+S'),
      save,
    )
    const disposeEscape = registry.register(
      defineStudioKeyboardBinding('Escape'),
      escape,
    )
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

  it('validates dynamic Settings input before it becomes a Binding', () => {
    const lowerCaseKey = validateStudioKeyboardBinding(' k ')
    const invalid = validateStudioKeyboardBinding('Mod++S')

    expect(lowerCaseKey).toEqual({
      binding: 'k',
      errors: [],
      input: ' k ',
      valid: true,
      warnings: [],
    })
    expect(Object.isFrozen(lowerCaseKey)).toBe(true)
    expect(Object.isFrozen(lowerCaseKey.errors)).toBe(true)
    expect(Object.isFrozen(lowerCaseKey.warnings)).toBe(true)
    expect(invalid).toEqual({
      binding: null,
      errors: ['Invalid hotkey format: empty parts detected'],
      input: 'Mod++S',
      valid: false,
      warnings: [],
    })
    expect(() => parseStudioKeyboardBinding('Mod++S')).toThrowError(
      expect.objectContaining({ code: 'invalid-binding' }),
    )
    expect(HotkeyManager.getInstance().getRegistrationCount()).toBe(0)
  })
})
