// @vitest-environment jsdom

import { parseMidiSustainPedalEventId } from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_DOM_SUSTAIN_PEDAL_EVENT_ID_ATTRIBUTE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollSemanticPointerInputAdapter,
  resolvePianoRollDomSustainPedalEventHit,
  type PianoRollPointerInput,
  type PianoRollPointerInputAdapterObserver,
  type PianoRollSustainPedalLaneHit,
} from '#internal/index'

interface DispatchPointerInput {
  readonly clientX?: number
  readonly clientY?: number
  readonly pointerId?: number
}

function dispatchPointer(
  target: Element,
  type: string,
  input: DispatchPointerInput = {},
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: input.clientX ?? 0,
    clientY: input.clientY ?? 0,
    composed: true,
  })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: input.pointerId ?? 1 },
    pointerType: { value: 'mouse' },
  })
  target.dispatchEvent(event)
  return event as PointerEvent
}

function createFixture() {
  const surface = document.createElement('div')
  const marker = document.createElement('div')
  const child = document.createElement('span')
  const eventId = parseMidiSustainPedalEventId('browser-cc64-event')
  marker.setAttribute(PIANO_ROLL_DOM_SUSTAIN_PEDAL_EVENT_ID_ATTRIBUTE, eventId)
  marker.append(child)
  surface.append(marker)
  document.body.append(surface)

  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    bottom: 250,
    height: 200,
    left: 100,
    right: 500,
    toJSON: () => undefined,
    top: 50,
    width: 400,
    x: 100,
    y: 50,
  })

  const capturedPointerIds = new Set<number>()
  Object.defineProperties(surface, {
    hasPointerCapture: {
      value: (pointerId: number) => capturedPointerIds.has(pointerId),
    },
    releasePointerCapture: {
      value: (pointerId: number) => capturedPointerIds.delete(pointerId),
    },
    setPointerCapture: {
      value: (pointerId: number) => capturedPointerIds.add(pointerId),
    },
  })

  return { child, eventId, marker, surface }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('Piano Roll DOM Sustain Pedal Event Hit', () => {
  it('resolves a nested CC64 marker into one frozen semantic hit', () => {
    const fixture = createFixture()
    let resolvedHit: ReturnType<typeof resolvePianoRollDomSustainPedalEventHit> | undefined
    fixture.surface.addEventListener('pointerdown', (event) => {
      resolvedHit = resolvePianoRollDomSustainPedalEventHit(event, fixture.surface)
    })

    dispatchPointer(fixture.child, 'pointerdown')

    expect(resolvedHit).toEqual({ sustainPedalEventId: fixture.eventId })
    expect(Object.isFrozen(resolvedHit)).toBe(true)
  })

  it('fails closed for blank and invalid markers', () => {
    const fixture = createFixture()
    const resolvedHits: unknown[] = []
    fixture.surface.addEventListener('pointerdown', (event) => {
      resolvedHits.push(resolvePianoRollDomSustainPedalEventHit(event, fixture.surface))
    })

    dispatchPointer(fixture.surface, 'pointerdown')
    fixture.marker.setAttribute(PIANO_ROLL_DOM_SUSTAIN_PEDAL_EVENT_ID_ATTRIBUTE, ' ')
    dispatchPointer(fixture.marker, 'pointerdown')

    expect(resolvedHits).toEqual([null, null])
  })
})

describe('Piano Roll typed Pointer Input Adapter', () => {
  it('latches a CC64 semantic hit for the complete captured gesture', () => {
    const fixture = createFixture()
    const onInput =
      vi.fn<PianoRollPointerInputAdapterObserver<PianoRollSustainPedalLaneHit>['onInput']>()
    const onError =
      vi.fn<PianoRollPointerInputAdapterObserver<PianoRollSustainPedalLaneHit>['onError']>()
    const adapter = createPianoRollSemanticPointerInputAdapter<PianoRollSustainPedalLaneHit>({
      observer: { onError, onInput },
      resolveHit: resolvePianoRollDomSustainPedalEventHit,
      surface: fixture.surface,
    })

    dispatchPointer(fixture.child, 'pointerdown', {
      clientX: 112,
      clientY: 68,
      pointerId: 9,
    })
    dispatchPointer(fixture.surface, 'pointermove', {
      clientX: 114,
      clientY: 70,
      pointerId: 9,
    })
    dispatchPointer(fixture.surface, 'pointerup', {
      clientX: 115,
      clientY: 72,
      pointerId: 9,
    })

    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      PIANO_ROLL_POINTER_INPUT_PHASE.END,
    ])
    for (const [input] of onInput.mock.calls) {
      const typedInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit> = input
      expect(typedInput.hit).toEqual({ sustainPedalEventId: fixture.eventId })
      expect(Object.isFrozen(typedInput.hit)).toBe(true)
    }
    expect(onError).not.toHaveBeenCalled()

    adapter.dispose()
  })
})
