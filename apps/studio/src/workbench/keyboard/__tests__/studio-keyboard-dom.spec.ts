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
