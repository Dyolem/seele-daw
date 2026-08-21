import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProjectTempoControl from '@/features/project-workspace/tempo/ProjectTempoControl.vue'

describe('ProjectTempoControl', () => {
  it('emits one editable draft and resets to the authoritative display', async () => {
    const wrapper = mount(ProjectTempoControl, {
      props: { displayBpm: '144', editable: true, mode: 'single' },
    })
    const input = wrapper.get<HTMLInputElement>('input')

    await input.trigger('focus')
    await input.setValue('120.25')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('editStart')).toHaveLength(1)
    expect(wrapper.emitted('commit')).toEqual([['120.25']])
    expect(input.element.value).toBe('144')
  })

  it('cancels an editable draft with Escape', async () => {
    const wrapper = mount(ProjectTempoControl, {
      props: { displayBpm: '120', editable: true, mode: 'single' },
    })
    const input = wrapper.get<HTMLInputElement>('input')

    await input.trigger('focus')
    await input.setValue('90')
    await input.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('commit')).toBeUndefined()
    expect(input.element.value).toBe('120')
  })

  it('keeps a Tempo Map value visibly and semantically read-only', async () => {
    const wrapper = mount(ProjectTempoControl, {
      props: { displayBpm: '90.25', editable: true, mode: 'tempo-map' },
    })
    const input = wrapper.get<HTMLInputElement>('input')

    expect(input.attributes('readonly')).toBeDefined()
    expect(input.attributes('aria-label')).toBe('Current Tempo Map value (BPM)')
    expect(wrapper.text()).toContain('MAP')
    await input.trigger('focus')
    expect(wrapper.emitted('editStart')).toBeUndefined()
  })
})
