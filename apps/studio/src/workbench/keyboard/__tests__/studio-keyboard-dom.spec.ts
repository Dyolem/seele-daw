import { HotkeyManager } from '@tanstack/hotkeys'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  createStudioActionPresentation,
  type StudioActionId,
  type StudioActionCompletion,
  type StudioActionFailure,
} from '@/workbench/actions/studio-action'
import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import { createStudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'
import { createStudioKeyboardKeymap } from '@/workbench/keyboard/studio-default-keymap'
import { createTestUserKeymapStorage } from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'

afterEach(() => {
  HotkeyManager.resetInstance()
  document.body.replaceChildren()
})

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
  target.dispatchEvent(event)
  return event
}

describe('Studio DOM keyboard ownership', () => {
  it('rebinds live input with portable Mod and rejects canonical platform collisions', () => {
    const storage = createTestUserKeymapStorage()
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document, platform: 'mac' }),
      userKeymapStorage: storage,
      isModalActive: () => false,
      reportFailure: () => {},
    })
    onTestFinished(() => runtime.dispose())
    const focus = vi.fn<() => void>()
    runtime.interfaceTarget.bind({ focusNotifications: focus, showShortcuts: () => {} })
    expect(runtime.userKeymap.setBindings(STUDIO_ACTION.NOTIFICATIONS_FOCUS, ['Mod+K'])).toEqual({
      status: 'saved',
    })
    expect(runtime.keyboard.displayBindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual(['⌘ K'])
    expect(press(document.body, 'F8').defaultPrevented).toBe(false)
    expect(press(document.body, 'k', { metaKey: true }).defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
    expect(runtime.userKeymap.setBindings(STUDIO_ACTION.SHORTCUTS_SHOW, ['Meta+K'])).toMatchObject({
      status: 'rejected',
      code: 'validation',
    })
    expect(
      runtime.userKeymap.setBindings(STUDIO_ACTION.NOTIFICATIONS_FOCUS, ['Mod+K', 'Meta+K']),
    ).toMatchObject({ status: 'rejected', code: 'validation' })
    expect(storage.writes).toHaveLength(1)
    expect(storage.read()).toContain('Mod+K')
    expect(runtime.userKeymap.setBindings(STUDIO_ACTION.NOTIFICATIONS_FOCUS, ['Meta+K'])).toEqual({
      status: 'saved',
    })
    expect(press(document.body, 'k', { metaKey: true }).defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledTimes(2)
  })

  it('reuses registrations during a loaded key swap and resolves callbacks against the new routes', () => {
    const registry = createBrowserTanStackHotkeyRegistry({ target: document, platform: 'mac' })
    const register = vi.spyOn(registry, 'register')
    const runtime = createStudioActionRuntime({
      bindingRegistry: registry,
      userKeymapStorage: createTestUserKeymapStorage(
        JSON.stringify({
          version: 1,
          overrides: {
            [STUDIO_ACTION.EDITOR_SELECTION_DELETE]: ['Escape'],
            [STUDIO_ACTION.EDITOR_SELECTION_CLEAR]: ['Backspace'],
          },
        }),
      ),
      isModalActive: () => false,
      reportFailure: () => {},
    })
    onTestFinished(() => runtime.dispose())
    const remove = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const clear = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    runtime.selectionTarget.bind({
      isFocused: () => true,
      hasSelection: () => true,
      selectionLabel: () => 'Notes',
      deleteSelection: remove,
      clearSelection: clear,
    })
    expect(press(document.body, 'Escape').defaultPrevented).toBe(true)
    expect(remove).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    expect(press(document.body, 'Backspace').defaultPrevented).toBe(true)
    expect(clear).toHaveBeenCalledOnce()
    expect(press(document.body, 'Delete').defaultPrevented).toBe(false)
    expect(register.mock.calls.filter(([binding]) => binding === 'Escape')).toHaveLength(1)
    expect(register.mock.calls.filter(([binding]) => binding === 'Backspace')).toHaveLength(1)
  })

  it('preserves native button Space, filters fields and IME, and applies per-Action repeat policy', () => {
    const run = vi.fn<(actionId: StudioActionId) => void>()
    const actions = createStudioActionCoordinator({
      definitions: [STUDIO_ACTION.PLAYBACK_TOGGLE, STUDIO_ACTION.HISTORY_UNDO].map((actionId) => ({
        ...describeStudioAction(actionId),
        resolve: () => ({
          presentation: createStudioActionPresentation(actionId),
          isCurrent: () => true,
          onInvalidated: () => () => {},
          execute: () => {
            run(actionId)
            return STUDIO_ACTION_COMPLETED
          },
        }),
      })),
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    const keyboard = createStudioKeyboardInputRouter({
      actions,
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document, platform: 'mac' }),
      keymap: createStudioKeyboardKeymap(),
      isContextActive: () => true,
      isModalActive: () => false,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    onTestFinished(() => {
      keyboard.dispose()
      actions.dispose()
    })
    const button = document.body.appendChild(document.createElement('button'))
    const icon = button.appendChild(document.createElement('span'))
    const input = document.body.appendChild(document.createElement('input'))
    expect(press(icon, ' ').defaultPrevented).toBe(false)
    press(input, ' ')
    press(document.body, ' ', { isComposing: true })
    expect(run).not.toHaveBeenCalled()
    expect(press(document.body, ' ').defaultPrevented).toBe(true)
    expect(press(document.body, ' ', { repeat: true }).defaultPrevented).toBe(true)
    expect(run).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PLAYBACK_TOGGLE)
    press(document.body, 'z', { metaKey: true })
    press(document.body, 'z', { metaKey: true, repeat: true })
    expect(run.mock.calls.filter(([id]) => id === STUDIO_ACTION.HISTORY_UNDO)).toHaveLength(2)
  })

  it('routes Enter to the focused Clip or bar and never both, including native button targets', () => {
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document }),
      isModalActive: () => false,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    onTestFinished(() => runtime.dispose())
    const clip = document.body.appendChild(document.createElement('button'))
    const bar = document.body.appendChild(document.createElement('button'))
    const open = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const create = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    runtime.arrangementClipTarget.bind({
      isFocused: () => document.activeElement === clip,
      execute: open,
    })
    runtime.arrangementBarTarget.bind({
      isFocused: () => document.activeElement === bar,
      execute: create,
    })
    clip.focus()
    expect(press(clip, 'Enter').defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    bar.focus()
    expect(press(bar, 'Enter').defaultPrevented).toBe(true)
    press(bar, 'Enter', { repeat: true })
    expect(create).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
  })

  it('cancels an active gesture after focus moves, without falling through to selection clearing', () => {
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document }),
      isModalActive: () => false,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    onTestFinished(() => runtime.dispose())
    const clear = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const cancel = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    runtime.selectionTarget.bind({
      isFocused: () => false,
      hasSelection: () => true,
      selectionLabel: () => 'Notes',
      deleteSelection: clear,
      clearSelection: clear,
    })
    runtime.interactionTarget.bind({ isActive: () => true, cancel })
    expect(press(document.body, 'Escape').defaultPrevented).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
  })
})
