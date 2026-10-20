import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UiSelect from '@/ui/components/UiSelect.vue'

const mountedWrappers: VueWrapper[] = []
const channels = Array.from({ length: 16 }, (_, index) => ({
  value: String(index + 1),
  label: `Channel ${index + 1}`,
}))

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function mountSelect(modelValue = '1', disabled = false) {
  const wrapper = mount(UiSelect, {
    attachTo: document.body,
    attrs: { 'aria-label': 'MIDI Channel' },
    props: { modelValue, options: channels, disabled },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function getList(): HTMLElement {
  const list = document.querySelector<HTMLElement>('[role="listbox"]')
  if (list === null) throw new Error('Expected an open Select list')
  return list
}

async function openSelect(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'ArrowDown' })
  await flushPromises()
}

async function pressKey(key: string): Promise<void> {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  )
  await flushPromises()
}

describe('UiSelect', () => {
  it('keeps all sixteen options reachable through keyboard navigation and selection', async () => {
    const wrapper = mountSelect('16')
    await openSelect(wrapper)

    expect(getList().querySelectorAll('[role="option"]')).toHaveLength(16)
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 16'))

    await pressKey('Home')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 1'))
    await pressKey('ArrowDown')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 2'))
    await pressKey('End')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 16'))
    await pressKey('ArrowUp')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 15'))
    await pressKey('Enter')

    expect(wrapper.emitted('update:modelValue')).toEqual([['15']])
    expect(wrapper.get('[role="combobox"]').text()).toBe('Channel 15')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element),
    )
  })

  it('closes with Escape without changing the value and returns focus to the trigger', async () => {
    const wrapper = mountSelect('8')
    await openSelect(wrapper)
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 8'))
    await pressKey('Escape')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element),
    )
  })

  it.each(['outside pointer', 'Escape'])(
    'keeps the selected label throughout opening and closing with %s',
    async (dismissal) => {
      const wrapper = mountSelect('16')
      const trigger = wrapper.get('[role="combobox"]')
      await vi.waitFor(() => expect(trigger.text()).toBe('Channel 16'))
      const observedLabels = [trigger.text()]
      const observer = new MutationObserver((records) => {
        observedLabels.push(trigger.text())
        for (const record of records) {
          if (record.type === 'characterData') observedLabels.push(record.oldValue ?? '')
        }
      })
      observer.observe(trigger.element, {
        childList: true,
        characterData: true,
        characterDataOldValue: true,
        subtree: true,
      })

      try {
        await openSelect(wrapper)
        await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 16'))
        if (dismissal === 'outside pointer') {
          // Outside dismissal is registered on the next task to ignore the opening pointer event.
          await new Promise((resolve) => setTimeout(resolve, 0))
          document.body.dispatchEvent(
            new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }),
          )
          await flushPromises()
        } else {
          await pressKey('Escape')
        }
        await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
        await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))

        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(trigger.text()).toBe('Channel 16')
        expect(new Set(observedLabels)).toEqual(new Set(['Channel 16']))
      } finally {
        observer.disconnect()
      }
    },
  )

  it('updates the label from the current value and options while closed', async () => {
    const wrapper = mountSelect('16')
    const trigger = wrapper.get('[role="combobox"]')
    await vi.waitFor(() => expect(trigger.text()).toBe('Channel 16'))

    await wrapper.setProps({ modelValue: '1' })
    expect(trigger.text()).toBe('Channel 1')
    await wrapper.setProps({ options: [{ value: '1', label: 'First channel' }] })
    expect(trigger.text()).toBe('First channel')
    await wrapper.setProps({ options: [], placeholder: 'Choose a channel' })
    expect(trigger.text()).toBe('Choose a channel')
    await wrapper.setProps({ options: [{ value: '1', label: 'Restored channel' }] })
    expect(trigger.text()).toBe('Restored channel')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('fits the larger side of a short viewport and remeasures after resize or ancestor scroll', async () => {
    vi.stubGlobal('innerHeight', 280)
    const wrapper = mountSelect()
    let top = 120
    vi.spyOn(wrapper.get('button').element, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(100, top, 120, 36),
    )
    await openSelect(wrapper)
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('110px')

    vi.stubGlobal('innerHeight', 400)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('230px')

    top = 350
    document.body.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('336px')
  })

  it('uses the visual viewport when zoom or an onscreen keyboard reduces the available space', async () => {
    const visualViewport = new EventTarget()
    Object.assign(visualViewport, { offsetTop: 100, height: 240 })
    vi.stubGlobal('visualViewport', visualViewport)
    const wrapper = mountSelect()
    vi.spyOn(wrapper.get('button').element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 200, 120, 36),
    )
    await openSelect(wrapper)
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('90px')

    Object.assign(visualViewport, { offsetTop: 160, height: 160 })
    visualViewport.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('70px')

    Object.assign(visualViewport, { height: 120 })
    visualViewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('30px')
  })

  it('stops measuring after the open component unmounts', async () => {
    const wrapper = mountSelect()
    const measure = vi.spyOn(wrapper.get('button').element, 'getBoundingClientRect')
    await openSelect(wrapper)
    wrapper.unmount()
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1)
    await flushPromises()
    measure.mockClear()

    window.dispatchEvent(new Event('resize'))
    document.body.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(measure).not.toHaveBeenCalled()
  })

  it('stops measuring while closed and uses the new trigger position on reopening', async () => {
    vi.stubGlobal('innerHeight', 400)
    const wrapper = mountSelect()
    const measure = vi
      .spyOn(wrapper.get('button').element, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(100, 350, 120, 36))
    await openSelect(wrapper)
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('336px')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Channel 1'))
    await pressKey('Escape')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element),
    )
    measure.mockClear()
    window.dispatchEvent(new Event('resize'))
    document.body.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(measure).not.toHaveBeenCalled()

    measure.mockReturnValue(new DOMRect(100, 10, 120, 36))
    await openSelect(wrapper)
    expect(getList().style.getPropertyValue('--ui-select-available-height')).toBe('340px')
  })

  it('preserves the disabled state and accessible trigger label', async () => {
    const wrapper = mountSelect('1', true)
    expect(wrapper.get('button').attributes('aria-label')).toBe('MIDI Channel')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await openSelect(wrapper)
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })
})
