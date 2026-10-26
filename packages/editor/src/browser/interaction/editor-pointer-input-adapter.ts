import {
  EDITOR_POINTER_INPUT_PHASE,
  type EditorCssPoint,
  type EditorInputModifiers,
  type EditorPointerInput,
  type EditorPointerInputPhase,
  type EditorPointerType,
} from '#internal/common/interaction/editor-pointer-input'

export const EDITOR_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL = 4

/**
 * Receives every input of the captured Pointer. If it throws, the adapter releases the capture,
 * delivers Cancel, and lets the error propagate like any failing event listener.
 */
export type EditorPointerInputListener<Hit extends object> = (
  input: EditorPointerInput<Hit>,
) => void

export interface EditorPointerInputAdapter {
  cancel(): boolean
  dispose(): void
}

export type EditorBrowserHitResolver<Hit extends object> = (
  event: PointerEvent,
  surface: HTMLElement,
) => Hit | null

interface CreateEditorPointerInputAdapterBaseInput<Hit extends object> {
  readonly dragThresholdCssPixel?: number
  /**
   * Surface coordinates are measured against the Surface's box, so a captured gesture is cancelled
   * when that box moves or resizes. Client coordinates keep a stationary Pointer stable while its
   * Surface scrolls.
   */
  readonly positionSpace?: 'surface' | 'client'
  readonly onInput: EditorPointerInputListener<Hit>
  readonly surface: HTMLElement
}

export interface CreateEditorPointerInputAdapterInput<
  Hit extends object,
> extends CreateEditorPointerInputAdapterBaseInput<Hit> {
  readonly resolveHit: EditorBrowserHitResolver<Hit>
}

interface ActivePointer<Hit extends object> {
  currentModifiers: EditorInputModifiers
  readonly hit: Readonly<Hit> | null
  readonly originModifiers: EditorInputModifiers
  readonly originPosition: EditorCssPoint
  readonly captureId: symbol
  readonly pointerId: number
  readonly pointerType: EditorPointerType
  hasExceededDragThreshold: boolean
  lastPosition: EditorCssPoint
}

function normalizePointerType(pointerType: string): EditorPointerType {
  switch (pointerType) {
    case 'mouse':
    case 'pen':
    case 'touch':
      return pointerType
    default:
      return 'unknown'
  }
}

function createModifiers(
  event: Pick<KeyboardEvent | PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): EditorInputModifiers {
  return Object.freeze({
    alt: event.altKey,
    control: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  })
}

function modifiersEqual(left: EditorInputModifiers, right: EditorInputModifiers): boolean {
  return (
    left.alt === right.alt &&
    left.control === right.control &&
    left.meta === right.meta &&
    left.shift === right.shift
  )
}

function copyHit<Hit extends object>(hit: Hit | null): Readonly<Hit> | null {
  return hit === null ? null : Object.freeze({ ...hit })
}

function pointIn(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  box: DOMRectReadOnly | null,
): EditorCssPoint {
  return Object.freeze({
    xCssPixel: event.clientX - (box?.left ?? 0),
    yCssPixel: event.clientY - (box?.top ?? 0),
  })
}

function sameBox(left: DOMRectReadOnly, right: DOMRectReadOnly): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  )
}

class EditorPointerInputAdapterImpl<Hit extends object> implements EditorPointerInputAdapter {
  readonly #dragThresholdSquared: number
  readonly #onInput: EditorPointerInputListener<Hit>
  readonly #resolveHit: EditorBrowserHitResolver<Hit>
  readonly #surface: HTMLElement
  readonly #positionSpace: 'surface' | 'client'
  readonly #window: Window | null
  #activePointer: ActivePointer<Hit> | null = null
  /** The Surface's box when the captured Pointer went down; null in client space. */
  #captureBox: DOMRectReadOnly | null = null
  #disposed = false

  constructor(input: CreateEditorPointerInputAdapterInput<Hit>) {
    const dragThreshold = input.dragThresholdCssPixel ?? EDITOR_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL
    this.#dragThresholdSquared = dragThreshold * dragThreshold
    this.#onInput = input.onInput
    this.#resolveHit = input.resolveHit
    this.#surface = input.surface
    this.#positionSpace = input.positionSpace ?? 'surface'
    this.#window = input.surface.ownerDocument.defaultView

    input.surface.addEventListener('pointerdown', this.#handlePointerDown)
    input.surface.addEventListener('pointermove', this.#handlePointerMove)
    input.surface.addEventListener('pointerup', this.#handlePointerUp)
    input.surface.addEventListener('pointercancel', this.#handlePointerCancel)
    input.surface.addEventListener('lostpointercapture', this.#handleLostPointerCapture)
    this.#window?.addEventListener('blur', this.#handleWindowBlur)
    this.#window?.addEventListener('keydown', this.#handleModifierChange)
    this.#window?.addEventListener('keyup', this.#handleModifierChange)
    this.#window?.addEventListener('scroll', this.#handleLayoutChange, true)
    this.#window?.addEventListener('resize', this.#handleLayoutChange)
  }

  cancel(): boolean {
    const activePointer = this.#activePointer
    if (this.#disposed || activePointer === null) return false

    this.#activePointer = null
    this.#releasePointerCapture(activePointer.pointerId)
    this.#deliverInput(
      this.#createInput(
        activePointer,
        EDITOR_POINTER_INPUT_PHASE.CANCEL,
        activePointer.lastPosition,
      ),
    )
    return true
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true

    this.#surface.removeEventListener('pointerdown', this.#handlePointerDown)
    this.#surface.removeEventListener('pointermove', this.#handlePointerMove)
    this.#surface.removeEventListener('pointerup', this.#handlePointerUp)
    this.#surface.removeEventListener('pointercancel', this.#handlePointerCancel)
    this.#surface.removeEventListener('lostpointercapture', this.#handleLostPointerCapture)
    this.#window?.removeEventListener('blur', this.#handleWindowBlur)
    this.#window?.removeEventListener('keydown', this.#handleModifierChange)
    this.#window?.removeEventListener('keyup', this.#handleModifierChange)
    this.#window?.removeEventListener('scroll', this.#handleLayoutChange, true)
    this.#window?.removeEventListener('resize', this.#handleLayoutChange)

    const activePointer = this.#activePointer
    this.#activePointer = null
    if (activePointer === null) return

    this.#deliverInput(
      this.#createInput(
        activePointer,
        EDITOR_POINTER_INPUT_PHASE.CANCEL,
        activePointer.lastPosition,
      ),
    )
    this.#releasePointerCapture(activePointer.pointerId)
  }

  readonly #handlePointerDown = (event: PointerEvent): void => {
    if (
      this.#disposed ||
      this.#activePointer !== null ||
      event.defaultPrevented ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return
    }

    const hit = copyHit(this.#resolveHit(event, this.#surface))
    const box = this.#positionSpace === 'surface' ? this.#surface.getBoundingClientRect() : null
    const position = pointIn(event, box)
    this.#surface.setPointerCapture(event.pointerId)
    this.#captureBox = box
    const originModifiers = createModifiers(event)
    const activePointer: ActivePointer<Hit> = {
      currentModifiers: originModifiers,
      hit,
      originModifiers,
      originPosition: position,
      captureId: Symbol('seele/editor/pointer-capture'),
      pointerId: event.pointerId,
      pointerType: normalizePointerType(event.pointerType),
      hasExceededDragThreshold: false,
      lastPosition: position,
    }
    this.#activePointer = activePointer
    this.#deliverInput(this.#createInput(activePointer, EDITOR_POINTER_INPUT_PHASE.BEGIN, position))
  }

  readonly #handlePointerMove = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = this.#readCapturedPosition(event)
    if (position === null) return
    this.#updateActivePointer(activePointer, position, createModifiers(event))
    this.#deliverInput(
      this.#createInput(activePointer, EDITOR_POINTER_INPUT_PHASE.UPDATE, position),
    )
  }

  readonly #handlePointerUp = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = this.#readCapturedPosition(event)
    if (position === null) return
    this.#updateActivePointer(activePointer, position, createModifiers(event))
    this.#activePointer = null
    this.#releasePointerCapture(activePointer.pointerId)
    this.#deliverInput(this.#createInput(activePointer, EDITOR_POINTER_INPUT_PHASE.END, position))
  }

  readonly #handlePointerCancel = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = this.#readCapturedPosition(event)
    if (position === null) return
    this.#updateActivePointer(activePointer, position, createModifiers(event))
    this.#activePointer = null
    this.#releasePointerCapture(activePointer.pointerId)
    this.#deliverInput(
      this.#createInput(activePointer, EDITOR_POINTER_INPUT_PHASE.CANCEL, position),
    )
  }

  readonly #handleLostPointerCapture = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    this.#activePointer = null
    this.#deliverInput(
      this.#createInput(
        activePointer,
        EDITOR_POINTER_INPUT_PHASE.CANCEL,
        activePointer.lastPosition,
      ),
    )
  }

  readonly #handleModifierChange = (event: KeyboardEvent): void => {
    const activePointer = this.#activePointer
    if (this.#disposed || activePointer === null) return

    const modifiers = createModifiers(event)
    if (modifiersEqual(activePointer.currentModifiers, modifiers)) return

    activePointer.currentModifiers = modifiers
    this.#deliverInput(
      this.#createInput(
        activePointer,
        EDITOR_POINTER_INPUT_PHASE.UPDATE,
        activePointer.lastPosition,
      ),
    )
  }

  readonly #handleWindowBlur = (): void => {
    this.cancel()
  }

  readonly #handleLayoutChange = (): void => {
    if (this.#disposed || this.#activePointer === null || this.#captureBox === null) return
    if (!sameBox(this.#captureBox, this.#surface.getBoundingClientRect())) this.cancel()
  }

  #requireActivePointer(pointerId: number): ActivePointer<Hit> | null {
    if (this.#disposed || this.#activePointer?.pointerId !== pointerId) return null
    return this.#activePointer
  }

  /** The captured Pointer's point; null after cancelling a gesture whose Surface box changed. */
  #readCapturedPosition(event: PointerEvent): EditorCssPoint | null {
    if (this.#captureBox === null) return pointIn(event, null)
    const box = this.#surface.getBoundingClientRect()
    if (sameBox(this.#captureBox, box)) return pointIn(event, box)
    this.cancel()
    return null
  }

  #updateActivePointer(
    activePointer: ActivePointer<Hit>,
    position: EditorCssPoint,
    modifiers: EditorInputModifiers,
  ): void {
    activePointer.lastPosition = position
    activePointer.currentModifiers = modifiers
    if (activePointer.hasExceededDragThreshold) return

    const deltaX = position.xCssPixel - activePointer.originPosition.xCssPixel
    const deltaY = position.yCssPixel - activePointer.originPosition.yCssPixel
    activePointer.hasExceededDragThreshold =
      deltaX * deltaX + deltaY * deltaY >= this.#dragThresholdSquared
  }

  #createInput(
    activePointer: ActivePointer<Hit>,
    phase: EditorPointerInputPhase,
    position: EditorCssPoint,
  ): EditorPointerInput<Hit> {
    return Object.freeze({
      hasExceededDragThreshold: activePointer.hasExceededDragThreshold,
      hit: activePointer.hit,
      modifiers: activePointer.currentModifiers,
      originModifiers: activePointer.originModifiers,
      originPosition: activePointer.originPosition,
      phase,
      captureId: activePointer.captureId,
      pointerId: activePointer.pointerId,
      pointerType: activePointer.pointerType,
      position,
    })
  }

  #releasePointerCapture(pointerId: number): void {
    if (this.#surface.hasPointerCapture(pointerId)) this.#surface.releasePointerCapture(pointerId)
  }

  #deliverInput(input: EditorPointerInput<Hit>): void {
    try {
      this.#onInput(input)
    } catch (cause) {
      // A failed gesture must not keep the Pointer captured or its Session active.
      const active = this.#activePointer
      if (active?.captureId === input.captureId) {
        this.#activePointer = null
        this.#releasePointerCapture(active.pointerId)
      }
      if (input.phase !== EDITOR_POINTER_INPUT_PHASE.CANCEL) {
        try {
          this.#onInput(Object.freeze({ ...input, phase: EDITOR_POINTER_INPUT_PHASE.CANCEL }))
        } catch (cancelCause) {
          // Reported like the first error, which propagates from here.
          queueMicrotask(() => {
            throw cancelCause
          })
        }
      }
      throw cause
    }
  }
}

/** Captures one primary Pointer sequence; Hit semantics belong to the owning Surface. */
export function createEditorPointerInputAdapter<Hit extends object>(
  input: CreateEditorPointerInputAdapterInput<Hit>,
): EditorPointerInputAdapter {
  return new EditorPointerInputAdapterImpl(input)
}
