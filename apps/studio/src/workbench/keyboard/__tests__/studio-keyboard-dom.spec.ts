import { HotkeyManager } from '@tanstack/hotkeys'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import {
  STUDIO_ACTION_COMPLETED,
  defineStudioContext,
  type StudioActionCompletion,
  type StudioActionFailure,
} from '@/workbench/actions/studio-action'
import { STUDIO_ACTIONS, type StudioActionId } from '@/workbench/actions/studio-actions'
import { createStudioContextRegistry } from '@/workbench/actions/studio-context-registry'
import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser/browser-tanstack-hotkey-registry'
import { createStudioKeyboardInputRouter } from '@/workbench/keyboard/runtime/studio-keyboard-input-router'
import { createTestUserKeymapStorage } from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'
import {
  ARRANGEMENT_BAR_CONTEXT,
  ARRANGEMENT_CLIP_CONTEXT,
} from '@/features/project-workspace/actions/arrangement-keyboard-actions'
import {
  EDITOR_SELECTION_CONTEXT,
  INTERACTION_CONTEXT,
} from '@/workbench/actions/studio-editor-actions'
import { INTERFACE_CONTEXT } from '@/workbench/actions/studio-interface-actions'

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
  it('opens settings with the default Option+K even when macOS produces an alternate character', () => {
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document, platform: 'mac' }),
      userKeymapStorage: createTestUserKeymapStorage(),
      isModalActive: () => false,
      reportFailure: () => {},
    })
    onTestFinished(() => runtime.dispose())
    const show = vi.fn<() => void>()
    runtime.contexts.bind(INTERFACE_CONTEXT, { focusNotifications: () => {}, showShortcuts: show })
    expect(press(document.body, '˚', { code: 'KeyK', altKey: true }).defaultPrevented).toBe(true)
    expect(show).toHaveBeenCalledOnce()
  })

  it.each(['mac', 'windows', 'linux'] as const)(
    'reassigns canonical physical conflicts on %s, preserving unrelated aliases',
    (platform) => {
      const runtime = createStudioActionRuntime({
        bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document, platform }),
        userKeymapStorage: createTestUserKeymapStorage(),
        isModalActive: () => false,
        reportFailure: () => {},
      })
      onTestFinished(() => runtime.dispose())
      const physical = platform === 'mac' ? 'Meta+Shift+Z' : 'Control+Shift+Z'
      const review = runtime.userKeymap.inspectBindings('project.save', [physical])
      expect(review.conflicts).toHaveLength(1)
      expect(
        runtime.userKeymap.reassignBindings('project.save', [physical], runtime.userKeymap.state),
      ).toEqual({ status: 'saved' })
      expect(runtime.keyboard.bindingsFor('history.redo')).toEqual(['Control+Y'])
    },
  )

  it('keeps widget arrows and input keys owned by controls after a user rebinds a matching Action', () => {
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document }),
      userKeymapStorage: createTestUserKeymapStorage(),
      isModalActive: () => false,
      reportFailure: () => {},
    })
    onTestFinished(() => runtime.dispose())
    const focus = vi.fn<() => void>()
    runtime.contexts.bind(INTERFACE_CONTEXT, { focusNotifications: focus, showShortcuts: () => {} })
    expect(runtime.userKeymap.setBindings('notifications.focus', ['ArrowRight'])).toEqual({
      status: 'saved',
    })
    const slider = document.body.appendChild(document.createElement('div'))
    slider.setAttribute('role', 'slider')
    expect(press(slider, 'ArrowRight').defaultPrevented).toBe(false)
    expect(focus).not.toHaveBeenCalled()
    expect(press(document.body, 'ArrowRight').defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
  })

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
    runtime.contexts.bind(INTERFACE_CONTEXT, { focusNotifications: focus, showShortcuts: () => {} })
    expect(runtime.userKeymap.setBindings('notifications.focus', ['Mod+K'])).toEqual({
      status: 'saved',
    })
    expect(runtime.keyboard.displayBindingsFor('notifications.focus')).toEqual(['⌘ K'])
    expect(press(document.body, 'F8').defaultPrevented).toBe(false)
    expect(press(document.body, 'k', { metaKey: true }).defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
    expect(runtime.userKeymap.setBindings('shortcuts.show', ['Meta+K'])).toMatchObject({
      status: 'rejected',
      code: 'validation',
    })
    expect(
      runtime.userKeymap.setBindings('notifications.focus', ['Mod+K', 'Meta+K']),
    ).toMatchObject({ status: 'rejected', code: 'validation' })
    expect(storage.writes).toHaveLength(1)
    expect(storage.read()).toContain('Mod+K')
    expect(runtime.userKeymap.setBindings('notifications.focus', ['Meta+K'])).toEqual({
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
            'editor.selection.delete': ['Escape'],
            'editor.selection.clear': ['Backspace'],
          },
        }),
      ),
      isModalActive: () => false,
      reportFailure: () => {},
    })
    onTestFinished(() => runtime.dispose())
    const remove = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const clear = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    runtime.contexts.bind(EDITOR_SELECTION_CONTEXT, {
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
    const contexts = createStudioContextRegistry()
    const anywhere = defineStudioContext<null>({
      id: 'test',
      label: 'Test',
      priority: 1,
      isActive: () => true,
    })
    contexts.bind(anywhere, null)
    const actions = createStudioActionCoordinator({
      // The declared keys and repeat policy, with a handler that only records the call.
      actions: STUDIO_ACTIONS.filter(
        ({ id }) => id === 'playback.toggle' || id === 'history.undo',
      ).map((action) => ({
        ...action,
        context: anywhere,
        resolve: () => ({ execute: () => run(action.id) }),
      })),
      contexts,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    const keyboard = createStudioKeyboardInputRouter({
      actions,
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document, platform: 'mac' }),
      keymap: {},
      isContextActive: () => true,
      isModalActive: () => false,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    onTestFinished(() => {
      keyboard.dispose()
      actions.dispose()
      contexts.dispose()
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
    expect(run).toHaveBeenCalledExactlyOnceWith('playback.toggle')
    press(document.body, 'z', { metaKey: true })
    press(document.body, 'z', { metaKey: true, repeat: true })
    expect(run.mock.calls.filter(([id]) => id === 'history.undo')).toHaveLength(2)
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
    runtime.contexts.bind(ARRANGEMENT_CLIP_CONTEXT, {
      isFocused: () => document.activeElement === clip,
      execute: open,
    })
    runtime.contexts.bind(ARRANGEMENT_BAR_CONTEXT, {
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
    runtime.contexts.bind(EDITOR_SELECTION_CONTEXT, {
      isFocused: () => false,
      hasSelection: () => true,
      selectionLabel: () => 'Notes',
      deleteSelection: clear,
      clearSelection: clear,
    })
    runtime.contexts.bind(INTERACTION_CONTEXT, { isActive: () => true, cancel })
    expect(press(document.body, 'Escape').defaultPrevented).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
  })
})
