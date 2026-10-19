import { installPianoRollResizeObserver } from '@/features/piano-roll/__tests__/support/piano-roll-resize-observer-test-support'
import { PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY } from '@/symbols'
import {
  createPianoRollGrid,
  type PianoRollClipContext,
  type PianoRollSustainPedalClipLaneReadModel,
} from '@seele-daw/editor'
import {
  ZERO_TICK,
  createMidiSustainPedalEventRecord,
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parsePositiveTick,
  parseProjectId,
  parseTick,
  type ModelRevision,
  type ProjectSession,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PianoRollSustainPedalLane from '@/features/piano-roll/components/sustain-pedal/PianoRollSustainPedalLane.vue'
import type { ProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'

const ORIGINAL_POINTER_CAPTURE_DESCRIPTORS = Object.freeze({
  hasPointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hasPointerCapture'),
  releasePointerCapture: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'releasePointerCapture',
  ),
  setPointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture'),
})

function installPointerCapture(): void {
  const capturedPointerIds = new WeakMap<HTMLElement, Set<number>>()
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        return capturedPointerIds.get(this)?.has(pointerId) ?? false
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        capturedPointerIds.get(this)?.delete(pointerId)
      },
    },
    setPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        const pointerIds = capturedPointerIds.get(this) ?? new Set<number>()
        pointerIds.add(pointerId)
        capturedPointerIds.set(this, pointerIds)
      },
    },
  })
}

function restorePrototypeProperty(
  property: keyof typeof ORIGINAL_POINTER_CAPTURE_DESCRIPTORS,
): void {
  const descriptor = ORIGINAL_POINTER_CAPTURE_DESCRIPTORS[property]
  if (descriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, property)
    return
  }
  Object.defineProperty(HTMLElement.prototype, property, descriptor)
}

function dispatchPointer(target: Element, type: string, x: number, y: number): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: x,
    clientY: y,
    composed: true,
  })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  })
  target.dispatchEvent(event)
}

function createReadModel(): PianoRollSustainPedalClipLaneReadModel {
  const event = createMidiSustainPedalEventRecord({
    channel: parseMidiChannel(0),
    id: parseMidiSustainPedalEventId('sustain-pedal-lane-event'),
    tick: parseTick(960),
    value: parseMidiControlValue(0),
  })
  return Object.freeze({
    channel: parseMidiChannel(0),
    clipId: parseClipId('sustain-pedal-lane-clip'),
    events: Object.freeze([
      Object.freeze({
        affectsPlayback: false,
        event,
        pedalDown: false,
        timelineTick: parseTick(960),
      }),
    ]),
    initialPedalDown: false,
    initialValue: parseMidiControlValue(0),
    modelRevision: 0 as ModelRevision,
    projectId: parseProjectId('sustain-pedal-lane-project'),
    segments: Object.freeze([
      Object.freeze({
        endTick: parseTick(960),
        pedalDown: false,
        startTick: ZERO_TICK,
        value: parseMidiControlValue(0),
      }),
    ]),
    sourceId: parseMidiSourceId('sustain-pedal-lane-source'),
  })
}

function createClipContext(): PianoRollClipContext {
  return Object.freeze({
    clipId: parseClipId('sustain-pedal-lane-clip'),
    clipSpanTick: parseTick(960),
    sourceEndTick: parseTick(960),
    sourceId: parseMidiSourceId('sustain-pedal-lane-source'),
    sourceLengthTick: parseTick(960),
    sourceStartTick: ZERO_TICK,
  })
}

function createUnavailableCoordinator(): ProjectMidiSustainPedalCoordinator {
  const unavailable = vi.fn<() => never>((): never => {
    throw new Error('Unexpected Sustain Pedal Project command in presentation-only test')
  })
  return Object.freeze({
    moveEvents: unavailable,
    placeInClip: unavailable,
    placeOnTrack: unavailable,
    removeEvents: unavailable,
    replaceEventValue: unavailable,
  })
}

function mountLane(coordinator = createUnavailableCoordinator()) {
  const session: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'> = {
    modelRevision: 0 as ModelRevision,
    subscribe: () => () => {},
    query: () => {
      throw new Error('Unexpected query')
    },
  }
  const wrapper = mount(PianoRollSustainPedalLane, {
    props: {
      session,
      clipContext: createClipContext(),
      grid: createPianoRollGrid({
        barSpanTick: parsePositiveTick(960),
        beatSpanTick: parsePositiveTick(240),
        originTick: ZERO_TICK,
        subdivisionSpanTick: parsePositiveTick(240),
      }),
      label: 'Sustain Pedal lane',
      pencilEnabled: true,
      readModel: createReadModel(),
      snapEnabled: true,
      visibleSpanTick: parsePositiveTick(960),
      visibleStartTick: ZERO_TICK,
    },
    global: {
      provide: {
        [PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY as symbol]: Object.freeze({
          projectMidiSustainPedal: coordinator,
        }),
      },
    },
  })
  return { wrapper, coordinator }
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(128)
  installPointerCapture()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  restorePrototypeProperty('hasPointerCapture')
  restorePrototypeProperty('releasePointerCapture')
  restorePrototypeProperty('setPointerCapture')
})

describe('PianoRollSustainPedalLane', () => {
  it('releases input and the session immediately when viewport observation fails', async () => {
    const probe = installPianoRollResizeObserver('.piano-roll-sustain-pedal-lane')
    const { wrapper, coordinator } = mountLane()
    await nextTick()
    const surface = wrapper.get('[role="group"]').element
    const observer = probe.forElement(surface)
    expect(wrapper.emitted('failure')).toEqual([
      [expect.objectContaining({ message: 'Viewport observation failed' })],
    ])
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    dispatchPointer(surface, 'pointerdown', 250, 64)
    dispatchPointer(surface, 'pointerup', 250, 64)
    observer.deliver()
    await nextTick()
    expect(coordinator.placeInClip).not.toHaveBeenCalled()
    expect(wrapper.emitted('requestFocus')).toBeUndefined()
    expect(wrapper.emitted('failure')).toHaveLength(1)
    wrapper.unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('cancels capture after geometry changes and ignores callbacks after unmount', async () => {
    const probe = installPianoRollResizeObserver()
    const { wrapper, coordinator } = mountLane()
    await nextTick()
    const surface = wrapper.get('[role="group"]').element
    const observer = probe.forElement(surface)
    dispatchPointer(surface, 'pointerdown', 250, 64)
    expect(surface.hasPointerCapture(1)).toBe(true)
    Object.defineProperty(surface, 'clientWidth', { configurable: true, value: 480 })
    observer.deliver()
    expect(surface.hasPointerCapture(1)).toBe(false)
    dispatchPointer(surface, 'pointerup', 250, 64)
    expect(coordinator.placeInClip).not.toHaveBeenCalled()
    wrapper.unmount()
    observer.deliver()
    dispatchPointer(surface, 'pointerdown', 250, 64)
    dispatchPointer(surface, 'pointerup', 250, 64)
    expect(coordinator.placeInClip).not.toHaveBeenCalled()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('renders raw CC64 state and resolves one blank Pencil click through Snap', async () => {
    const { wrapper, coordinator } = mountLane()
    const placeInClip = coordinator.placeInClip
    await nextTick()
    const surface = wrapper.get('[role="group"]')

    expect(surface.attributes('aria-label')).toBe('Sustain Pedal lane')
    expect(wrapper.text()).toContain('CC64 Channel 1, 1 visible event')
    expect(
      wrapper.get('[data-piano-roll-sustain-pedal-event-id="sustain-pedal-lane-event"]').classes(),
    ).toContain('piano-roll-sustain-pedal-lane__event--terminal')

    dispatchPointer(surface.element, 'pointerdown', 250, 64)
    await wrapper.setProps({ snapEnabled: false })
    dispatchPointer(surface.element, 'pointerup', 250, 64)

    expect(wrapper.emitted('requestFocus')).toHaveLength(1)
    expect(placeInClip).toHaveBeenCalledExactlyOnceWith({
      expectedSession: wrapper.props('session'),
      clipId: 'sustain-pedal-lane-clip',
      channel: 0,
      baseRevision: 0,
      clipTick: 240,
      value: 64,
    })
    expect(wrapper.emitted('failure')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not turn an existing event marker into a second placement', async () => {
    const { wrapper, coordinator } = mountLane()
    await nextTick()
    const marker = wrapper.get(
      '[data-piano-roll-sustain-pedal-event-id="sustain-pedal-lane-event"]',
    )

    dispatchPointer(marker.element, 'pointerdown', 960, 128)
    dispatchPointer(marker.element, 'pointerup', 960, 128)

    expect(coordinator.placeInClip).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
