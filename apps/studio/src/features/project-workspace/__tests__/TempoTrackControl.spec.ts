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
  barNumber: 1,
  beatNumber: 1,
  maximumOffsetWithinBeat: 959,
  offsetWithinBeat: 0,
  projectTime: '00:00.000',
  title: 'Bar 1, beat 1, offset 0 within beat; Project Tick 0; Project time 00:00.000',
})
const LATER_LOCATION = Object.freeze({
  barNumber: 1,
  beatNumber: 2,
  maximumOffsetWithinBeat: 959,
  offsetWithinBeat: 0,
  projectTime: '00:00.500',
  title: 'Bar 1, beat 2, offset 0 within beat; Project Tick 960; Project time 00:00.500',
})

describe('TempoTrackControl', () => {
  it('edits the selected point through the same two-decimal input surface', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: true,
        canNavigateToPrevious: false,
        editingDisabled: false,
        selectedTempoEvent: INITIAL_EVENT,
        selectedTempoEventIsInitial: true,
        selectedTempoEventLocation: INITIAL_LOCATION,
      },
    })
    const input = wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event BPM"]')

    expect(input.element.value).toBe('144')
    expect(
      wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event bar"]').element.value,
    ).toBe('1')
    expect(
      wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event beat"]').element.value,
    ).toBe('1')
    expect(
      wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event offset within beat"]')
        .element.value,
    ).toBe('0')
    expect(wrapper.text()).not.toContain('/960')
    expect(wrapper.text()).toContain('TIME')
    expect(wrapper.text()).toContain('00:00.000')
    expect(wrapper.get('.tempo-track-control__position').attributes('title')).toContain(
      'Project Tick 0',
    )
    await input.trigger('focus')
    await input.setValue('121.25')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('editStart')).toHaveLength(1)
    expect(wrapper.emitted('bpmCommit')).toEqual([[INITIAL_EVENT.id, '121.25']])
  })

  it('commits a precise musical position for a movable Tempo Event', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: false,
        canNavigateToPrevious: true,
        editingDisabled: false,
        selectedTempoEvent: LATER_EVENT,
        selectedTempoEventIsInitial: false,
        selectedTempoEventLocation: LATER_LOCATION,
      },
    })
    const bar = wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event bar"]')
    const beat = wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event beat"]')
    const offset = wrapper.get<HTMLInputElement>(
      'input[aria-label="Selected Tempo Event offset within beat"]',
    )

    await bar.trigger('focus')
    await bar.setValue('5')
    await wrapper.get('.tempo-track-control__position').trigger('focusout', {
      relatedTarget: beat.element,
    })
    expect(wrapper.emitted('positionCommit')).toBeUndefined()
    await beat.setValue('2')
    await offset.setValue('240')
    await offset.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('editStart')).toHaveLength(1)
    expect(wrapper.emitted('positionCommit')).toEqual([
      [LATER_EVENT.id, { bar: '5', beat: '2', offset: '240' }],
    ])
  })

  it('protects the initial point but exposes removal for a later selected point', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: {
        canNavigateToNext: true,
        canNavigateToPrevious: false,
        editingDisabled: false,
        selectedTempoEvent: INITIAL_EVENT,
        selectedTempoEventIsInitial: true,
        selectedTempoEventLocation: INITIAL_LOCATION,
      },
    })
    const remove = wrapper.get<HTMLButtonElement>('.tempo-track-control__remove')
    const position = wrapper.get<HTMLInputElement>(
      'input[aria-label="Selected Tempo Event offset within beat"]',
    )
    expect(remove.attributes('disabled')).toBeDefined()
    expect(position.attributes('readonly')).toBeDefined()

    await wrapper.setProps({
      selectedTempoEvent: LATER_EVENT,
      selectedTempoEventIsInitial: false,
      selectedTempoEventLocation: LATER_LOCATION,
    })
    expect(remove.attributes('disabled')).toBeUndefined()
    expect(position.attributes('readonly')).toBeUndefined()
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
        selectedTempoEventIsInitial: false,
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
        selectedTempoEventIsInitial: false,
        selectedTempoEventLocation: LATER_LOCATION,
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
