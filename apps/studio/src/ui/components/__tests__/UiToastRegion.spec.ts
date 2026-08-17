import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { UI_TOAST_TONE } from '@/ui/components/ui-toast'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

const mountedWrappers: VueWrapper[] = []

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('UiToastRegion', () => {
  it('portals a foreground notification with its semantic tone', async () => {
    const wrapper = mount(UiToastRegion, {
      props: {
        message: Object.freeze({
          description: 'This Track type will arrive in a later product slice.',
          id: 1,
          title: 'Sampler is in development',
          tone: UI_TOAST_TONE.INFO,
        }),
      },
    })
    mountedWrappers.push(wrapper)
    await nextTick()

    const toast = document.body.querySelector('.ui-toast')
    expect(toast).not.toBeNull()
    expect(toast?.classList.contains('ui-toast--info')).toBe(true)
    expect(toast?.textContent).toContain('Sampler is in development')
    expect(toast?.textContent).toContain('later product slice')
    expect(document.body.querySelector('.ui-toast-viewport')).not.toBeNull()
  })

  it('reports dismissal for the exact rendered message capability', async () => {
    const wrapper = mount(UiToastRegion, {
      props: {
        message: Object.freeze({
          id: 47,
          title: 'Track could not be added',
          tone: UI_TOAST_TONE.DANGER,
        }),
      },
    })
    mountedWrappers.push(wrapper)
    await nextTick()

    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss notification"]',
    )
    if (close === null) throw new Error('Expected the Toast dismiss button')
    close.click()
    await nextTick()

    expect(wrapper.emitted('dismiss')).toEqual([[47]])
  })

  it('renders a notification triggered through the imperative application Store', async () => {
    const pinia = createPinia()
    const toasts = useUiToastStore(pinia)
    const host = defineComponent({
      components: { UiToastRegion },
      setup: () => ({ toasts }),
      template: '<UiToastRegion :message="toasts.message" @dismiss="toasts.dismiss" />',
    })
    const wrapper = mount(host, {
      global: {
        plugins: [pinia],
      },
    })
    mountedWrappers.push(wrapper)

    toasts.warning('MIDI note was added but could not be selected')
    await nextTick()

    expect(document.body.querySelector('.ui-toast--warning')?.textContent).toContain(
      'MIDI note was added but could not be selected',
    )
  })
})
