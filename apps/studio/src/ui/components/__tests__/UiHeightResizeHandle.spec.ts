import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UiHeightResizeHandle from '@/ui/components/UiHeightResizeHandle.vue'

function mountHandle() {
  const height = ref(120)
  const maximum = ref(240)
  const wrapper = mount(
    defineComponent(
      () => () =>
        h(UiHeightResizeHandle, {
          label: 'Resize panel',
          modelValue: height.value,
          minimum: 64,
          maximum: maximum.value,
          'onUpdate:modelValue': (value) => {
            height.value = value
          },
        }),
    ),
    { attachTo: document.body },
  )
  const handle = wrapper.get('[role="separator"]')
  let captured: number | null = null
  Object.defineProperties(handle.element, {
    setPointerCapture: {
      value: (id: number) => {
        captured = id
      },
    },
    hasPointerCapture: { value: (id: number) => captured === id },
    releasePointerCapture: {
      value: () => {
        captured = null
      },
    },
  })
  function pointer(type: string, y: number, pointerId = 1) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 })
    Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } })
    handle.element.dispatchEvent(event)
  }
  return { wrapper, handle, height, maximum, pointer, captured: () => captured }
}
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('UiHeightResizeHandle', () => {
  it('uses final pointer coordinates and clamps keyboard adjustments', async () => {
    const fixture = mountHandle()
    fixture.pointer('pointerdown', 200)
    fixture.pointer('pointerup', 150)
    await nextTick()
    expect(fixture.height.value).toBe(170)
    expect(fixture.captured()).toBeNull()
    await fixture.handle.trigger('keydown', { key: 'End' })
    await fixture.handle.trigger('keydown', { key: 'ArrowUp' })
    expect(fixture.height.value).toBe(240)
    await fixture.handle.trigger('keydown', { key: 'Home' })
    expect(fixture.height.value).toBe(64)
    fixture.wrapper.unmount()
  })

  it('keeps an oversized preference on a click without resizing', async () => {
    const fixture = mountHandle()
    fixture.height.value = 300
    await nextTick()
    fixture.pointer('pointerdown', 200)
    fixture.pointer('pointerup', 200)
    expect(fixture.height.value).toBe(300)
    fixture.wrapper.unmount()
  })

  it.each(['escape', 'blur', 'lostcapture', 'pointercancel', 'bounds', 'unmount'] as const)(
    'restores preference and rejects late pointerup after %s',
    async (reason) => {
      const fixture = mountHandle()
      fixture.pointer('pointerdown', 200)
      fixture.pointer('pointermove', 140)
      await nextTick()
      expect(fixture.height.value).toBe(180)
      fixture.pointer('pointercancel', 140, 2)
      expect(fixture.captured()).toBe(1)
      if (reason === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      if (reason === 'lostcapture') fixture.pointer('lostpointercapture', 140)
      if (reason === 'pointercancel') fixture.pointer('pointercancel', 140)
      if (reason === 'bounds') {
        fixture.maximum.value = 200
        await nextTick()
      }
      if (reason === 'unmount') fixture.wrapper.unmount()
      fixture.pointer('pointerup', 100)
      expect(fixture.height.value).toBe(120)
      expect(fixture.captured()).toBeNull()
      if (reason !== 'unmount') fixture.wrapper.unmount()
    },
  )
})
