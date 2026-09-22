import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioKeyboardShortcutsDialog from '@/features/keyboard-shortcuts/StudioKeyboardShortcutsDialog.vue'
import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import { DOMWrapper } from '@vue/test-utils'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

describe('Keyboard shortcuts dialog', () => {
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
