import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TempoTrackControl from '@/features/project-workspace/tempo-track/TempoTrackControl.vue'

const INITIAL_EVENT = createTempoEventRecord({
  bpm: parseTempoBpm(143.999_884_800_092_16),
  id: parseTempoEventId('tempo-track-control-initial'),
  tick: parseTick(0),
})
const LATER_EVENT = createTempoEventRecord({
  bpm: parseTempoBpm(96.5),
  id: parseTempoEventId('tempo-track-control-later'),
  tick: parseTick(960),
})
const INITIAL_LOCATION = Object.freeze({
  musicalPosition: '1 · 1 · 0/960',
  projectTime: '00:00.000',
  title: 'Bar 1, beat 1, 0 of 960 ticks; Project Tick 0; Project time 00:00.000',
})

describe('TempoTrackControl', () => {
  it('edits the selected point through the same two-decimal input surface', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: true,
        canNavigateToPrevious: false,
        editingDisabled: false,
        selectedTempoEvent: INITIAL_EVENT,
        selectedTempoEventLocation: INITIAL_LOCATION,
      },
    })
    const input = wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event BPM"]')

    expect(input.element.value).toBe('144')
    expect(wrapper.text()).toContain('1 · 1 · 0/960')
    expect(wrapper.text()).toContain('00:00.000')
    expect(wrapper.get('.tempo-track-control__location').attributes('title')).toContain(
      'Project Tick 0',
    )
    await input.trigger('focus')
    await input.setValue('121.25')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('editStart')).toHaveLength(1)
    expect(wrapper.emitted('bpmCommit')).toEqual([[INITIAL_EVENT.id, '121.25']])
  })

  it('protects the initial point but exposes removal for a later selected point', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: true,
        canNavigateToPrevious: false,
        editingDisabled: false,
        selectedTempoEvent: INITIAL_EVENT,
        selectedTempoEventLocation: INITIAL_LOCATION,
      },
    })
    const remove = wrapper.get<HTMLButtonElement>('.tempo-track-control__remove')
    expect(remove.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ selectedTempoEvent: LATER_EVENT })
    expect(remove.attributes('disabled')).toBeUndefined()
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[LATER_EVENT.id]])
  })

  it('shows an honest empty state before a Tempo point is selected', () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: false,
        canNavigateToPrevious: false,
        editingDisabled: false,
        selectedTempoEvent: null,
        selectedTempoEventLocation: null,
      },
    })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('Select a Tempo point')
  })

  it('offers explicit previous, next, and reveal navigation without editing facts', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: true,
        canNavigateToPrevious: true,
        editingDisabled: true,
        selectedTempoEvent: LATER_EVENT,
        selectedTempoEventLocation: Object.freeze({
          musicalPosition: '1 · 2 · 0/960',
          projectTime: '00:00.500',
          title: 'Later event',
        }),
      },
    })

    await wrapper.get('button[aria-label="Select previous Tempo Event"]').trigger('click')
    await wrapper
      .get('button[aria-label="Reveal selected Tempo Event on Timeline"]')
      .trigger('click')
    await wrapper.get('button[aria-label="Select next Tempo Event"]').trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([['previous'], ['next']])
    expect(wrapper.emitted('reveal')).toHaveLength(1)
    expect(wrapper.emitted('bpmCommit')).toBeUndefined()
  })
})
