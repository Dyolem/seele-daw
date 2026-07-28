// @vitest-environment jsdom

import {
  parseMidiPitch,
  parseNoteId,
  parseTick,
} from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PianoRollBrowserError,
  createPianoRollDomNoteRenderer,
  createPianoRollPointerInputAdapter,
  resolvePianoRollDomNoteHit,
  type PianoRollNoteScene,
  type PianoRollPointerInputAdapterObserver,
} from '#internal/index'

interface DispatchPointerInput {
  readonly altKey?: boolean
  readonly button?: number
  readonly clientX?: number
  readonly clientY?: number
  readonly ctrlKey?: boolean
  readonly isPrimary?: boolean
  readonly metaKey?: boolean
  readonly pointerId?: number
  readonly pointerType?: string
  readonly shiftKey?: boolean
}

function dispatchPointer(
  target: Element,
  type: string,
  input: DispatchPointerInput = {},
): PointerEvent {
  const event = new MouseEvent(type, {
    altKey: input.altKey,
    bubbles: true,
    button: input.button ?? 0,
    cancelable: true,
    clientX: input.clientX ?? 0,
    clientY: input.clientY ?? 0,
    composed: true,
    ctrlKey: input.ctrlKey,
    metaKey: input.metaKey,
    shiftKey: input.shiftKey,
  })
  Object.defineProperties(event, {
    isPrimary: { value: input.isPrimary ?? true },
    pointerId: { value: input.pointerId ?? 1 },
    pointerType: { value: input.pointerType ?? 'mouse' },
  })
  target.dispatchEvent(event)
  return event as PointerEvent
}

function installSurfaceGeometry(surface: HTMLElement): void {
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
}

function installPointerCapture(surface: HTMLElement) {
  const capturedPointerIds = new Set<number>()
  const setPointerCapture = vi.fn<(pointerId: number) => void>((pointerId) => {
    capturedPointerIds.add(pointerId)
  })
  const releasePointerCapture = vi.fn<(pointerId: number) => void>(
    (pointerId) => {
      capturedPointerIds.delete(pointerId)
    },
  )
  const hasPointerCapture = vi.fn<(pointerId: number) => boolean>((pointerId) =>
    capturedPointerIds.has(pointerId),
  )

  Object.defineProperties(surface, {
    hasPointerCapture: { value: hasPointerCapture },
    releasePointerCapture: { value: releasePointerCapture },
    setPointerCapture: { value: setPointerCapture },
  })

  return {
    capturedPointerIds,
    hasPointerCapture,
    releasePointerCapture,
    setPointerCapture,
  }
}

function createDomNoteFixture() {
  const surface = document.createElement('div')
  document.body.append(surface)
  installSurfaceGeometry(surface)
  const capture = installPointerCapture(surface)
  const noteId = parseNoteId('browser-input-note')
  const scene: PianoRollNoteScene = Object.freeze({
    heightCssPixel: 200,
    notes: Object.freeze([
      Object.freeze({
        borderColor: '#ffffff',
        fillColor: '#8b5cf6',
        heightCssPixel: 10,
        noteId,
        opacity: 1,
        pitch: parseMidiPitch(60),
        visibleEndTick: parseTick(480),
        visibleStartTick: parseTick(0),
        widthCssPixel: 100,
        xCssPixel: 20,
        yCssPixel: 40,
      }),
    ]),
    widthCssPixel: 400,
  })
  const renderer = createPianoRollDomNoteRenderer({ container: surface })
  renderer.render(scene)
  const note = surface.querySelector<HTMLElement>('.sd-piano-roll-dom-note')
  if (note === null) throw new Error('Expected rendered DOM Note')
  const noteChild = document.createElement('span')
  note.append(noteChild)

  return { capture, note, noteChild, noteId, renderer, surface }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('Piano Roll DOM Note Hit', () => {
  it('converts a nested rendered Note target into a frozen semantic body hit', () => {
    const fixture = createDomNoteFixture()
    let resolvedHit: ReturnType<typeof resolvePianoRollDomNoteHit> | undefined
    fixture.surface.addEventListener('pointerdown', (event) => {
      resolvedHit = resolvePianoRollDomNoteHit(event, fixture.surface)
    })

    dispatchPointer(fixture.noteChild, 'pointerdown')

    expect(resolvedHit).toEqual({
      noteId: fixture.noteId,
      zone: PIANO_ROLL_HIT_ZONE.BODY,
    })
    expect(Object.isFrozen(resolvedHit)).toBe(true)
    fixture.renderer.dispose()
  })

  it('fails closed for empty Surface targets and invalid Note markers', () => {
    const fixture = createDomNoteFixture()
    const resolvedHits: unknown[] = []
    fixture.surface.addEventListener('pointerdown', (event) => {
      resolvedHits.push(resolvePianoRollDomNoteHit(event, fixture.surface))
    })

    dispatchPointer(fixture.surface, 'pointerdown')
    fixture.note.setAttribute('data-piano-roll-note-id', ' ')
    dispatchPointer(fixture.note, 'pointerdown')

    expect(resolvedHits).toEqual([null, null])
    fixture.renderer.dispose()
  })
})

describe('Piano Roll Pointer Input Adapter', () => {
  it('captures one primary gesture and emits immutable Surface CSS Pixel input', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.noteChild, 'pointerdown', {
      clientX: 112,
      clientY: 68,
      pointerId: 7,
      pointerType: 'pen',
      shiftKey: true,
    })
    dispatchPointer(fixture.surface, 'pointermove', {
      clientX: 114,
      clientY: 70,
      pointerId: 7,
      pointerType: 'pen',
    })
    dispatchPointer(fixture.surface, 'pointerup', {
      clientX: 115,
      clientY: 68,
      pointerId: 7,
      pointerType: 'pen',
    })

    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      PIANO_ROLL_POINTER_INPUT_PHASE.END,
    ])
    expect(onInput.mock.calls.map(([input]) => input.position)).toEqual([
      { xCssPixel: 12, yCssPixel: 18 },
      { xCssPixel: 14, yCssPixel: 20 },
      { xCssPixel: 15, yCssPixel: 18 },
    ])
    for (const [input] of onInput.mock.calls) {
      expect(input.hit).toEqual({
        noteId: fixture.noteId,
        zone: PIANO_ROLL_HIT_ZONE.BODY,
      })
      expect(input.originPosition).toEqual({
        xCssPixel: 12,
        yCssPixel: 18,
      })
      expect(input.modifiers).toEqual({
        alt: false,
        control: false,
        meta: false,
        shift: true,
      })
      expect(input.hasExceededDragThreshold).toBe(false)
      expect(input.pointerId).toBe(7)
      expect(input.pointerType).toBe('pen')
      expect(Object.isFrozen(input)).toBe(true)
      expect(Object.isFrozen(input.hit)).toBe(true)
      expect(Object.isFrozen(input.modifiers)).toBe(true)
      expect(Object.isFrozen(input.originPosition)).toBe(true)
      expect(Object.isFrozen(input.position)).toBe(true)
    }
    expect(fixture.capture.setPointerCapture).toHaveBeenCalledWith(7)
    expect(fixture.capture.releasePointerCapture).toHaveBeenCalledWith(7)

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('latches the CSS Pixel drag threshold after it is crossed', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.note, 'pointerdown', {
      clientX: 100,
      clientY: 50,
    })
    dispatchPointer(fixture.surface, 'pointermove', {
      clientX: 103,
      clientY: 54,
    })
    dispatchPointer(fixture.surface, 'pointermove', {
      clientX: 101,
      clientY: 51,
    })
    dispatchPointer(fixture.surface, 'pointerup', {
      clientX: 101,
      clientY: 51,
    })

    expect(
      onInput.mock.calls.map(([input]) => input.hasExceededDragThreshold),
    ).toEqual([false, true, true, true])

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('ignores secondary starts and unrelated pointers while one pointer is active', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.note, 'pointerdown', { button: 2, pointerId: 1 })
    dispatchPointer(fixture.note, 'pointerdown', {
      isPrimary: false,
      pointerId: 2,
    })
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 3 })
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 4 })
    dispatchPointer(fixture.surface, 'pointermove', { pointerId: 4 })
    dispatchPointer(fixture.surface, 'pointercancel', { pointerId: 3 })

    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
    ])
    expect(onInput.mock.calls.map(([input]) => input.pointerId)).toEqual([3, 3])
    expect(fixture.capture.setPointerCapture).toHaveBeenCalledOnce()

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('cancels on lost capture and allows a later gesture', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 5 })
    fixture.capture.capturedPointerIds.delete(5)
    dispatchPointer(fixture.surface, 'lostpointercapture', { pointerId: 5 })
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 6 })
    dispatchPointer(fixture.surface, 'pointerup', { pointerId: 6 })

    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.END,
    ])
    expect(onInput.mock.calls.map(([input]) => input.pointerId)).toEqual([
      5, 5, 6, 6,
    ])

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('cancels an active gesture and removes listeners when disposed', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 8 })
    adapter.dispose()
    adapter.dispose()
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 9 })

    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
    ])
    expect(fixture.capture.releasePointerCapture).toHaveBeenCalledOnce()

    fixture.renderer.dispose()
  })

  it('reports configuration, Hit and capture failures without starting a gesture', () => {
    const fixture = createDomNoteFixture()
    const onError = vi.fn<PianoRollPointerInputAdapterObserver['onError']>()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()

    for (const dragThresholdCssPixel of [0, -1, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createPianoRollPointerInputAdapter({
          dragThresholdCssPixel,
          observer: { onError, onInput },
          surface: fixture.surface,
        }),
      ).toThrowError(
        expect.objectContaining<Partial<PianoRollBrowserError>>({
          code: 'invalid-pointer-input-configuration',
        }),
      )
    }

    const hitFailureAdapter = createPianoRollPointerInputAdapter({
      observer: { onError, onInput },
      resolveHit: () => {
        throw new Error('Hit failed')
      },
      surface: fixture.surface,
    })
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 10 })
    hitFailureAdapter.dispose()

    fixture.capture.setPointerCapture.mockImplementationOnce(() => {
      throw new Error('Capture failed')
    })
    const captureFailureAdapter = createPianoRollPointerInputAdapter({
      observer: { onError, onInput },
      surface: fixture.surface,
    })
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 11 })

    expect(onInput).not.toHaveBeenCalled()
    expect(onError.mock.calls.map(([failure]) => failure.operation)).toEqual([
      'hit-test',
      'pointer-capture',
    ])

    captureFailureAdapter.dispose()
    fixture.renderer.dispose()
  })

  it('isolates Observer failures from the browser event loop', () => {
    const fixture = createDomNoteFixture()
    const onError = vi.fn<PianoRollPointerInputAdapterObserver['onError']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError,
        onInput: () => {
          throw new Error('Input Observer failed')
        },
      },
      surface: fixture.surface,
    })

    expect(() => dispatchPointer(fixture.note, 'pointerdown')).not.toThrow()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'observer-delivery' }),
    )

    adapter.dispose()
    fixture.renderer.dispose()
  })
})
