import {
  createTempoEventRecord,
  parsePositiveTick,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type TempoEventRecord,
} from '@seele-daw/project-core'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TempoTrackLane from '@/features/project-workspace/tempo-track/TempoTrackLane.vue'

const mountedWrappers: VueWrapper[] = []

function tempoEvent(id: string, tick: number, bpm: number): TempoEventRecord {
  return createTempoEventRecord({
    bpm: parseTempoBpm(bpm),
    id: parseTempoEventId(id),
    tick: parseTick(tick),
  })
}

const INITIAL_EVENT = tempoEvent('tempo-track-lane-initial', 0, 120)
const LATER_EVENT = tempoEvent('tempo-track-lane-later', 960, 100)

function mountLane(
  input: {
    readonly editingDisabled?: boolean
    readonly selectedTempoEventId?: TempoEventRecord['id'] | null
  } = {},
) {
  const wrapper = mount(TempoTrackLane, {
    props: {
      barSpanTick: parsePositiveTick(3_840),
      editingDisabled: input.editingDisabled ?? false,
      selectedTempoEventId: input.selectedTempoEventId ?? null,
      tempoEvents: Object.freeze([INITIAL_EVENT, LATER_EVENT]),
      timelineEndTick: parseTick(3_840),
    },
  })
  mountedWrappers.push(wrapper)
  const plot = wrapper.get('.tempo-track-lane__plot').element as HTMLElement
  vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
    bottom: 150,
    height: 100,
    left: 100,
    right: 1_100,
    toJSON: () => ({}),
    top: 50,
    width: 1_000,
    x: 100,
    y: 50,
  })
  return { plot, wrapper }
}

async function dispatchPointer(
  target: Element,
  type: string,
  input: {
    readonly button?: number
    readonly clientX: number
    readonly clientY: number
    readonly isPrimary?: boolean
    readonly pointerId: number
  },
): Promise<void> {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: input.button ?? 0,
    cancelable: true,
    clientX: input.clientX,
    clientY: input.clientY,
  })
  Object.defineProperties(event, {
    isPrimary: { value: input.isPrimary ?? true },
    pointerId: { value: input.pointerId },
  })
  target.dispatchEvent(event)
  await Promise.resolve()
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('TempoTrackLane', () => {
  it('renders step segments and transform-positioned Tempo points', () => {
    const { wrapper } = mountLane({ selectedTempoEventId: LATER_EVENT.id })
    const points = wrapper.findAll('.tempo-track-lane__point')

    expect(points).toHaveLength(2)
    expect(wrapper.findAll('.tempo-track-lane__segment')).toHaveLength(2)
    expect(points[0]?.attributes('style')).toContain('translate3d(0rem, -50%, 0)')
    expect(points[1]?.attributes('style')).toContain('translate3d(1.25rem, -50%, 0)')
    expect(points[1]?.classes()).toContain('tempo-track-lane__point--selected')
  })

  it('maps a blank-lane double-click to one Add intent', async () => {
    const { plot, wrapper } = mountLane()
    plot.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 600,
        clientY: 100,
      }),
    )
    await Promise.resolve()

    expect(wrapper.emitted('add')).toEqual([[{ bpm: parseTempoBpm(140), tick: parseTick(1_920) }]])
  })

  it('locks horizontal drag, previews silently, and emits one Move on release', async () => {
    const { wrapper } = mountLane()
    const point = wrapper.findAll('.tempo-track-lane__point')[1]!

    await dispatchPointer(point.element, 'pointerdown', {
      clientX: 350,
      clientY: 110,
      pointerId: 7,
    })
    await dispatchPointer(point.element, 'pointermove', {
      clientX: 600,
      clientY: 112,
      pointerId: 7,
    })

    expect(wrapper.emitted('select')).toEqual([[LATER_EVENT.id]])
    expect(wrapper.emitted('editStart')).toHaveLength(1)
    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.findAll('.tempo-track-lane__point')[1]?.attributes('style')).toContain(
      'translate3d(2.5rem, -50%, 0)',
    )

    await dispatchPointer(point.element, 'pointerup', {
      clientX: 600,
      clientY: 112,
      pointerId: 7,
    })
    expect(wrapper.emitted('move')).toEqual([[LATER_EVENT.id, parseTick(1_920)]])
    expect(wrapper.emitted('bpmChange')).toBeUndefined()
  })

  it('locks vertical drag and emits one BPM replacement on release', async () => {
    const { wrapper } = mountLane()
    const point = wrapper.findAll('.tempo-track-lane__point')[1]!

    await dispatchPointer(point.element, 'pointerdown', {
      clientX: 350,
      clientY: 110,
      pointerId: 8,
    })
    await dispatchPointer(point.element, 'pointermove', {
      clientX: 352,
      clientY: 100,
      pointerId: 8,
    })
    expect(wrapper.emitted('bpmChange')).toBeUndefined()

    await dispatchPointer(point.element, 'pointerup', {
      clientX: 352,
      clientY: 100,
      pointerId: 8,
    })
    expect(wrapper.emitted('bpmChange')).toEqual([[LATER_EVENT.id, parseTempoBpm(120)]])
    expect(wrapper.emitted('move')).toBeUndefined()
  })

  it('cancels an active preview from the global Escape path without committing', async () => {
    const { wrapper } = mountLane()
    const point = wrapper.findAll('.tempo-track-lane__point')[1]!

    await dispatchPointer(point.element, 'pointerdown', {
      clientX: 350,
      clientY: 110,
      pointerId: 81,
    })
    await dispatchPointer(point.element, 'pointermove', {
      clientX: 600,
      clientY: 112,
      pointerId: 81,
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    await Promise.resolve()

    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.emitted('bpmChange')).toBeUndefined()
    expect(wrapper.findAll('.tempo-track-lane__point')[1]?.attributes('style')).toContain(
      'translate3d(1.25rem, -50%, 0)',
    )
  })

  it('blocks moving or deleting the initial point while allowing later-point deletion', async () => {
    const initialFixture = mountLane({ selectedTempoEventId: INITIAL_EVENT.id })
    const initialPoint = initialFixture.wrapper.findAll('.tempo-track-lane__point')[0]!
    await dispatchPointer(initialPoint.element, 'pointerdown', {
      clientX: 100,
      clientY: 90,
      pointerId: 9,
    })
    await dispatchPointer(initialPoint.element, 'pointermove', {
      clientX: 400,
      clientY: 91,
      pointerId: 9,
    })
    await dispatchPointer(initialPoint.element, 'pointerup', {
      clientX: 400,
      clientY: 91,
      pointerId: 9,
    })
    await initialPoint.trigger('keydown', { key: 'Delete' })
    expect(initialFixture.wrapper.emitted('move')).toBeUndefined()
    expect(initialFixture.wrapper.emitted('remove')).toBeUndefined()

    const laterFixture = mountLane({ selectedTempoEventId: LATER_EVENT.id })
    await laterFixture.wrapper
      .findAll('.tempo-track-lane__point')[1]!
      .trigger('keydown', { key: 'Backspace' })
    expect(laterFixture.wrapper.emitted('remove')).toEqual([[LATER_EVENT.id]])
  })

  it('keeps selection available but suppresses mutations while editing is disabled', async () => {
    const { plot, wrapper } = mountLane({ editingDisabled: true })
    const point = wrapper.findAll('.tempo-track-lane__point')[1]!

    await dispatchPointer(point.element, 'pointerdown', {
      clientX: 350,
      clientY: 110,
      pointerId: 10,
    })
    plot.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        button: 0,
        clientX: 600,
        clientY: 100,
      }),
    )
    await Promise.resolve()

    expect(wrapper.emitted('select')).toEqual([[LATER_EVENT.id]])
    expect(wrapper.emitted('add')).toBeUndefined()
    expect(wrapper.emitted('editStart')).toBeUndefined()
  })
})
