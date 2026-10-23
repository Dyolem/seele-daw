import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { parseMidiPitch } from '@seele-daw/project-core'
import { afterEach, expect, it, vi } from 'vitest'
import PianoRollPitchControls from '@/features/piano-roll/components/pitch-view/PianoRollPitchControls.vue'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { PIANO_ROLL_PITCH_VIEW_MODE } from '@/features/piano-roll/types/piano-roll-preferences'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('keeps mode and zoom in a keyboard-accessible panel while Fit notes stays directly available', async () => {
  for (const name of ['ResizeObserver', 'IntersectionObserver']) {
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  }
  const pinia = createPinia()
  const keyboard = createTestStudioActionRuntime()
  const focusNotifications = vi.fn<() => void>()
  keyboard.runtime.interfaceTarget.bind({ focusNotifications, showShortcuts: () => undefined })
  const preferences = usePianoRollPreferencesStore(pinia)
  const wrapper = mount(PianoRollPitchControls, {
    props: { pitches: [parseMidiPitch(60), parseMidiPitch(72)] },
    attachTo: document.body,
    global: { plugins: [pinia], provide: keyboard.provide },
  })
  try {
    const body = new DOMWrapper(document.body)
    const trigger = wrapper.get<HTMLButtonElement>('[aria-label="Pitch view settings"]')
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false)
    await trigger.trigger('click')
    await flushPromises()
    expect(body.get('[role="dialog"]').attributes('aria-label')).toBe('Pitch view settings')
    keyboard.bindingRegistry.dispatch('F8')
    expect(focusNotifications).not.toHaveBeenCalled()
    await body.get('[aria-label="Pitch display mode"]').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Standard keys'))
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    )
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Pitch range'))
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
    await flushPromises()
    expect(preferences.pitchViewMode).toBe(PIANO_ROLL_PITCH_VIEW_MODE.RANGE)
    expect(body.find('[role="listbox"]').exists()).toBe(false)
    expect(body.find('[role="dialog"]').exists()).toBe(true)
    await body.get('[aria-label="Zoom in pitch range"]').trigger('click')
    expect(preferences.pitchRangeSize).toBe(20)
    await body.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))
    keyboard.bindingRegistry.dispatch('F8')
    expect(focusNotifications).toHaveBeenCalledTimes(1)
    const fit = wrapper.findAll('button').find((button) => button.text() === 'Fit notes')
    if (fit === undefined) throw new Error('Expected Fit notes action')
    await fit.trigger('click')
    expect(preferences.pitchCenter).toBe(66)
    expect(preferences.pitchRangeSize).toBe(17)
    expect(body.find('[role="dialog"]').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
