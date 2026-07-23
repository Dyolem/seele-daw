import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UiButton from '@/ui/components/UiButton.vue'

describe('UiButton', () => {
  it('keeps native Button semantics with stable default styling', () => {
    const wrapper = mount(UiButton, {
      slots: { default: 'Save' },
    })
    const button = wrapper.get('button')

    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toContain('ui-button--secondary')
    expect(button.classes()).toContain('ui-button--medium')
    expect(button.text()).toBe('Save')
  })

  it('maps variants and sizes without changing the native element', () => {
    const wrapper = mount(UiButton, {
      props: { size: 'small', type: 'submit', variant: 'danger' },
      slots: { default: 'Discard' },
    })
    const button = wrapper.get('button')

    expect(button.attributes('type')).toBe('submit')
    expect(button.classes()).toContain('ui-button--danger')
    expect(button.classes()).toContain('ui-button--small')
  })

  it('keeps an optional leading icon in the shared Button layout', () => {
    const wrapper = mount(UiButton, {
      slots: {
        default: 'Save',
        leading: '<span data-testid="save-icon"></span>',
      },
    })

    expect(
      wrapper.get('.ui-button__icon [data-testid="save-icon"]').attributes('data-testid'),
    ).toBe('save-icon')
    expect(wrapper.get('.ui-button__label').text()).toBe('Save')
  })

  it('marks busy work and prevents repeated activation', () => {
    const wrapper = mount(UiButton, {
      props: { busy: true },
      slots: { default: 'Saving' },
    })
    const button = wrapper.get('button')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('.ui-button__progress').exists()).toBe(true)
  })
})
