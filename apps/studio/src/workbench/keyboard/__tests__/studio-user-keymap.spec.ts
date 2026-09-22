import { computed } from 'vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import { STUDIO_ACTION } from '@/workbench/actions/studio-action'
import { presentStudioAction } from '@/workbench/actions/studio-action-control'
import {
  createTestUserKeymapStorage,
  TestStudioKeyboardBindingRegistry,
} from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'
import {
  createBrowserUserKeymapStorage,
  STUDIO_USER_KEYMAP_STORAGE_KEY,
} from '@/workbench/keyboard/browser-user-keymap-storage'

const notifications = STUDIO_ACTION.NOTIFICATIONS_FOCUS
const save = STUDIO_ACTION.PROJECT_SAVE
const undo = STUDIO_ACTION.HISTORY_UNDO
const record = (overrides: Record<string, unknown>): string =>
  JSON.stringify({ version: 1, overrides })

describe('Studio user keymap', () => {
  it('saves differences, keeps portable Mod, reloads, and distinguishes unbinding from following defaults', () => {
    const storage = createTestUserKeymapStorage()
    const { runtime, bindingRegistry } = createTestStudioActionRuntime({
      userKeymapStorage: storage,
    })
    expect(runtime.userKeymap.setBindings(save, [' Mod+K ', 'F6'])).toEqual({ status: 'saved' })
    expect(storage.read()).toBe(record({ [save]: ['Mod+K', 'F6'] }))
    expect(bindingRegistry.listeners.has('Mod+S')).toBe(false)
    const restored = createTestStudioActionRuntime({ userKeymapStorage: storage }).runtime
    expect(restored.keyboard.bindingsFor(save)).toEqual(['Mod+K', 'F6'])
    restored.dispose()
    expect(runtime.userKeymap.setBindings(save, [])).toEqual({ status: 'saved' })
    expect(runtime.keyboard.bindingsFor(save)).toEqual([])
    expect(storage.read()).toBe(record({ [save]: [] }))
    runtime.dispose()
    const reloaded = createTestStudioActionRuntime({ userKeymapStorage: storage }).runtime
    expect(reloaded.keyboard.bindingsFor(save)).toEqual([])
    expect(storage.writes).toHaveLength(2)
    expect(reloaded.userKeymap.restoreAction(save)).toEqual({ status: 'saved' })
    expect(storage.read()).toBe(record({}))
    expect(reloaded.keyboard.bindingsFor(save)).toEqual(['Mod+S'])
    expect(reloaded.keymapState.value.modifiedActionIds).toEqual([])
  })

  it('publishes reactive hints only after persistence and blocks dispatch throughout the replacement', () => {
    const { runtime, bindingRegistry, storage } = createTestStudioActionRuntime()
    const focus = vi.fn<() => void>()
    runtime.interfaceTarget.bind({ focusNotifications: focus, showShortcuts: () => {} })
    const hint = computed(
      () => presentStudioAction(runtime.actions, runtime.keyboard, notifications).shortcut,
    )
    const previous = runtime.userKeymap.state
    const write = storage.write
    vi.spyOn(storage, 'write').mockImplementation((serialized) => {
      expect(runtime.userKeymap.state).toBe(previous)
      expect(hint.value).toBe('display:F8')
      expect(bindingRegistry.dispatch('F8').defaultPrevented).toBe(false)
      expect(bindingRegistry.dispatch('F9').defaultPrevented).toBe(false)
      write(serialized)
    })
    const published = vi.fn<() => void>(() => {
      expect(storage.read()).toBe(record({ [notifications]: ['F9'] }))
      expect(hint.value).toBe('display:F9')
      expect(bindingRegistry.listeners.has('F8')).toBe(true)
      expect(bindingRegistry.dispatch('F9').defaultPrevented).toBe(false)
      expect(runtime.userKeymap.restoreAll()).toMatchObject({
        status: 'rejected',
        code: 'unavailable',
      })
    })
    runtime.userKeymap.subscribe(published)
    expect(runtime.userKeymap.setBindings(notifications, ['F9'])).toEqual({ status: 'saved' })
    expect(published).toHaveBeenCalledOnce()
    expect(focus).not.toHaveBeenCalled()
    expect(bindingRegistry.listeners.has('F8')).toBe(false)
    expect(bindingRegistry.registrationCountByBinding.get('Mod+S')).toBe(1)
    expect(bindingRegistry.dispatch('F9').defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
  })

  it('rolls back newly prepared registrations and all projections when storage rejects the write', () => {
    const { runtime, bindingRegistry, storage } = createTestStudioActionRuntime()
    const previous = runtime.userKeymap.state
    const subscriber = vi.fn<() => void>()
    runtime.userKeymap.subscribe(subscriber)
    vi.spyOn(storage, 'write').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(runtime.userKeymap.setBindings(notifications, ['F9', 'F10'])).toMatchObject({
      status: 'rejected',
      code: 'storage',
    })
    expect(runtime.userKeymap.state).toBe(previous)
    expect(runtime.keymapState.value).toBe(previous)
    expect(runtime.keyboard.displayBindingsFor(notifications)).toEqual(['display:F8'])
    expect(subscriber).not.toHaveBeenCalled()
    expect(bindingRegistry.listeners.has('F8')).toBe(true)
    expect(bindingRegistry.listeners.has('F9')).toBe(false)
    expect(bindingRegistry.listeners.has('F10')).toBe(false)
    expect(storage.read()).toBeNull()
    expect(bindingRegistry.disposalCountByBinding.get('F9')).toBe(1)
  })

  it('rolls back a partial registration failure without writing the record', () => {
    const { runtime, bindingRegistry, storage } = createTestStudioActionRuntime()
    const previous = runtime.userKeymap.state
    const register = bindingRegistry.register.bind(bindingRegistry)
    vi.spyOn(bindingRegistry, 'register').mockImplementation((binding, listener) => {
      if (binding === 'F10') throw new Error('Registration unavailable')
      return register(binding, listener)
    })
    expect(runtime.userKeymap.setBindings(notifications, ['F9', 'F10'])).toMatchObject({
      status: 'rejected',
      code: 'registration',
    })
    expect(runtime.userKeymap.state).toBe(previous)
    expect(storage.writes).toEqual([])
    expect(bindingRegistry.listeners.has('F9')).toBe(false)
    expect(bindingRegistry.listeners.has('F8')).toBe(true)
    expect(bindingRegistry.disposalCountByBinding.get('F9')).toBe(1)
  })

  it('keeps modal suspension across changes and releases current registrations on application disposal', () => {
    const { runtime, bindingRegistry, storage } = createTestStudioActionRuntime()
    const focus = vi.fn<() => void>()
    runtime.interfaceTarget.bind({ focusNotifications: focus, showShortcuts: () => {} })
    const release = runtime.keyboard.suspend()
    expect(runtime.userKeymap.setBindings(notifications, ['F9'])).toEqual({ status: 'saved' })
    bindingRegistry.dispatch('F9')
    expect(focus).not.toHaveBeenCalled()
    release()
    bindingRegistry.dispatch('F9')
    expect(focus).toHaveBeenCalledOnce()
    runtime.dispose()
    runtime.dispose()
    expect(bindingRegistry.listeners.size).toBe(0)
    expect(runtime.userKeymap.setBindings(notifications, ['F10'])).toMatchObject({
      status: 'rejected',
      code: 'unavailable',
    })
    expect(storage.writes).toHaveLength(1)
  })

  it.each([
    '{broken',
    'null',
    '[]',
    '{}',
    '{"version":1,"overrides":[]}',
    '{"version":2,"overrides":{}}',
  ])('loads defaults without rewriting a damaged or unsupported document: %s', (serialized) => {
    const storage = createTestUserKeymapStorage(serialized)
    const { runtime } = createTestStudioActionRuntime({ userKeymapStorage: storage })
    expect(runtime.keyboard.bindingsFor(save)).toEqual(['Mod+S'])
    expect(runtime.keymapState.value.canEdit).toBe(false)
    expect(runtime.keymapState.value.problem).not.toBeNull()
    expect(runtime.userKeymap.setBindings(save, ['F6'])).toMatchObject({
      status: 'rejected',
      code: 'unavailable',
    })
    expect(storage.read()).toBe(serialized)
    expect(storage.writes).toEqual([])
    expect(runtime.userKeymap.restoreAll()).toEqual({ status: 'saved' })
    expect(storage.read()).toBe(record({}))
    expect(runtime.keymapState.value.canEdit).toBe(true)
  })

  it('quarantines invalid entries, preserves unknown IDs and repairs one action without losing the rest', () => {
    const unknown = { future: ['Mod+K'], mode: 2 }
    const original = record({
      [save]: ['Hyper+S'],
      [undo]: 42,
      [notifications]: ['F9'],
      'future.action': unknown,
    })
    const storage = createTestUserKeymapStorage(original)
    const { runtime } = createTestStudioActionRuntime({ userKeymapStorage: storage })
    expect(runtime.keyboard.bindingsFor(save)).toEqual(['Mod+S'])
    expect(runtime.keyboard.bindingsFor(undo)).toEqual(['Mod+Z'])
    expect(runtime.keyboard.bindingsFor(notifications)).toEqual(['F9'])
    expect(runtime.keymapState.value.rejectedOverrides.map((issue) => issue.actionId)).toEqual(
      expect.arrayContaining([save, undo]),
    )
    expect(runtime.keymapState.value.unknownActionIds).toEqual(['future.action'])
    expect(storage.read()).toBe(original)
    expect(storage.writes).toEqual([])
    expect(runtime.userKeymap.bindingsForEditing(save)).toEqual(['Hyper+S'])
    expect(runtime.userKeymap.setBindings(save, ['Mod+K'])).toEqual({ status: 'saved' })
    expect(JSON.parse(storage.read() ?? '')).toEqual({
      version: 1,
      overrides: {
        [save]: ['Mod+K'],
        [undo]: 42,
        [notifications]: ['F9'],
        'future.action': unknown,
      },
    })
    expect(runtime.keymapState.value.rejectedOverrides).toHaveLength(1)
    expect(runtime.userKeymap.restoreAll()).toEqual({ status: 'saved' })
    expect(storage.read()).toBe(record({ 'future.action': unknown }))
    expect(runtime.keymapState.value.modifiedActionIds).toEqual([])
    expect(runtime.keymapState.value.rejectedOverrides).toEqual([])
  })

  it('validates the entire loaded map, including conflicts revealed when another override falls back', () => {
    const storage = createTestUserKeymapStorage(
      record({
        [save]: ['F6'],
        [undo]: ['F6'],
        [STUDIO_ACTION.PLAYBACK_TOGGLE]: ['Mod+S'],
        [notifications]: ['F9'],
      }),
    )
    const { runtime } = createTestStudioActionRuntime({ userKeymapStorage: storage })
    expect(runtime.keyboard.bindingsFor(save)).toEqual(['Mod+S'])
    expect(runtime.keyboard.bindingsFor(undo)).toEqual(['Mod+Z'])
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PLAYBACK_TOGGLE)).toEqual(['Space'])
    expect(runtime.keyboard.bindingsFor(notifications)).toEqual(['F9'])
    expect(runtime.keymapState.value.rejectedOverrides).toHaveLength(3)
    expect(storage.writes).toEqual([])
    expect(runtime.userKeymap.setBindings(save, ['F10'])).toEqual({ status: 'saved' })
    expect(runtime.keymapState.value.rejectedOverrides).toEqual([])
    expect(runtime.keyboard.bindingsFor(undo)).toEqual(['F6'])
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PLAYBACK_TOGGLE)).toEqual(['Mod+S'])
  })

  it('rejects duplicate or conflicting edits, including a restore that collides with another user override', () => {
    const { runtime, storage } = createTestStudioActionRuntime()
    expect(runtime.userKeymap.setBindings(notifications, ['F9', 'F9'])).toMatchObject({
      status: 'rejected',
      code: 'validation',
    })
    expect(runtime.userKeymap.setBindings(undo, ['Mod+S'])).toMatchObject({
      status: 'rejected',
      code: 'validation',
    })
    expect(storage.writes).toEqual([])
    runtime.userKeymap.setBindings(save, ['F6'])
    runtime.userKeymap.setBindings(undo, ['Mod+S'])
    const previous = runtime.userKeymap.state
    expect(runtime.userKeymap.restoreAction(save)).toMatchObject({
      status: 'rejected',
      code: 'validation',
    })
    expect(runtime.userKeymap.state).toBe(previous)
    expect(storage.writes).toHaveLength(2)
    expect(runtime.userKeymap.restoreAll()).toEqual({ status: 'saved' })
    expect(runtime.keyboard.bindingsFor(save)).toEqual(['Mod+S'])
    expect(runtime.keyboard.bindingsFor(undo)).toEqual(['Mod+Z'])
  })

  it('keeps defaults and the original record when loading cannot register the saved keys', () => {
    const storage = createTestUserKeymapStorage(record({ [notifications]: ['F9', 'F10'] }))
    const registry = new TestStudioKeyboardBindingRegistry()
    const register = registry.register.bind(registry)
    vi.spyOn(registry, 'register').mockImplementation((binding, listener) => {
      if (binding === 'F10') throw new Error('Cannot register F10')
      return register(binding, listener)
    })
    const runtime = createStudioActionRuntime({
      bindingRegistry: registry,
      userKeymapStorage: storage,
      isModalActive: () => false,
      reportFailure: () => {},
    })
    onTestFinished(() => runtime.dispose())
    expect(runtime.keymapState.value.problem?.code).toBe('registration-failed')
    expect(runtime.keyboard.bindingsFor(notifications)).toEqual(['F8'])
    expect(registry.listeners.has('F9')).toBe(false)
    expect(storage.writes).toEqual([])
    expect(runtime.userKeymap.bindingsForEditing(notifications)).toEqual(['F9', 'F10'])
    expect(runtime.userKeymap.setBindings(notifications, ['F9'])).toEqual({ status: 'saved' })
    expect(runtime.keymapState.value.problem).toBeNull()
  })

  it('accesses browser storage lazily and never lets denied access prevent application startup', () => {
    const getStorage = vi.fn<() => Storage>(() => {
      throw new Error('SecurityError')
    })
    const storage = createBrowserUserKeymapStorage(getStorage)
    expect(getStorage).not.toHaveBeenCalled()
    const { runtime } = createTestStudioActionRuntime({ userKeymapStorage: storage })
    expect(runtime.keymapState.value.problem?.code).toBe('storage-unavailable')
    expect(runtime.keyboard.bindingsFor(save)).toEqual(['Mod+S'])
    const previous = runtime.userKeymap.state
    expect(runtime.userKeymap.restoreAll()).toMatchObject({ status: 'rejected', code: 'storage' })
    expect(runtime.userKeymap.state).toBe(previous)
    const getItem = vi.fn<Storage['getItem']>(() => null)
    const setItem = vi.fn<Storage['setItem']>()
    const available = createBrowserUserKeymapStorage(() => ({ getItem, setItem }))
    available.read()
    available.write(record({}))
    expect(getItem).toHaveBeenCalledExactlyOnceWith(STUDIO_USER_KEYMAP_STORAGE_KEY)
    expect(setItem).toHaveBeenCalledExactlyOnceWith(STUDIO_USER_KEYMAP_STORAGE_KEY, record({}))
  })
})
