import { HotkeyManager, HotkeyRecorder } from '@tanstack/hotkeys'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import {
  createBrowserTanStackHotkeyRegistry,
  type StudioKeyboardPlatform,
} from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import type { StudioShortcutRecordingResult } from '@/workbench/keyboard/browser-tanstack-hotkey-recorder'
import { createTestUserKeymapStorage } from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'

afterEach(() => {
  vi.restoreAllMocks()
  HotkeyManager.resetInstance()
  document.body.replaceChildren()
})

function setup(platform: StudioKeyboardPlatform = 'mac') {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(platform)
  const storage = createTestUserKeymapStorage()
  const runtime = createStudioActionRuntime({
    bindingRegistry: createBrowserTanStackHotkeyRegistry({ target: document, platform }),
    userKeymapStorage: storage,
    isModalActive: () => false,
    reportFailure: () => {},
  })
  const invoke = vi.spyOn(runtime.actions, 'invoke')
  const owner = document.body.appendChild(document.createElement('button'))
  const result = vi.fn<(result: StudioShortcutRecordingResult) => void>()
  onTestFinished(() => runtime.dispose())
  return { runtime, storage, owner, invoke, result }
}

function press(owner: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
  owner.dispatchEvent(event)
  return event
}

describe('Studio shortcut recorder', () => {
  it.each(['mac', 'windows', 'linux'] as const)(
    'records portable Mod on %s without saving or invoking an Action',
    (platform) => {
      const { runtime, owner, result, invoke, storage } = setup(platform)
      runtime.shortcutRecorder.start(owner, result)
      press(owner, platform === 'mac' ? 'Meta' : 'Control', {
        metaKey: platform === 'mac',
        ctrlKey: platform !== 'mac',
      })
      expect(result).not.toHaveBeenCalled()
      expect(
        press(owner, 's', { metaKey: platform === 'mac', ctrlKey: platform !== 'mac' })
          .defaultPrevented,
      ).toBe(true)
      expect(result).toHaveBeenCalledExactlyOnceWith({ status: 'recorded', binding: 'Mod+S' })
      expect(invoke).not.toHaveBeenCalled()
      expect(storage.writes).toEqual([])
      press(document.body, 'F8')
      expect(invoke).toHaveBeenCalledOnce()
    },
  )

  it.each(['Delete', 'Backspace'])('clears only the draft on %s and emits one result', (key) => {
    const { runtime, owner, result, invoke, storage } = setup()
    const cancel = runtime.shortcutRecorder.start(owner, result)
    expect(press(owner, key).defaultPrevented).toBe(true)
    cancel()
    expect(result).toHaveBeenCalledExactlyOnceWith({ status: 'cleared' })
    expect(invoke).not.toHaveBeenCalled()
    expect(storage.writes).toEqual([])
  })

  it('records modified Delete normally, and Escape cancels without reaching another input layer', () => {
    const { runtime, owner, result, invoke } = setup()
    const downstream = vi.fn<(event: KeyboardEvent) => void>()
    document.addEventListener('keydown', downstream)
    onTestFinished(() => document.removeEventListener('keydown', downstream))
    runtime.shortcutRecorder.start(owner, result)
    press(owner, 'Delete', { shiftKey: true })
    expect(result).toHaveBeenLastCalledWith({ status: 'recorded', binding: 'Shift+Delete' })
    runtime.shortcutRecorder.start(owner, result)
    press(owner, 'Escape')
    expect(result).toHaveBeenLastCalledWith({ status: 'cancelled' })
    expect(downstream).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('ignores composition, consumed input, AltGraph, dead keys and repeats while keeping recording active', () => {
    const { runtime, owner, result, invoke } = setup()
    runtime.shortcutRecorder.start(owner, result)
    press(owner, 'Escape', { isComposing: true })
    press(owner, 'k', { keyCode: 229 })
    press(owner, 'F8', { repeat: true })
    press(owner, 'Dead')
    press(owner, 'Process')
    press(owner, 'Unidentified')
    const consumed = new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true })
    consumed.preventDefault()
    owner.dispatchEvent(consumed)
    const altGraph = new KeyboardEvent('keydown', {
      key: '@',
      ctrlKey: true,
      altKey: true,
      bubbles: true,
    })
    vi.spyOn(altGraph, 'getModifierState').mockImplementation((key) => key === 'AltGraph')
    owner.dispatchEvent(altGraph)
    expect(result).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    press(owner, 'F8')
    expect(result).toHaveBeenCalledExactlyOnceWith({ status: 'recorded', binding: 'F8' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each(['focus', 'window-blur', 'hidden', 'dispose'] as const)(
    'cleans up recording and suspension on %s',
    (cause) => {
      const { runtime, owner, result, invoke } = setup()
      runtime.shortcutRecorder.start(owner, result)
      if (cause === 'focus') document.body.appendChild(document.createElement('input')).focus()
      if (cause === 'window-blur') window.dispatchEvent(new Event('blur'))
      if (cause === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
      }
      if (cause === 'dispose') runtime.shortcutRecorder.dispose()
      expect(result).toHaveBeenCalledExactlyOnceWith({ status: 'cancelled' })
      owner.focus()
      press(document.body, 'F8')
      expect(invoke).toHaveBeenCalledOnce()
      expect(result).toHaveBeenCalledOnce()
    },
  )

  it('preserves other modal owners and ignores stale cancellation after replacing a recording', () => {
    const { runtime, owner, result, invoke } = setup()
    const releaseModal = runtime.keyboard.suspend()
    const staleCancel = runtime.shortcutRecorder.start(owner, result)
    const nextResult = vi.fn<(result: StudioShortcutRecordingResult) => void>()
    runtime.shortcutRecorder.start(owner, nextResult)
    staleCancel()
    press(owner, 'F8')
    expect(result).toHaveBeenCalledExactlyOnceWith({ status: 'cancelled' })
    expect(nextResult).toHaveBeenCalledExactlyOnceWith({ status: 'recorded', binding: 'F8' })
    press(document.body, 'F8')
    expect(invoke).not.toHaveBeenCalled()
    releaseModal()
    press(document.body, 'F8')
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('releases a partially started recorder when the library fails, and validates captured control keys', () => {
    const { runtime, owner, result, invoke } = setup()
    const start = HotkeyRecorder.prototype.start
    const failure = vi
      .spyOn(HotkeyRecorder.prototype, 'start')
      .mockImplementation(function (this: HotkeyRecorder) {
        start.call(this)
        throw new Error('Recorder failed after attaching its listener')
      })
    runtime.shortcutRecorder.start(owner, result)
    expect(result).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    failure.mockRestore()
    press(document.body, 'F8')
    expect(invoke).toHaveBeenCalledOnce()
    runtime.shortcutRecorder.start(owner, result)
    press(owner, 'Tab')
    expect(result).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed', message: expect.stringContaining('reserved') }),
    )
  })
})
