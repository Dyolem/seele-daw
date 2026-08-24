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

describe('TempoTrackControl', () => {
  it('edits the selected point through the same two-decimal input surface', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: { editingDisabled: false, selectedTempoEvent: INITIAL_EVENT },
    })
    const input = wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event BPM"]')

    expect(input.element.value).toBe('144')
    expect(wrapper.text()).toContain('Tick 0')
    await input.trigger('focus')
    await input.setValue('121.25')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('editStart')).toHaveLength(1)
    expect(wrapper.emitted('bpmCommit')).toEqual([[INITIAL_EVENT.id, '121.25']])
  })

  it('protects the initial point but exposes removal for a later selected point', async () => {
    const wrapper = mount(TempoTrackControl, {
      props: { editingDisabled: false, selectedTempoEvent: INITIAL_EVENT },
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
      props: { editingDisabled: false, selectedTempoEvent: null },
    })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('Select a Tempo point')
  })
})
