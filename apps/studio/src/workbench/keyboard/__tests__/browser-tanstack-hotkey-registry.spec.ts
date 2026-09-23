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
  it.each(['Tab', 'Shift+Tab', 'Control', 'Mod+Shift'])(
    'rejects the reserved focus key or modifier-only binding %s',
    (input) => {
      expect(validateStudioKeyboardBinding(input).valid).toBe(false)
      expect(validateStudioKeyboardBinding(input).binding).toBeNull()
    },
  )

  it.each(['mac', 'windows', 'linux'] as const)(
    'warns about canonical browser keys on %s without rejecting normal bindings',
    (platform) => {
      const physical = platform === 'mac' ? 'Meta+L' : 'Control+L'
      const registry = createBrowserTanStackHotkeyRegistry({ target: document, platform })
      expect(registry.validate(physical)).toMatchObject({
        valid: true,
        warnings: [expect.stringContaining('may not reach Studio')],
      })
      expect(registry.validate('Mod+K')).toMatchObject({ valid: true, warnings: [] })
      expect(registry.validate('Shift+Delete').valid).toBe(true)
    },
  )

  it.each(['mac', 'windows', 'linux'] as const)(
    'canonicalizes Mod to the physical modifier on %s',
    (platform) => {
      const registry = createBrowserTanStackHotkeyRegistry({ platform, target: document })
      const binding = defineStudioKeyboardBinding('Mod+S')
      const physical =
        platform === 'mac'
          ? defineStudioKeyboardBinding('Meta+S')
          : defineStudioKeyboardBinding('Control+S')
      expect(registry.identity(binding)).toBe(registry.identity(physical))
      const listener = vi.fn<(event: KeyboardEvent) => void>()
      const dispose = registry.register(binding, listener)
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 's',
          ctrlKey: platform !== 'mac',
          metaKey: platform === 'mac',
        }),
      )
      expect(listener).toHaveBeenCalledOnce()
      dispose()
    },
  )

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

  it.each(['input', 'textarea', 'select', 'contenteditable'] as const)(
    'filters %s targets even for Mod and Escape bindings',
    (kind) => {
      const registry = createBrowserTanStackHotkeyRegistry({
        platform: 'windows',
        target: document,
      })
      const save = vi.fn<(event: KeyboardEvent) => void>()
      const escape = vi.fn<(event: KeyboardEvent) => void>()
      const disposeSave = registry.register(defineStudioKeyboardBinding('Mod+S'), save)
      const disposeEscape = registry.register(defineStudioKeyboardBinding('Escape'), escape)
      const input = document.createElement(kind === 'contenteditable' ? 'div' : kind)
      if (kind === 'contenteditable') input.setAttribute('contenteditable', 'true')
      document.body.append(input)
      input.focus()
      const target =
        kind === 'contenteditable' ? input.appendChild(document.createElement('span')) : input
      if (kind === 'contenteditable') {
        // JSDOM lacks the browser's inherited isContentEditable property.
        Object.defineProperty(target, 'isContentEditable', { value: true })
      }

      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          ctrlKey: true,
          key: 's',
        }),
      )
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Escape',
        }),
      )

      expect(save).not.toHaveBeenCalled()
      expect(escape).not.toHaveBeenCalled()
      disposeSave()
      disposeEscape()
    },
  )

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
