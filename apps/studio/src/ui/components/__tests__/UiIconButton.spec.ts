import SaveIcon from '~icons/fluent/save-20-regular'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UiIconButton from '@/ui/components/UiIconButton.vue'

describe('UiIconButton', () => {
  it('provides an accessible name and a decorative icon', () => {
    const wrapper = mount(UiIconButton, {
      props: {
        icon: SaveIcon,
        label: 'Save project',
      },
    })

    const button = wrapper.get('button')

    expect(button.attributes('aria-label')).toBe('Save project')
    expect(button.attributes('title')).toBe('Save project')
    expect(button.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('exposes disabled and pressed states without changing button semantics', async () => {
    const wrapper = mount(UiIconButton, {
      props: {
        disabled: true,
        icon: SaveIcon,
        label: 'Save project',
        pressed: true,
        size: 'small',
      },
    })

    const button = wrapper.get('button')

    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.classes()).toContain('ui-icon-button--small')
  })
})
