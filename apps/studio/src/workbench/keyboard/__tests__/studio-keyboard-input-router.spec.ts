import { describe, expect, it, vi } from 'vitest'

import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  type StudioActionCompletion,
  type StudioActionFailure,
} from '@/workbench/actions/studio-action'
import { createStudioKeyboardKeymap } from '@/workbench/keyboard/studio-default-keymap'
import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'
import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'

describe('Studio keyboard input routing', () => {
  it('cancels a gesture before clearing selection, without coupling the two Actions', () => {
    const { runtime, bindingRegistry } = createTestStudioActionRuntime()
    let interacting = true
    let selected = true
    const clear = vi.fn<() => StudioActionCompletion>(() => {
      selected = false
      return STUDIO_ACTION_COMPLETED
    })
    const cancel = vi.fn<() => StudioActionCompletion>(() => {
      interacting = false
      return STUDIO_ACTION_COMPLETED
    })
    runtime.pianoRollTarget.bind({
      isFocused: () => true,
      hasSelection: () => selected,
      hasInteraction: () => interacting,
      selectionLabel: () => 'Notes',
      deleteSelection: () => STUDIO_ACTION_COMPLETED,
      clearSelection: clear,
      cancelInteraction: cancel,
    })
    expect(runtime.actions.invoke(STUDIO_ACTION.PIANO_ROLL_SELECTION_CLEAR, 'menu').status).toBe(
      'unavailable',
    )
    expect(bindingRegistry.dispatch('Escape').defaultPrevented).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    expect(bindingRegistry.dispatch('Escape').defaultPrevented).toBe(true)
    expect(clear).toHaveBeenCalledOnce()
    expect(bindingRegistry.dispatch('Escape').defaultPrevented).toBe(false)
    expect(bindingRegistry.registrationCountByBinding.get('Escape')).toBe(1)
  })

  it('does not fall through to Clear Selection when Cancel fails after ending the gesture', async () => {
    const { runtime, bindingRegistry, failures } = createTestStudioActionRuntime()
    const cause = new Error('Gesture cleanup failed')
    let interacting = true
    const clear = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const cancel = vi.fn<() => StudioActionCompletion>(() => {
      interacting = false
      throw cause
    })
    runtime.pianoRollTarget.bind({
      isFocused: () => true,
      hasSelection: () => true,
      hasInteraction: () => interacting,
      selectionLabel: () => 'Notes',
      deleteSelection: () => STUDIO_ACTION_COMPLETED,
      clearSelection: clear,
      cancelInteraction: cancel,
    })

    expect(bindingRegistry.dispatch('Escape').defaultPrevented).toBe(true)
    await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    expect(failures).toEqual([
      {
        actionId: STUDIO_ACTION.PIANO_ROLL_INTERACTION_CANCEL,
        source: 'keyboard',
        operation: 'execute',
        cause,
      },
    ])
    expect(runtime.actions.presentationFor(STUDIO_ACTION.PIANO_ROLL_SELECTION_CLEAR).enabled).toBe(
      true,
    )

    expect(bindingRegistry.dispatch('Escape').defaultPrevented).toBe(true)
    expect(clear).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(bindingRegistry.registrationCountByBinding.get('Escape')).toBe(1)
  })

  it('makes focus and modal ownership keyboard policy while keeping menu invocation available', async () => {
    let modal = false
    let focused = false
    const { runtime, bindingRegistry } = createTestStudioActionRuntime({
      isModalActive: () => modal,
    })
    const remove = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    runtime.pianoRollTarget.bind({
      isFocused: () => focused,
      hasSelection: () => true,
      hasInteraction: () => false,
      selectionLabel: () => 'Notes',
      deleteSelection: remove,
      clearSelection: () => STUDIO_ACTION_COMPLETED,
      cancelInteraction: () => STUDIO_ACTION_COMPLETED,
    })
    expect(bindingRegistry.dispatch('Delete').defaultPrevented).toBe(false)
    const menu = runtime.actions.invoke(STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE, 'menu')
    if (menu.status !== 'accepted') throw new Error('Expected explicit menu target')
    await menu.completion
    expect(remove).toHaveBeenCalledOnce()
    focused = true
    modal = true
    expect(bindingRegistry.dispatch('Delete').defaultPrevented).toBe(false)
    modal = false
    const releaseMenu = runtime.keyboard.suspend()
    const releaseNestedMenu = runtime.keyboard.suspend()
    releaseMenu()
    expect(bindingRegistry.dispatch('Delete').defaultPrevented).toBe(false)
    releaseNestedMenu()
    expect(bindingRegistry.dispatch('Delete').defaultPrevented).toBe(true)
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('ignores IME and consumed input, and prevents defaults when an accepted handler fails', async () => {
    const { runtime, bindingRegistry, failures } = createTestStudioActionRuntime()
    const cause = new Error('Project rejected delete')
    const remove = vi.fn<() => StudioActionCompletion>(() => {
      throw cause
    })
    runtime.pianoRollTarget.bind({
      isFocused: () => true,
      hasSelection: () => true,
      hasInteraction: () => false,
      selectionLabel: () => 'Notes',
      deleteSelection: remove,
      clearSelection: () => STUDIO_ACTION_COMPLETED,
      cancelInteraction: () => STUDIO_ACTION_COMPLETED,
    })
    expect(bindingRegistry.dispatch('Delete', { isComposing: true }).defaultPrevented).toBe(false)
    expect(bindingRegistry.dispatch('Delete', { keyCode: 229 }).defaultPrevented).toBe(false)
    const consumed = new KeyboardEvent('keydown', { cancelable: true })
    consumed.preventDefault()
    bindingRegistry.listeners.get('Delete')?.(consumed)
    expect(remove).not.toHaveBeenCalled()
    const event = bindingRegistry.dispatch('Delete')
    expect(event.defaultPrevented).toBe(true)
    await Promise.resolve()
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      cause,
      actionId: STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE,
      operation: 'execute',
    })
    expect(bindingRegistry.dispatch('Escape').defaultPrevented).toBe(true)
  })

  it('rejects same-scope canonical conflicts before registering any physical key', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    vi.spyOn(bindingRegistry, 'identity').mockImplementation((binding) =>
      binding.replace('Meta', 'Mod'),
    )
    const keymap = createStudioKeyboardKeymap({
      [STUDIO_ACTION.HISTORY_UNDO]: [defineStudioKeyboardBinding('Meta+S')],
    })
    expect(() =>
      createStudioActionRuntime({
        bindingRegistry,
        keymap,
        isModalActive: () => false,
        reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
      }),
    ).toThrow('Ambiguous keyboard binding')
    expect(bindingRegistry.registrationCountByBinding.size).toBe(0)
  })

  it('rolls back physical registrations when the browser adapter fails partway through setup', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const register = bindingRegistry.register.bind(bindingRegistry)
    vi.spyOn(bindingRegistry, 'register').mockImplementation((binding, listener) => {
      if (bindingRegistry.listeners.size === 2) throw new Error('Browser registration failed')
      return register(binding, listener)
    })
    expect(() =>
      createStudioActionRuntime({
        bindingRegistry,
        isModalActive: () => false,
        reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
      }),
    ).toThrow('Browser registration failed')
    expect(bindingRegistry.listeners.size).toBe(0)
    expect([...bindingRegistry.disposalCountByBinding.values()]).toEqual([1, 1])
  })
})
