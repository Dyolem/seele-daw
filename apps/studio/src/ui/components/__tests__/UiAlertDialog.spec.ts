import { mount, type VueWrapper } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import UiAlertDialog from '@/ui/components/UiAlertDialog.vue'

const mountedWrappers: VueWrapper[] = []

function mountDialog(open: boolean): VueWrapper {
  const wrapper = mount(UiAlertDialog, {
    attachTo: document.body,
    props: { open },
    slots: {
      title: 'Unsaved changes',
      description: 'Choose what happens to this project.',
      cancel: () => h('button', { type: 'button' }, 'Cancel'),
      actions: () => h('button', { type: 'button' }, 'Save'),
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('UiAlertDialog', () => {
  it('portals an accessible alert dialog only while open', async () => {
    const wrapper = mountDialog(false)

    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()

    await wrapper.setProps({ open: true })
    const dialog = document.body.querySelector('[role="alertdialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Unsaved changes')
    expect(dialog?.textContent).toContain('Choose what happens to this project.')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog?.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('reports the Headless cancel request without deciding a business outcome', async () => {
    const wrapper = mountDialog(true)
    await nextTick()
    const cancel = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancel',
    )
    if (cancel === undefined) throw new Error('Expected the Alert Dialog cancel button')

    cancel.click()
    await nextTick()

    expect(wrapper.emitted('requestClose')).toEqual([[]])
  })
})
