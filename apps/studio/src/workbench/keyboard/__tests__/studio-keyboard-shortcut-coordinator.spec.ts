import { describe, expect, it, vi } from 'vitest'

import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/studio-keyboard-shortcut-test-support'
import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'
import {
  STUDIO_KEYBOARD_ACTION,
  STUDIO_KEYBOARD_SCOPE,
  createStudioKeyboardShortcutCoordinator,
  type StudioKeyboardShortcutDefinition,
  type StudioKeyboardShortcutFailure,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import {
  STUDIO_DEFAULT_KEYMAP,
  createStudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-default-keymap'

function createDefinition(
  input: Partial<StudioKeyboardShortcutDefinition> = {},
): StudioKeyboardShortcutDefinition {
  return {
    actionId: STUDIO_KEYBOARD_ACTION.PROJECT_SAVE,
    bindings: [defineStudioKeyboardBinding('Mod+S')],
    description: 'Save the active project.',
    label: 'Save project',
    run: () => true,
    scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
    ...input,
  }
}

describe('StudioKeyboardShortcutCoordinator', () => {
  it('publishes frozen Action metadata and shares one physical Binding registration', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
    })
    const disposeWorkbench = coordinator.register([createDefinition()])
    const disposeGlobal = coordinator.register([
      createDefinition({
        actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        description: 'A lower-priority test Action.',
        label: 'Clear',
        scope: STUDIO_KEYBOARD_SCOPE.GLOBAL,
      }),
    ])

    expect(bindingRegistry.registrationCountByBinding.get('Mod+S')).toBe(1)
    expect(
      coordinator.bindingsFor(STUDIO_KEYBOARD_ACTION.PROJECT_SAVE),
    ).toBe(STUDIO_DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.PROJECT_SAVE])
    expect(coordinator.validateBindingInput(' K ')).toEqual({
      binding: 'K',
      errors: [],
      input: ' K ',
      valid: true,
      warnings: [],
    })
    expect(coordinator.listShortcuts()).toEqual([
      {
        actionId: STUDIO_KEYBOARD_ACTION.PROJECT_SAVE,
        bindings: [defineStudioKeyboardBinding('Mod+S')],
        description: 'Save the active project.',
        displayBindings: ['display:Mod+S'],
        label: 'Save project',
        scope: STUDIO_KEYBOARD_SCOPE.WORKBENCH,
      },
      {
        actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        bindings: [defineStudioKeyboardBinding('Mod+S')],
        description: 'A lower-priority test Action.',
        displayBindings: ['display:Mod+S'],
        label: 'Clear',
        scope: STUDIO_KEYBOARD_SCOPE.GLOBAL,
      },
    ])
    const metadata = coordinator.listShortcuts()
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(metadata.every(Object.isFrozen)).toBe(true)
    expect(metadata.every((action) => Object.isFrozen(action.bindings))).toBe(true)
    expect(metadata.every((action) => Object.isFrozen(action.displayBindings))).toBe(true)

    disposeWorkbench()
    expect(bindingRegistry.listeners.has('Mod+S')).toBe(true)
    disposeGlobal()
    disposeGlobal()
    expect(bindingRegistry.listeners.has('Mod+S')).toBe(false)
    expect(bindingRegistry.disposalCountByBinding.get('Mod+S')).toBe(1)
    coordinator.dispose()
  })

  it('resolves Feature bindings from an injected Keymap override', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const customSaveBinding = defineStudioKeyboardBinding('K')
    const keymap = createStudioKeyboardKeymap({
      [STUDIO_KEYBOARD_ACTION.PROJECT_SAVE]: Object.freeze([
        customSaveBinding,
      ]),
    })
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap,
    })

    const bindings = coordinator.bindingsFor(
      STUDIO_KEYBOARD_ACTION.PROJECT_SAVE,
    )
    coordinator.register([
      createDefinition({
        bindings,
      }),
    ])

    expect(Object.isFrozen(STUDIO_DEFAULT_KEYMAP)).toBe(true)
    expect(
      Object.values(STUDIO_DEFAULT_KEYMAP).every(Object.isFrozen),
    ).toBe(true)
    expect(bindings).toEqual(['K'])
    expect(bindingRegistry.listeners.has('K')).toBe(true)
    expect(bindingRegistry.listeners.has('Mod+S')).toBe(false)
    coordinator.dispose()
  })

  it('runs the highest enabled Scope and prevents only after an Action handles', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
    })
    const runWorkbench = vi.fn<() => boolean>(() => true)
    const runPianoRoll = vi.fn<() => boolean>(() => false)
    let pianoRollEnabled = false

    coordinator.register([
      createDefinition({ run: runWorkbench }),
      createDefinition({
        actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        description: 'Clear the focused Piano Roll Selection.',
        isEnabled: () => pianoRollEnabled,
        label: 'Clear Piano Roll Selection',
        run: runPianoRoll,
        scope: STUDIO_KEYBOARD_SCOPE.PIANO_ROLL,
      }),
    ])

    const workbenchEvent = bindingRegistry.dispatch('Mod+S')
    expect(runWorkbench).toHaveBeenCalledOnce()
    expect(runPianoRoll).not.toHaveBeenCalled()
    expect(workbenchEvent.defaultPrevented).toBe(true)

    pianoRollEnabled = true
    const fallbackEvent = bindingRegistry.dispatch('Mod+S')
    expect(runPianoRoll).toHaveBeenCalledOnce()
    expect(runWorkbench).toHaveBeenCalledTimes(2)
    expect(fallbackEvent.defaultPrevented).toBe(true)

    runWorkbench.mockReturnValue(false)
    const unhandledEvent = bindingRegistry.dispatch('Mod+S')
    expect(unhandledEvent.defaultPrevented).toBe(false)
    coordinator.dispose()
  })

  it('ignores composing, legacy IME and already-handled events', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
    })
    const run = vi.fn<() => boolean>(() => true)
    coordinator.register([createDefinition({ run })])

    bindingRegistry.dispatch('Mod+S', { isComposing: true })
    const legacyImeEvent = new KeyboardEvent('keydown', { cancelable: true })
    Object.defineProperty(legacyImeEvent, 'keyCode', { value: 229 })
    bindingRegistry.listeners.get('Mod+S')?.(legacyImeEvent)
    const handledEvent = new KeyboardEvent('keydown', { cancelable: true })
    handledEvent.preventDefault()
    bindingRegistry.listeners.get('Mod+S')?.(handledEvent)

    expect(run).not.toHaveBeenCalled()
    coordinator.dispose()
  })

  it('isolates enabled and Handler failures without falling through Scopes', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const failures: StudioKeyboardShortcutFailure[] = []
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
      onError: (failure) => failures.push(failure),
    })
    const runWorkbench = vi.fn<() => boolean>(() => true)
    const enabledFailure = new Error('Enabled failed')
    const handlerFailure = new Error('Handler failed')
    let failEnabled = true

    coordinator.register([
      createDefinition({ run: runWorkbench }),
      createDefinition({
        actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        description: 'Failing higher Scope.',
        isEnabled: () => {
          if (failEnabled) throw enabledFailure
          return true
        },
        label: 'Failing Action',
        run: () => {
          throw handlerFailure
        },
        scope: STUDIO_KEYBOARD_SCOPE.PIANO_ROLL,
      }),
    ])

    expect(() => bindingRegistry.dispatch('Mod+S')).not.toThrow()
    failEnabled = false
    expect(() => bindingRegistry.dispatch('Mod+S')).not.toThrow()

    expect(runWorkbench).not.toHaveBeenCalled()
    expect(failures).toEqual([
      {
        actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        cause: enabledFailure,
        operation: 'enabled-check',
      },
      {
        actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR,
        cause: handlerFailure,
        operation: 'handler',
      },
    ])
    coordinator.dispose()
  })

  it('rejects ambiguous ownership and registration after disposal', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
    })
    coordinator.register([createDefinition()])

    expect(() => coordinator.register([createDefinition()])).toThrowError(
      expect.objectContaining({ code: 'action-already-registered' }),
    )
    expect(() =>
      coordinator.register([
        createDefinition({
          actionId: STUDIO_KEYBOARD_ACTION.HISTORY_UNDO,
          bindings: [defineStudioKeyboardBinding('Mod+S')],
        }),
      ]),
    ).toThrowError(
      expect.objectContaining({ code: 'scope-binding-conflict' }),
    )

    coordinator.dispose()
    expect(() =>
      coordinator.register([
        createDefinition({
          actionId: STUDIO_KEYBOARD_ACTION.HISTORY_REDO,
        }),
      ]),
    ).toThrowError(expect.objectContaining({ code: 'coordinator-disposed' }))
    expect(() => coordinator.listShortcuts()).toThrowError(
      expect.objectContaining({ code: 'coordinator-disposed' }),
    )
  })

  it('rolls back physical Bindings when registration fails', () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const register = bindingRegistry.register.bind(bindingRegistry)
    vi.spyOn(bindingRegistry, 'register').mockImplementation((binding, listener) => {
      if (binding === 'Control+Y') throw new Error('Registry failed')
      return register(binding, listener)
    })
    const coordinator = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
    })

    expect(() =>
      coordinator.register([
        createDefinition({
          actionId: STUDIO_KEYBOARD_ACTION.HISTORY_REDO,
          bindings: [
            defineStudioKeyboardBinding('Mod+Shift+Z'),
            defineStudioKeyboardBinding('Control+Y'),
          ],
        }),
      ]),
    ).toThrow('Registry failed')

    expect(bindingRegistry.listeners.size).toBe(0)
    expect(coordinator.listShortcuts()).toEqual([])
    coordinator.dispose()
  })
})
