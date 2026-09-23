import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioKeyboardShortcutsDialog from '@/features/keyboard-shortcuts/StudioKeyboardShortcutsDialog.vue'
import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import { DOMWrapper } from '@vue/test-utils'
import { STUDIO_ACTION } from '@/workbench/actions/studio-action'
import { createTestUserKeymapStorage } from '@/workbench/keyboard/__tests__/support/studio-keyboard-test-support'
import type { StudioUserKeymapStorage } from '@/workbench/keyboard/browser-user-keymap-storage'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

async function openSettings(storage?: StudioUserKeymapStorage) {
  const fixture = createTestStudioActionRuntime({ userKeymapStorage: storage })
  const wrapper = mount(
    defineComponent({
      components: { StudioKeyboardShortcutsDialog },
      setup: () => ({ open: shallowRef(false) }),
      template:
        '<button @click="open = true">Shortcuts</button><StudioKeyboardShortcutsDialog v-model:open="open" />',
    }),
    { attachTo: document.body, global: { provide: fixture.provide } },
  )
  cleanups.push(() => wrapper.unmount())
  await wrapper.get('button').trigger('click')
  await flushPromises()
  const element = document.querySelector('[role="dialog"]')
  if (!element) throw new Error('Expected shortcuts dialog')
  return { ...fixture, wrapper, dialog: new DOMWrapper(element) }
}

function buttonWithText(dialog: DOMWrapper<Element>, label: string) {
  const button = dialog.findAll('button').find((button) => button.text() === label)
  if (!button) throw new Error(`Expected button: ${label}`)
  return button
}

describe('Keyboard shortcuts dialog', () => {
  it('records into a draft, cancels recording before closing the editor, and clears only a draft binding', async () => {
    const { dialog, runtime, storage, bindingRegistry } = await openSettings()
    const invoke = vi.spyOn(runtime.actions, 'invoke')
    await dialog.get('[aria-label="Edit Focus notifications shortcuts"]').trigger('click')
    await dialog.get('[aria-label="Record key combination 1"]').trigger('click')
    await dialog
      .get('[aria-label="Stop recording key combination 1"]')
      .trigger('keydown', { key: 'F9' })
    expect(dialog.get<HTMLInputElement>('[aria-label="Key combination 1"]').element.value).toBe(
      'F9',
    )
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual(['F8'])
    expect(storage.writes).toEqual([])
    expect(invoke).not.toHaveBeenCalled()
    await dialog.get('[aria-label="Record key combination 1"]').trigger('click')
    await dialog
      .get('[aria-label="Stop recording key combination 1"]')
      .trigger('keydown', { key: 'Escape' })
    expect(dialog.find('form').exists()).toBe(true)
    expect(dialog.get<HTMLInputElement>('[aria-label="Key combination 1"]').element.value).toBe(
      'F9',
    )
    expect(dialog.text()).toContain('Recording cancelled')
    await dialog.get('[aria-label="Record key combination 1"]').trigger('click')
    await dialog
      .get('[aria-label="Stop recording key combination 1"]')
      .trigger('keydown', { key: 'Backspace' })
    expect(dialog.find('[aria-label="Key combination 1"]').exists()).toBe(false)
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual(['F8'])
    expect(storage.writes).toEqual([])
    await buttonWithText(dialog, 'Add key combination').trigger('click')
    await dialog.get('[aria-label="Record key combination 1"]').trigger('click')
    await dialog.get('[aria-label="Close keyboard shortcuts"]').trigger('click')
    await flushPromises()
    bindingRegistry.dispatch('F8')
    expect(invoke).toHaveBeenCalledOnce()
  })

  it.each(['Escape', 'Delete', 'Backspace'])(
    'lets users explicitly bind %s without recording it as a cancel or clear instruction',
    async (key) => {
      const { dialog, runtime } = await openSettings()
      await dialog.get('[aria-label="Edit Focus notifications shortcuts"]').trigger('click')
      await dialog.get('[aria-label="Choose special key for combination 1"]').setValue(key)
      expect(dialog.get<HTMLInputElement>('[aria-label="Key combination 1"]').element.value).toBe(
        key,
      )
      expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual(['F8'])
      await dialog.get('form').trigger('submit')
      expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual([key])
    },
  )

  it('reviews exactly which keys will move, returns focus on cancellation, and saves all affected actions together', async () => {
    const { dialog, runtime, storage } = await openSettings()
    await dialog.get('[aria-label="Edit Save shortcuts"]').trigger('click')
    await dialog.get('[aria-label="Key combination 1"]').setValue('Mod+Shift+Z')
    expect(dialog.get('[aria-label="Shortcut relationships"]').text()).toContain(
      'conflicts with Redo',
    )
    expect(buttonWithText(dialog, 'Save shortcuts').attributes('disabled')).toBeDefined()
    await buttonWithText(dialog, 'Reassign conflicting keys…').trigger('click')
    const confirm = buttonWithText(dialog, 'Reassign and save')
    expect(document.activeElement).toBe(confirm.element)
    expect(storage.writes).toEqual([])
    await confirm.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(dialog.find('[aria-label="Confirm shortcut reassignment"]').exists()).toBe(false)
    expect(document.activeElement).toBe(
      buttonWithText(dialog, 'Reassign conflicting keys…').element,
    )
    expect(dialog.find('form').exists()).toBe(true)
    await buttonWithText(dialog, 'Reassign conflicting keys…').trigger('click')
    await buttonWithText(dialog, 'Reassign and save').trigger('click')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PROJECT_SAVE)).toEqual(['Mod+Shift+Z'])
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.HISTORY_REDO)).toEqual(['Control+Y'])
    expect(storage.writes).toHaveLength(1)
    expect(dialog.find('form').exists()).toBe(false)
  })

  it('keeps the reviewed draft on reassignment failure and cancels the review when the user edits a key', async () => {
    const storage = createTestUserKeymapStorage()
    const { dialog, runtime } = await openSettings(storage)
    await dialog.get('[aria-label="Edit Save shortcuts"]').trigger('click')
    await dialog.get('[aria-label="Key combination 1"]').setValue('Mod+Z')
    await buttonWithText(dialog, 'Reassign conflicting keys…').trigger('click')
    vi.spyOn(storage, 'write').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    await buttonWithText(dialog, 'Reassign and save').trigger('click')
    expect(dialog.get('[role="alert"]').text()).toContain('previous shortcuts are still active')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PROJECT_SAVE)).toEqual(['Mod+S'])
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.HISTORY_UNDO)).toEqual(['Mod+Z'])
    await dialog.get('[aria-label="Key combination 1"]').setValue('F9')
    expect(dialog.find('[aria-label="Confirm shortcut reassignment"]').exists()).toBe(false)
    expect(dialog.find('[aria-label="Shortcut relationships"]').exists()).toBe(false)
  })

  it('explains compatible sharing and priority without offering a destructive reassignment', async () => {
    const { dialog } = await openSettings()
    await dialog.get('[aria-label="Edit Open MIDI clip shortcuts"]').trigger('click')
    expect(dialog.get('[aria-label="Shortcut relationships"]').text()).toContain(
      'separate focused regions',
    )
    expect(buttonWithText(dialog, 'Save shortcuts').attributes('disabled')).toBeUndefined()
    expect(dialog.text()).not.toContain('Reassign conflicting keys…')
    await buttonWithText(dialog, 'Cancel').trigger('click')
    await dialog.get('[aria-label="Edit Clear selection shortcuts"]').trigger('click')
    expect(dialog.get('[aria-label="Shortcut relationships"]').text()).toContain(
      'priority to Cancel interaction',
    )
    expect(dialog.text()).not.toContain('Reassign conflicting keys…')
    await dialog.get('[aria-label="Key combination 1"]').setValue('Mod+L')
    expect(dialog.text()).toContain('commonly used by the browser or operating system')
  })

  it('adds, changes and removes shortcuts, filters modifications, restores defaults and preserves them on reopening', async () => {
    const storage = createTestUserKeymapStorage()
    const { dialog, runtime, bindingRegistry, wrapper } = await openSettings(storage)
    const focus = vi.fn<() => void>()
    runtime.interfaceTarget.bind({ focusNotifications: focus, showShortcuts: () => {} })
    await dialog.get('[aria-label="Edit Focus notifications shortcuts"]').trigger('click')
    const first = dialog.get<HTMLInputElement>('[aria-label="Key combination 1"]')
    expect(document.activeElement).toBe(first.element)
    await first.setValue('F9')
    await buttonWithText(dialog, 'Add key combination').trigger('click')
    await dialog.get('[aria-label="Key combination 2"]').setValue('F10')
    await dialog.get('form').trigger('submit')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual(['F9', 'F10'])
    expect(bindingRegistry.listeners.has('F8')).toBe(false)
    bindingRegistry.dispatch('F9')
    expect(focus).not.toHaveBeenCalled()
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Edit Focus notifications shortcuts',
    )
    await dialog.get('select').setValue('modified')
    expect(dialog.findAll('tbody tr')).toHaveLength(1)
    expect(dialog.get('tbody tr').text()).toContain('display:F9')
    await dialog.get('[aria-label="Edit Focus notifications shortcuts"]').trigger('click')
    await dialog.get('[aria-label="Remove key combination 1"]').trigger('click')
    await dialog.get('[aria-label="Remove key combination 1"]').trigger('click')
    expect(dialog.get('form').text()).toContain('remove all shortcuts')
    await dialog.get('form').trigger('submit')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual([])
    expect(dialog.get('tbody tr').text()).toContain('Unassigned')
    await dialog.get('[aria-label="Edit Focus notifications shortcuts"]').trigger('click')
    await buttonWithText(dialog, 'Restore default').trigger('click')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS)).toEqual(['F8'])
    expect(dialog.findAll('tbody tr')).toHaveLength(0)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search keyboard shortcuts')
    await dialog.get('[aria-label="Close keyboard shortcuts"]').trigger('click')
    await flushPromises()
    bindingRegistry.dispatch('F8')
    expect(focus).toHaveBeenCalledOnce()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(document.querySelectorAll('tbody tr')).toHaveLength(19)
    expect(storage.read()).toBe('{"version":1,"overrides":{}}')
  })

  it('keeps an unsaved draft after persistence failure and cancels the draft with Escape before closing Settings', async () => {
    const storage = createTestUserKeymapStorage()
    const { dialog, runtime } = await openSettings(storage)
    vi.spyOn(storage, 'write').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    await dialog.get('[aria-label="Edit Save shortcuts"]').trigger('click')
    await dialog.get('[aria-label="Key combination 1"]').setValue('Mod+K')
    await dialog.get('form').trigger('submit')
    expect(dialog.get('[role="alert"]').text()).toContain('previous shortcuts are still active')
    expect(dialog.get<HTMLInputElement>('[aria-label="Key combination 1"]').element.value).toBe(
      'Mod+K',
    )
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PROJECT_SAVE)).toEqual(['Mod+S'])
    await dialog.get('[aria-label="Key combination 1"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(dialog.find('form').exists()).toBe(false)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Edit Save shortcuts')
    await dialog
      .get('[aria-label="Search keyboard shortcuts"]')
      .trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(storage.read()).toBeNull()
  })

  it('explains conflicting edits and displays parser warnings without prematurely changing bindings', async () => {
    const { dialog, runtime } = await openSettings()
    await dialog.get('[aria-label="Edit Save shortcuts"]').trigger('click')
    await dialog.get('[aria-label="Key combination 1"]').setValue('Mod+Z')
    await dialog.get('form').trigger('submit')
    expect(dialog.get('[role="alert"]').text()).toContain('conflicts with')
    expect(dialog.get('[role="alert"]').text()).toContain('Undo')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PROJECT_SAVE)).toEqual(['Mod+S'])
    await dialog.get('[aria-label="Key combination 1"]').setValue('UnrecognizedKey')
    expect(dialog.get('form').text()).toContain('Unknown key')
    expect(runtime.keyboard.bindingsFor(STUDIO_ACTION.PROJECT_SAVE)).toEqual(['Mod+S'])
  })

  it('keeps damaged records untouched until an explicit reset, and reports reset failures', async () => {
    const storage = createTestUserKeymapStorage('{broken')
    const { dialog, runtime } = await openSettings(storage)
    expect(dialog.text()).toContain('saved shortcut record is damaged')
    expect(
      dialog.get<HTMLButtonElement>('[aria-label="Edit Save shortcuts"]').element.disabled,
    ).toBe(true)
    await buttonWithText(dialog, 'Reset saved record').trigger('click')
    expect(storage.writes).toEqual([])
    await buttonWithText(dialog, 'Cancel restore').trigger('click')
    expect(document.activeElement).toBe(buttonWithText(dialog, 'Reset saved record').element)
    expect(storage.writes).toEqual([])
    await buttonWithText(dialog, 'Reset saved record').trigger('click')
    const failure = vi.spyOn(storage, 'write').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    await buttonWithText(dialog, 'Confirm restore').trigger('click')
    expect(dialog.text()).toContain('could not be saved')
    expect(storage.read()).toBe('{broken')
    failure.mockRestore()
    await buttonWithText(dialog, 'Confirm restore').trigger('click')
    expect(runtime.keymapState.value.problem).toBeNull()
    expect(
      dialog.get<HTMLButtonElement>('[aria-label="Edit Save shortcuts"]').element.disabled,
    ).toBe(false)
    expect(storage.read()).toBe('{"version":1,"overrides":{}}')
  })

  it('searches all Actions, filters unassigned keys, blocks background input and restores focus', async () => {
    const { runtime, provide, bindingRegistry } = createTestStudioActionRuntime()
    const focusNotifications = vi.fn<() => void>()
    runtime.interfaceTarget.bind({ focusNotifications, showShortcuts: vi.fn<() => void>() })
    const wrapper = mount(
      defineComponent({
        components: { StudioKeyboardShortcutsDialog },
        setup() {
          return { open: shallowRef(false) }
        },
        template:
          '<button @click="open = true">Shortcuts</button><StudioKeyboardShortcutsDialog v-model:open="open" />',
      }),
      { attachTo: document.body, global: { provide } },
    )
    cleanups.push(() => wrapper.unmount())
    const button = wrapper.get('button')
    button.element.focus()
    await button.trigger('click')
    await flushPromises()
    const dialogElement = document.querySelector('[role="dialog"]')
    if (!dialogElement) throw new Error('Expected a shortcuts dialog')
    const dialog = new DOMWrapper(dialogElement)
    const search = dialog.get('input')
    expect(document.activeElement).toBe(search.element)
    expect(dialog.findAll('tbody tr')).toHaveLength(19)
    bindingRegistry.dispatch('F8')
    expect(focusNotifications).not.toHaveBeenCalled()
    await search.setValue('画笔')
    expect(dialog.findAll('tbody tr')).toHaveLength(1)
    expect(dialog.text()).toContain('Pencil tool')
    await search.setValue('')
    await dialog.get('select').setValue('unassigned')
    expect(dialog.findAll('tbody tr')).toHaveLength(9)
    await search.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(button.element)
    bindingRegistry.dispatch('F8')
    expect(focusNotifications).toHaveBeenCalledOnce()
  })

  it('lets Studio focus the toast viewport and gives Reka no independent F8 binding', async () => {
    const wrapper = mount(UiToastRegion, {
      attachTo: document.body,
      props: { message: null, shortcut: 'F9' },
    })
    cleanups.push(() => wrapper.unmount())
    await flushPromises()
    const viewport = document.querySelector('.ui-toast-viewport')
    const before = document.activeElement
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'F8' }))
    expect(document.activeElement).toBe(before)
    wrapper.vm.focus()
    expect(document.activeElement).toBe(viewport)
    expect(document.querySelector('[aria-label="Notifications (F9)"]')).not.toBeNull()
  })
})
