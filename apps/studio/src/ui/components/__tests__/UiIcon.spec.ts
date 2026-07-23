import MidiIcon from '~icons/fluent/midi-24-regular'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UiIcon from '@/ui/components/UiIcon.vue'

describe('UiIcon', () => {
  it('renders bundled Fluent icon data as a decorative fixed-size SVG', () => {
    const wrapper = mount(UiIcon, {
      props: {
        icon: MidiIcon,
        size: 24,
      },
    })

    const icon = wrapper.get('svg')

    expect(icon.classes()).toContain('ui-icon--24')
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(icon.attributes('focusable')).toBe('false')
  })

  it('uses the standard 20 px size by default', () => {
    const wrapper = mount(UiIcon, {
      props: {
        icon: MidiIcon,
      },
    })

    expect(wrapper.get('svg').classes()).toContain('ui-icon--20')
  })
})
