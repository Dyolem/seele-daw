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
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PianoRollSustainPedalLane from '@/features/piano-roll/PianoRollSustainPedalLane.vue'
import type { ProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import { PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'

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
  const unavailable = (): never => {
    throw new Error('Unexpected Sustain Pedal Project command in presentation-only test')
  }
  return Object.freeze({
    moveEvents: unavailable,
    placeInClip: unavailable,
    placeOnTrack: unavailable,
    removeEvents: unavailable,
    replaceEventValue: unavailable,
  })
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(128)
  installPointerCapture()
})

afterEach(() => {
  vi.restoreAllMocks()
  restorePrototypeProperty('hasPointerCapture')
  restorePrototypeProperty('releasePointerCapture')
  restorePrototypeProperty('setPointerCapture')
})

describe('PianoRollSustainPedalLane', () => {
  it('renders raw CC64 state and resolves one blank Pencil click through Snap', async () => {
    const wrapper = mount(PianoRollSustainPedalLane, {
      props: {
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
            projectMidiSustainPedal: createUnavailableCoordinator(),
          }),
        },
      },
    })
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
    expect(wrapper.emitted('placement')).toEqual([
      [
        {
          activeClipId: 'sustain-pedal-lane-clip',
          channel: 0,
          modelRevision: 0,
          timelineTick: 240,
          value: 64,
        },
      ],
    ])
  })

  it('does not turn an existing event marker into a second placement', async () => {
    const wrapper = mount(PianoRollSustainPedalLane, {
      props: {
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
            projectMidiSustainPedal: createUnavailableCoordinator(),
          }),
        },
      },
    })
    await nextTick()
    const marker = wrapper.get(
      '[data-piano-roll-sustain-pedal-event-id="sustain-pedal-lane-event"]',
    )

    dispatchPointer(marker.element, 'pointerdown', 960, 128)
    dispatchPointer(marker.element, 'pointerup', 960, 128)

    expect(wrapper.emitted('placement')).toBeUndefined()
  })
})
