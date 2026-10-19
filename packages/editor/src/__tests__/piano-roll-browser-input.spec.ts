// @vitest-environment jsdom

import type { EditorPointerInputAdapterObserver } from '#internal/browser/interaction/editor-pointer-input-adapter'
import { parseMidiPitch, parseNoteId, parseTick } from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PianoRollBrowserError,
  createPianoRollDomNoteRenderer,
  createPianoRollPointerInputAdapter,
  createEditorPointerInputAdapter,
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
  const releasePointerCapture = vi.fn<(pointerId: number) => void>((pointerId) => {
    capturedPointerIds.delete(pointerId)
  })
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
        glowColor: null,
        heightCssPixel: 10,
        noteId,
        opacity: 1,
        pitch: parseMidiPitch(60),
        selected: false,
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
  const startHandle = note.querySelector<HTMLElement>(
    '.sd-piano-roll-dom-note__resize-handle--start',
  )
  const endHandle = note.querySelector<HTMLElement>('.sd-piano-roll-dom-note__resize-handle--end')
  if (startHandle === null || endHandle === null) {
    throw new Error('Expected rendered DOM Note resize handles')
  }
  const noteChild = document.createElement('span')
  note.append(noteChild)

  return {
    capture,
    endHandle,
    note,
    noteChild,
    noteId,
    renderer,
    startHandle,
    surface,
  }
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

  it('resolves the rendered left and right handles into one semantic Edge hit', () => {
    const fixture = createDomNoteFixture()
    const resolvedHits: unknown[] = []
    fixture.surface.addEventListener('pointerdown', (event) => {
      resolvedHits.push(resolvePianoRollDomNoteHit(event, fixture.surface))
    })

    dispatchPointer(fixture.startHandle, 'pointerdown')
    dispatchPointer(fixture.endHandle, 'pointerdown')

    expect(resolvedHits).toEqual([
      {
        noteId: fixture.noteId,
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_START,
      },
      {
        noteId: fixture.noteId,
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      },
    ])
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
    expect(onInput.mock.calls.map(([input]) => input.modifiers.shift)).toEqual([true, false, false])
    for (const [input] of onInput.mock.calls) {
      expect(input.hit).toEqual({
        noteId: fixture.noteId,
        zone: PIANO_ROLL_HIT_ZONE.BODY,
      })
      expect(input.originPosition).toEqual({
        xCssPixel: 12,
        yCssPixel: 18,
      })
      expect(input.originModifiers).toEqual({
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
      expect(Object.isFrozen(input.originModifiers)).toBe(true)
      expect(Object.isFrozen(input.originPosition)).toBe(true)
      expect(Object.isFrozen(input.position)).toBe(true)
    }
    expect(fixture.capture.setPointerCapture).toHaveBeenCalledWith(7)
    expect(fixture.capture.releasePointerCapture).toHaveBeenCalledWith(7)

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('emits current Modifier changes without replacing Pointer Down modifiers', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 12 })
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, key: 'Alt' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))
    dispatchPointer(fixture.surface, 'pointerup', { pointerId: 12 })

    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
      PIANO_ROLL_POINTER_INPUT_PHASE.END,
    ])
    expect(onInput.mock.calls.map(([input]) => input.modifiers.alt)).toEqual([
      false,
      true,
      false,
      false,
    ])
    expect(onInput.mock.calls.map(([input]) => input.originModifiers.alt)).toEqual([
      false,
      false,
      false,
      false,
    ])

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('latches an Edge hit for the complete captured gesture', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.endHandle, 'pointerdown', {
      clientX: 200,
      pointerId: 13,
    })
    dispatchPointer(fixture.surface, 'pointermove', {
      clientX: 220,
      pointerId: 13,
    })
    dispatchPointer(fixture.surface, 'pointerup', {
      clientX: 240,
      pointerId: 13,
    })

    expect(onInput).toHaveBeenCalledTimes(3)
    for (const [input] of onInput.mock.calls) {
      expect(input.hit).toEqual({
        noteId: fixture.noteId,
        zone: PIANO_ROLL_HIT_ZONE.RESIZE_END,
      })
    }

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

    expect(onInput.mock.calls.map(([input]) => input.hasExceededDragThreshold)).toEqual([
      false,
      true,
      true,
      true,
    ])

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
    expect(onInput.mock.calls.map(([input]) => input.pointerId)).toEqual([5, 5, 6, 6])

    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('releases capture and cancels on Window blur or an explicit request', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(),
        onInput,
      },
      surface: fixture.surface,
    })

    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 13 })
    window.dispatchEvent(new Event('blur'))
    dispatchPointer(fixture.note, 'pointerdown', { pointerId: 14 })

    expect(adapter.cancel()).toBe(true)
    expect(adapter.cancel()).toBe(false)
    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
    ])
    expect(fixture.capture.releasePointerCapture).toHaveBeenCalledTimes(2)

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

  it.each([PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN, PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE])(
    'closes capture when the %s consumer throws and ignores a late Pointer Up',
    (phase) => {
      const fixture = createDomNoteFixture()
      const onError = vi.fn<PianoRollPointerInputAdapterObserver['onError']>()
      const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>((input) => {
        if (input.phase === phase) throw new Error('Input consumer failed')
      })
      const adapter = createPianoRollPointerInputAdapter({
        observer: { onError, onInput },
        surface: fixture.surface,
      })
      dispatchPointer(fixture.note, 'pointerdown')
      dispatchPointer(fixture.surface, 'pointermove', { clientX: 260 })
      dispatchPointer(fixture.surface, 'pointerup', { clientX: 260 })
      expect(fixture.capture.capturedPointerIds.size).toBe(0)
      expect(onInput.mock.calls.map(([input]) => input.phase)).not.toContain(
        PIANO_ROLL_POINTER_INPUT_PHASE.END,
      )
      expect(onInput).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL }),
      )
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ operation: 'observer-delivery' }),
      )
      adapter.dispose()
      fixture.renderer.dispose()
    },
  )

  it('assigns a fresh capture identity when the browser reuses a Pointer ID', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: { onError: vi.fn<PianoRollPointerInputAdapterObserver['onError']>(), onInput },
      surface: fixture.surface,
    })
    dispatchPointer(fixture.note, 'pointerdown')
    dispatchPointer(fixture.surface, 'pointerup')
    dispatchPointer(fixture.note, 'pointerdown')
    dispatchPointer(fixture.surface, 'pointerup')
    const inputs = onInput.mock.calls.map(([input]) => input)
    expect(inputs[0]?.captureId).toBe(inputs[1]?.captureId)
    expect(inputs[2]?.captureId).toBe(inputs[3]?.captureId)
    expect(inputs[0]?.captureId).not.toBe(inputs[2]?.captureId)
    expect(inputs[0]?.pointerId).toBe(inputs[2]?.pointerId)
    adapter.dispose()
    fixture.renderer.dispose()
  })

  it('cancels and releases capture when coordinate mapping fails', () => {
    const fixture = createDomNoteFixture()
    const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
    const onError = vi.fn<PianoRollPointerInputAdapterObserver['onError']>()
    const adapter = createPianoRollPointerInputAdapter({
      observer: { onError, onInput },
      surface: fixture.surface,
    })
    dispatchPointer(fixture.note, 'pointerdown')
    vi.spyOn(fixture.surface, 'getBoundingClientRect').mockImplementationOnce(() => {
      throw new Error('Mapping failed')
    })
    dispatchPointer(fixture.surface, 'pointermove')
    dispatchPointer(fixture.surface, 'pointerup')
    expect(fixture.capture.capturedPointerIds.size).toBe(0)
    expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual([
      PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
      PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
    ])
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'coordinate-mapping' }),
    )
    adapter.dispose()
    fixture.renderer.dispose()
  })
})

describe('Editor Pointer resource ownership', () => {
  it.each(['pointermove', 'keyup'])(
    'rolls back a partially registered adapter when %s registration fails',
    (failedType) => {
      const { surface, capture, renderer } = createDomNoteFixture()
      const onInput = vi.fn<PianoRollPointerInputAdapterObserver['onInput']>()
      const onError = vi.fn<PianoRollPointerInputAdapterObserver['onError']>()
      const unrelated = vi.fn<EventListener>()
      surface.addEventListener('pointerdown', unrelated)
      const target: EventTarget = failedType === 'keyup' ? window : surface
      const add = target.addEventListener.bind(target)
      const registration = vi.spyOn(target, 'addEventListener')
      registration.mockImplementation((type, listener, options) => {
        if (type === failedType) throw new Error('Listener registration failed')
        add(type, listener, options)
      })
      expect(() =>
        createPianoRollPointerInputAdapter({ surface, observer: { onInput, onError } }),
      ).toThrow('Listener registration failed')
      registration.mockRestore()

      dispatchPointer(surface, 'pointerdown')
      dispatchPointer(surface, 'pointerup')
      window.dispatchEvent(new Event('blur'))
      expect(onInput).not.toHaveBeenCalled()
      expect(capture.capturedPointerIds.size).toBe(0)
      expect(unrelated).toHaveBeenCalledOnce()

      const retry = createPianoRollPointerInputAdapter({ surface, observer: { onInput, onError } })
      dispatchPointer(surface, 'pointerdown')
      dispatchPointer(surface, 'pointerup')
      expect(onInput.mock.calls.map(([input]) => input.phase)).toEqual(['begin', 'end'])
      retry.dispose()
      renderer.dispose()
    },
  )
})

describe('Editor Pointer coordinate space', () => {
  it('keeps client coordinates across scroll and modifier updates', () => {
    const surface = document.createElement('div')
    const capture = installPointerCapture(surface)
    const bounds = vi
      .spyOn(surface, 'getBoundingClientRect')
      .mockReturnValue({ left: 100, top: 50 } as DOMRect)
    const onInput = vi.fn<EditorPointerInputAdapterObserver<never>['onInput']>()
    const adapter = createEditorPointerInputAdapter({
      surface,
      positionSpace: 'client',
      resolveHit: () => null,
      observer: { onInput, onError: vi.fn<EditorPointerInputAdapterObserver<never>['onError']>() },
    })
    dispatchPointer(surface, 'pointerdown', { clientX: 150, clientY: 70 })
    bounds.mockReturnValue({ left: -100, top: 50 } as DOMRect)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }))
    expect(onInput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'update',
        position: { xCssPixel: 150, yCssPixel: 70 },
        originPosition: { xCssPixel: 150, yCssPixel: 70 },
      }),
    )
    dispatchPointer(surface, 'pointerup', { clientX: 150, clientY: 70 })
    expect(onInput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'end',
        hasExceededDragThreshold: false,
        position: { xCssPixel: 150, yCssPixel: 70 },
      }),
    )
    expect(capture.releasePointerCapture).toHaveBeenCalledOnce()
    adapter.dispose()
  })
})
