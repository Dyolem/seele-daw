import { nextTick } from 'vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { createReplaceTempoEventBpmCommand } from '@seele-daw/project-core'
import {
  createTempoTrackTestSession,
  dispatchTempoPointer,
  installTempoResizeObserver,
} from './support/tempo-track-test-support'
import { TEMPO_EVENT_ACTION_CONTEXT_KEY, TEMPO_TRACK_PREVIEW_KEY } from '@/symbols'
import { createPinia } from 'pinia'
import {
  createTempoTrackTestActions,
  installTempoPointerCapture,
} from './support/tempo-track-test-support'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import {
  type StudioActionCompletion,
  STUDIO_ACTION_COMPLETED,
} from '@/workbench/actions/studio-action'
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
import { createTempoTrackPreviewController } from '@/features/project-workspace/tempo-track/tempo-track-preview'
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
    readonly projectId?: string
    readonly selectedTempoEventId?: TempoEventRecord['id'] | null
    readonly tempoEvents?: readonly TempoEventRecord[]
  } = {},
) {
  const keyboard = createTestStudioActionRuntime()
  const actions = createTempoTrackTestActions(
    input.tempoEvents ?? [INITIAL_EVENT, LATER_EVENT],
    input.projectId,
  )
  const { remove, commitDrag, session, projectedRevision } = actions
  const controller = createTempoTrackPreviewController()
  const interaction = {
    ...controller,
    publishPreview: vi.fn<typeof controller.publishPreview>(controller.publishPreview),
  }
  const pinia = createPinia()
  const toasts = useUiToastStore(pinia)
  const wrapper = mount(TempoTrackLane, {
    attachTo: document.body,
    props: {
      barSpanTick: parsePositiveTick(3_840),
      editingDisabled: input.editingDisabled ?? false,
      projectId: input.projectId ?? 'tempo-track-project',
      selectedTempoEventId: input.selectedTempoEventId ?? null,
      tempoEvents: input.tempoEvents ?? Object.freeze([INITIAL_EVENT, LATER_EVENT]),
      timelineEndTick: parseTick(3_840),
    },
    global: {
      plugins: [pinia],
      provide: {
        ...keyboard.provide,
        [TEMPO_EVENT_ACTION_CONTEXT_KEY as symbol]: actions.context,
        [TEMPO_TRACK_PREVIEW_KEY as symbol]: interaction,
      },
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
  const capture = installTempoPointerCapture(plot)
  async function syncProjection() {
    const update = wrapper.setProps({ tempoEvents: session.value.getSnapshot().tempoEvents })
    projectedRevision.value = session.value.modelRevision
    await update
  }
  return {
    interaction,
    plot,
    wrapper,
    keyboard,
    remove,
    commitDrag,
    session,
    projectedRevision,
    capture,
    syncProjection,
    toasts,
  }
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
  vi.unstubAllGlobals()
})

describe('TempoTrackLane', () => {
  it('keeps a newer preview when an old interaction attempts to publish or clear it', () => {
    const projection = createTempoTrackPreviewController()
    const old = Symbol('old')
    const current = Symbol('current')
    const original = { tempoEventId: LATER_EVENT.id, tick: LATER_EVENT.tick, bpm: LATER_EVENT.bpm }
    projection.publishPreview(old, original)
    projection.cancelPreview(old)
    projection.publishPreview(current, { ...original, tick: parseTick(1_920) })
    expect(projection.cancelPreview(old)).toBe(false)
    expect(projection.publishPreview(old, original)).toBe(false)
    expect(projection.preview.value?.tick).toBe(1_920)
  })

  it('reports delayed handoff display failures as post-commit warnings and clears the preview', async () => {
    const { plot, wrapper, interaction, session, syncProjection, toasts } = mountLane()
    dispatchTempoPointer(wrapper.findAll('.tempo-track-lane__point')[1]!.element, 'pointerdown')
    dispatchTempoPointer(plot, 'pointerup', { x: 600 })
    const revision = session.value.modelRevision
    vi.spyOn(interaction, 'cancelPreview').mockImplementationOnce(() => {
      throw new Error('Delayed projection failed')
    })
    await syncProjection()
    expect(session.value.modelRevision).toBe(revision)
    expect(session.value.getSnapshot().tempoEvents[1]?.tick).toBe(1_920)
    expect(interaction.preview.value).toBeNull()
    expect(toasts.message?.title).toBe('Tempo edit was committed but could not be displayed')
  })

  it.each(['pointercancel', 'lostpointercapture', 'blur'])(
    'releases capture and ignores late End after %s',
    async (reason) => {
      const { plot, wrapper, interaction, capture, commitDrag } = mountLane()
      const point = wrapper.findAll('.tempo-track-lane__point')[1]!.element
      dispatchTempoPointer(point, 'pointerdown')
      dispatchTempoPointer(plot, 'pointermove', { x: 600 })
      expect(capture.captures.has(7)).toBe(true)
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      else {
        if (reason === 'lostpointercapture') capture.captures.delete(7)
        dispatchTempoPointer(plot, reason)
      }
      dispatchTempoPointer(plot, 'pointerup', { x: 600 })
      await nextTick()
      expect(interaction.preview.value).toBeNull()
      expect(commitDrag).not.toHaveBeenCalled()
      expect(capture.captures.size).toBe(0)
    },
  )

  it('cancels on external facts before commit notification reaches Vue', () => {
    const { plot, wrapper, interaction, capture, commitDrag, session } = mountLane()
    const point = wrapper.findAll('.tempo-track-lane__point')[1]!.element
    dispatchTempoPointer(point, 'pointerdown')
    dispatchTempoPointer(plot, 'pointermove', { x: 600 })
    session.value.execute(
      createReplaceTempoEventBpmCommand({
        baseRevision: session.value.modelRevision,
        tempoEventId: INITIAL_EVENT.id,
        bpm: parseTempoBpm(140),
      }),
    )
    dispatchTempoPointer(plot, 'pointerup', { x: 600 })
    expect(commitDrag).not.toHaveBeenCalled()
    expect(capture.captures.size).toBe(0)
    expect(interaction.preview.value).toBeNull()
  })

  it('cancels when Session identity changes even if Project IDs and revisions match', () => {
    const { plot, wrapper, interaction, capture, commitDrag, session } = mountLane()
    dispatchTempoPointer(wrapper.findAll('.tempo-track-lane__point')[1]!.element, 'pointerdown')
    dispatchTempoPointer(plot, 'pointermove', { x: 600 })
    const replacement = createTempoTrackTestSession([INITIAL_EVENT, LATER_EVENT])
    expect(replacement.modelRevision).toBe(session.value.modelRevision)
    session.value = replacement
    dispatchTempoPointer(plot, 'pointerup', { x: 600 })
    expect(commitDrag).not.toHaveBeenCalled()
    expect(capture.captures.size).toBe(0)
    expect(interaction.preview.value).toBeNull()
  })

  it('keeps equal mapping changes but cancels when scrolling moves the Lane', () => {
    const { plot, wrapper, interaction, capture, commitDrag } = mountLane()
    dispatchTempoPointer(wrapper.findAll('.tempo-track-lane__point')[1]!.element, 'pointerdown')
    dispatchTempoPointer(plot, 'pointermove', { x: 600 })
    window.dispatchEvent(new Event('scroll'))
    expect(interaction.preview.value?.tick).toBe(1_920)
    const bounds = plot.getBoundingClientRect()
    vi.mocked(plot.getBoundingClientRect).mockReturnValue({ ...bounds, left: 80 })
    window.dispatchEvent(new Event('scroll'))
    dispatchTempoPointer(plot, 'pointerup', { x: 600 })
    expect(interaction.preview.value).toBeNull()
    expect(capture.captures.size).toBe(0)
    expect(commitDrag).not.toHaveBeenCalled()
  })

  it.each(['timeline', 'loading', 'selection'] as const)(
    'invalidates the frozen target on %s changes',
    async (change) => {
      const { plot, wrapper, interaction, capture, commitDrag } = mountLane()
      dispatchTempoPointer(wrapper.findAll('.tempo-track-lane__point')[1]!.element, 'pointerdown')
      dispatchTempoPointer(plot, 'pointermove', { x: 600 })
      if (change === 'timeline') await wrapper.setProps({ timelineEndTick: parseTick(7_680) })
      else if (change === 'loading') await wrapper.setProps({ editingDisabled: true })
      else await wrapper.setProps({ selectedTempoEventId: INITIAL_EVENT.id })
      dispatchTempoPointer(plot, 'pointerup', { x: 600 })
      expect(interaction.preview.value).toBeNull()
      expect(capture.captures.size).toBe(0)
      expect(commitDrag).not.toHaveBeenCalled()
    },
  )

  it('releases resized and unmounted captures and ignores queued observer callbacks', () => {
    const observers = installTempoResizeObserver()
    const { plot, wrapper, interaction, capture, commitDrag } = mountLane()
    const point = wrapper.findAll('.tempo-track-lane__point')[1]!.element
    dispatchTempoPointer(point, 'pointerdown')
    const bounds = plot.getBoundingClientRect()
    vi.mocked(plot.getBoundingClientRect).mockReturnValue({ ...bounds, height: 200 })
    observers[0]!.deliver()
    expect(interaction.preview.value).toBeNull()
    expect(capture.captures.size).toBe(0)
    dispatchTempoPointer(point, 'pointerdown')
    wrapper.unmount()
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1)
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce()
    vi.mocked(plot.getBoundingClientRect).mockImplementation(() => {
      throw new Error('Released element accessed')
    })
    expect(() => observers[0]!.deliver()).not.toThrow()
    dispatchTempoPointer(plot, 'pointerup', { x: 600 })
    expect(commitDrag).not.toHaveBeenCalled()
    expect(capture.captures.size).toBe(0)
  })

  it('cleans up when observation fails partway through mount', () => {
    const observers = installTempoResizeObserver(true)
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    expect(() => mountLane()).toThrow('Tempo viewport observation failed')
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce()
    const ownedListeners = addListener.mock.calls.filter(([event]) =>
      ['scroll', 'resize', 'blur', 'keydown', 'keyup'].includes(event),
    )
    for (const [event, handler] of ownedListeners) {
      expect(
        removeListener.mock.calls.some(
          ([removedEvent, removedHandler]) => removedEvent === event && removedHandler === handler,
        ),
      ).toBe(true)
    }
  })

  it('reports post-commit preview failures without claiming that the committed facts were rejected', () => {
    const { plot, wrapper, interaction, commitDrag, session, toasts } = mountLane()
    const apply = commitDrag.getMockImplementation()!
    commitDrag.mockImplementation((intent) => {
      const result = apply(intent)
      interaction.publishPreview.mockImplementationOnce(() => {
        throw new Error('Projection failed')
      })
      return result
    })
    const revision = session.value.modelRevision
    dispatchTempoPointer(wrapper.findAll('.tempo-track-lane__point')[1]!.element, 'pointerdown')
    dispatchTempoPointer(plot, 'pointerup', { x: 600 })
    expect(session.value.modelRevision).toBe(revision + 1)
    expect(session.value.getSnapshot().tempoEvents[1]?.tick).toBe(1_920)
    expect(interaction.preview.value).toBeNull()
    expect(toasts.message?.title).toBe('Tempo edit was committed but could not be displayed')
  })

  it('uses focused Tempo selection instead of a previous Note target and never treats focus as selection', async () => {
    const { keyboard, remove, wrapper } = mountLane({ selectedTempoEventId: LATER_EVENT.id })
    const removeNotes = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    keyboard.runtime.selectionTarget.bind({
      isFocused: () => true,
      hasSelection: () => true,
      selectionLabel: () => 'Notes',
      deleteSelection: removeNotes,
    })
    const laterPoint = wrapper.findAll('.tempo-track-lane__point')[1]!.element as HTMLElement
    laterPoint.focus()
    expect(keyboard.bindingRegistry.dispatch('Delete').defaultPrevented).toBe(true)
    expect(remove).toHaveBeenCalledExactlyOnceWith(LATER_EVENT.id)
    expect(removeNotes).not.toHaveBeenCalled()
    await wrapper.setProps({ selectedTempoEventId: INITIAL_EVENT.id })
    expect(keyboard.bindingRegistry.dispatch('Delete').defaultPrevented).toBe(false)
    expect(remove).toHaveBeenCalledOnce()
    expect(removeNotes).not.toHaveBeenCalled()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(keyboard.bindingRegistry.dispatch('Escape').defaultPrevented).toBe(false)
  })

  it('renders a continuous selected Step contour with center-anchored Tempo points', () => {
    const { wrapper } = mountLane({ selectedTempoEventId: LATER_EVENT.id })
    const points = wrapper.findAll('.tempo-track-lane__point')
    const transitions = wrapper.findAll('.tempo-track-lane__transition')

    expect(points).toHaveLength(2)
    expect(wrapper.findAll('.tempo-track-lane__segment')).toHaveLength(2)
    expect(transitions).toHaveLength(1)
    expect(points[0]?.attributes('style')).toContain('translate3d(calc(0rem - 50%), -50%, 0)')
    expect(points[1]?.attributes('style')).toContain('translate3d(calc(1.25rem - 50%), -50%, 0)')
    expect(points[1]?.classes()).toContain('tempo-track-lane__point--selected')
    expect(transitions[0]?.attributes('style')).toContain('block-size: 10%')
    expect(transitions[0]?.classes()).toContain('tempo-track-lane__transition--selected')
    expect(wrapper.findAll('.tempo-track-lane__segment')[1]?.classes()).toContain(
      'tempo-track-lane__segment--selected',
    )
  })

  it('selects the owning Event from horizontal and vertical Step contour hits', async () => {
    const { wrapper } = mountLane()
    const segments = wrapper.findAll('.tempo-track-lane__segment')
    const transition = wrapper.get('.tempo-track-lane__transition')

    await segments[0]!.trigger('click')
    await transition.trigger('click')
    await transition.trigger('dblclick')

    expect(wrapper.emitted('select')).toEqual([[INITIAL_EVENT.id], [LATER_EVENT.id]])
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('resolves a dense overlap by geometry instead of DOM paint order', async () => {
    const denseEarlier = tempoEvent('tempo-track-lane-dense-earlier', 960, 100)
    const denseLater = tempoEvent('tempo-track-lane-dense-later', 980, 102)
    const { wrapper } = mountLane({
      editingDisabled: true,
      tempoEvents: Object.freeze([INITIAL_EVENT, denseEarlier, denseLater]),
    })
    const earlierPoint = wrapper.findAll('.tempo-track-lane__point')[1]!

    await dispatchPointer(earlierPoint.element, 'pointerdown', {
      clientX: 355,
      clientY: 119,
      pointerId: 6,
    })

    expect(wrapper.emitted('select')).toEqual([[denseLater.id]])
  })

  it('keeps an expanded view stable within one Project and resets it for another Project', async () => {
    const extremeEvent = tempoEvent('tempo-track-lane-extreme', 1_920, 999)
    const { wrapper } = mountLane()

    await wrapper.setProps({ tempoEvents: Object.freeze([INITIAL_EVENT, extremeEvent]) })
    expect(wrapper.get('.tempo-track-lane__scale--maximum').text()).toBe('999')

    await wrapper.setProps({ tempoEvents: Object.freeze([INITIAL_EVENT, LATER_EVENT]) })
    expect(wrapper.get('.tempo-track-lane__scale--maximum').text()).toBe('999')

    await wrapper.setProps({
      projectId: 'tempo-track-other-project',
      tempoEvents: Object.freeze([INITIAL_EVENT, LATER_EVENT]),
    })
    expect(wrapper.get('.tempo-track-lane__scale--maximum').text()).toBe('240')
    expect(wrapper.get('.tempo-track-lane__scale--minimum').text()).toBe('40')
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

  it('selects rather than adds when a double-click lands inside an existing point hit radius', async () => {
    const { plot, wrapper } = mountLane()
    plot.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 350,
        clientY: 120,
      }),
    )
    await Promise.resolve()

    expect(wrapper.emitted('select')).toEqual([[LATER_EVENT.id]])
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('locks horizontal drag, commits once and keeps the preview until facts are projected', async () => {
    const { interaction, wrapper, commitDrag, session, syncProjection } = mountLane()
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
    expect(commitDrag).not.toHaveBeenCalled()
    expect(interaction.preview.value).toEqual({
      bpm: LATER_EVENT.bpm,
      tempoEventId: LATER_EVENT.id,
      tick: parseTick(1_920),
    })
    expect(wrapper.findAll('.tempo-track-lane__point')[1]?.attributes('style')).toContain(
      'translate3d(calc(2.5rem - 50%), -50%, 0)',
    )

    await dispatchPointer(point.element, 'pointerup', {
      clientX: 600,
      clientY: 112,
      pointerId: 7,
    })
    expect(commitDrag).toHaveBeenCalledOnce()
    expect(commitDrag.mock.calls[0]?.[0]).toMatchObject({
      axis: 'tick',
      tempoEventId: LATER_EVENT.id,
      tick: 1_920,
      target: { expectedSession: session.value },
    })
    expect(interaction.preview.value?.tick).toBe(1_920)
    await syncProjection()
    expect(interaction.preview.value).toBeNull()
  })

  it('locks vertical drag and commits one BPM replacement on release', async () => {
    const { wrapper, commitDrag } = mountLane()
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
    expect(commitDrag).not.toHaveBeenCalled()

    await dispatchPointer(point.element, 'pointerup', {
      clientX: 352,
      clientY: 100,
      pointerId: 8,
    })
    expect(commitDrag).toHaveBeenCalledOnce()
    expect(commitDrag.mock.calls[0]?.[0]).toMatchObject({
      axis: 'bpm',
      tempoEventId: LATER_EVENT.id,
      bpm: 120,
    })
  })

  it('cancels an active preview from the global Escape path without committing', async () => {
    const { interaction, wrapper, keyboard, commitDrag } = mountLane()
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
    keyboard.bindingRegistry.dispatch('Escape')
    await Promise.resolve()

    expect(commitDrag).not.toHaveBeenCalled()
    expect(interaction.preview.value).toBeNull()
    expect(wrapper.findAll('.tempo-track-lane__point')[1]?.attributes('style')).toContain(
      'translate3d(calc(1.25rem - 50%), -50%, 0)',
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
    initialFixture.keyboard.bindingRegistry.dispatch('Delete')
    expect(initialFixture.commitDrag).not.toHaveBeenCalled()
    expect(initialFixture.remove).not.toHaveBeenCalled()

    const laterFixture = mountLane({ selectedTempoEventId: LATER_EVENT.id })
    const laterPoint = laterFixture.wrapper.findAll('.tempo-track-lane__point')[1]!
      .element as HTMLElement
    laterPoint.focus()
    laterFixture.keyboard.bindingRegistry.dispatch('Backspace')
    expect(laterFixture.remove).toHaveBeenCalledExactlyOnceWith(LATER_EVENT.id)
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
