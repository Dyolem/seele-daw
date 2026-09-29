import { EditorPointerInputError } from './editor-pointer-input-error'
import {
  EDITOR_POINTER_INPUT_PHASE,
  type EditorCssPoint,
  type EditorInputModifiers,
  type EditorPointerInput,
  type EditorPointerInputPhase,
  type EditorPointerType,
} from '#internal/common/interaction/editor-pointer-input'

export const EDITOR_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL = 4

export type EditorPointerInputAdapterFailureOperation =
  | 'coordinate-mapping'
  | 'hit-test'
  | 'observer-delivery'
  | 'pointer-capture'

export interface EditorPointerInputAdapterFailure {
  readonly cause: unknown
  readonly operation: EditorPointerInputAdapterFailureOperation
}

export interface EditorPointerInputAdapterObserver<Hit extends object> {
  onError(failure: EditorPointerInputAdapterFailure): void
  onInput(input: EditorPointerInput<Hit>): void
}

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
  readonly observer: EditorPointerInputAdapterObserver<Hit>
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

function requireDragThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new EditorPointerInputError(
      'invalid-pointer-input-configuration',
      'Editor drag threshold must be a finite positive CSS Pixel value',
    )
  }
  return value
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

function createPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  surface: HTMLElement,
): EditorCssPoint {
  const bounds = surface.getBoundingClientRect()
  return Object.freeze({
    xCssPixel: event.clientX - bounds.left,
    yCssPixel: event.clientY - bounds.top,
  })
}

function createFailure(
  operation: EditorPointerInputAdapterFailureOperation,
  cause: unknown,
): EditorPointerInputAdapterFailure {
  return Object.freeze({ cause, operation })
}

class EditorPointerInputAdapterImpl<Hit extends object> implements EditorPointerInputAdapter {
  readonly #dragThresholdSquared: number
  readonly #observer: EditorPointerInputAdapterObserver<Hit>
  readonly #resolveHit: EditorBrowserHitResolver<Hit>
  readonly #surface: HTMLElement
  readonly #window: Window | null
  #activePointer: ActivePointer<Hit> | null = null
  #disposed = false

  constructor(input: CreateEditorPointerInputAdapterInput<Hit>) {
    const dragThreshold = requireDragThreshold(
      input.dragThresholdCssPixel ?? EDITOR_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL,
    )
    this.#dragThresholdSquared = dragThreshold * dragThreshold
    this.#observer = input.observer
    this.#resolveHit = input.resolveHit
    this.#surface = input.surface
    this.#window = input.surface.ownerDocument.defaultView

    input.surface.addEventListener('pointerdown', this.#handlePointerDown)
    input.surface.addEventListener('pointermove', this.#handlePointerMove)
    input.surface.addEventListener('pointerup', this.#handlePointerUp)
    input.surface.addEventListener('pointercancel', this.#handlePointerCancel)
    input.surface.addEventListener('lostpointercapture', this.#handleLostPointerCapture)
    this.#window?.addEventListener('blur', this.#handleWindowBlur)
    this.#window?.addEventListener('keydown', this.#handleModifierChange)
    this.#window?.addEventListener('keyup', this.#handleModifierChange)
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

    let hit: Readonly<Hit> | null
    try {
      hit = copyHit(this.#resolveHit(event, this.#surface))
    } catch (cause) {
      this.#deliverFailure(createFailure('hit-test', cause))
      return
    }

    const position = this.#readPosition(event)
    if (position === null || !this.#capturePointer(event.pointerId)) return
    const originModifiers = createModifiers(event)
    const activePointer: ActivePointer<Hit> = {
      currentModifiers: originModifiers,
      hit,
      originModifiers,
      originPosition: position,
      captureId: Symbol('pointer-capture'),
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

    const position = this.#readPosition(event)
    if (position === null) return
    this.#updateActivePointer(activePointer, position, createModifiers(event))
    this.#deliverInput(
      this.#createInput(activePointer, EDITOR_POINTER_INPUT_PHASE.UPDATE, position),
    )
  }

  readonly #handlePointerUp = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = this.#readPosition(event)
    if (position === null) return
    this.#updateActivePointer(activePointer, position, createModifiers(event))
    this.#activePointer = null
    this.#releasePointerCapture(activePointer.pointerId)
    this.#deliverInput(this.#createInput(activePointer, EDITOR_POINTER_INPUT_PHASE.END, position))
  }

  readonly #handlePointerCancel = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = this.#readPosition(event)
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

  #requireActivePointer(pointerId: number): ActivePointer<Hit> | null {
    if (this.#disposed || this.#activePointer?.pointerId !== pointerId) return null
    return this.#activePointer
  }

  #readPosition(event: PointerEvent): EditorCssPoint | null {
    try {
      return createPoint(event, this.#surface)
    } catch (cause) {
      this.cancel()
      this.#deliverFailure(createFailure('coordinate-mapping', cause))
      return null
    }
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

  #capturePointer(pointerId: number): boolean {
    try {
      this.#surface.setPointerCapture(pointerId)
      return true
    } catch (cause) {
      this.#deliverFailure(createFailure('pointer-capture', cause))
      return false
    }
  }

  #releasePointerCapture(pointerId: number): void {
    try {
      if (this.#surface.hasPointerCapture(pointerId)) {
        this.#surface.releasePointerCapture(pointerId)
      }
    } catch (cause) {
      this.#deliverFailure(createFailure('pointer-capture', cause))
    }
  }

  #deliverInput(input: EditorPointerInput<Hit>): void {
    try {
      this.#observer.onInput(input)
    } catch (cause) {
      const active = this.#activePointer
      if (active?.captureId === input.captureId) {
        this.#activePointer = null
        this.#releasePointerCapture(active.pointerId)
      }
      if (input.phase !== EDITOR_POINTER_INPUT_PHASE.CANCEL) {
        try {
          this.#observer.onInput(
            Object.freeze({ ...input, phase: EDITOR_POINTER_INPUT_PHASE.CANCEL }),
          )
        } catch {
          // Cleanup delivery is best-effort; the failed capture can no longer produce End.
        }
      }
      this.#deliverFailure(createFailure('observer-delivery', cause))
    }
  }

  #deliverFailure(failure: EditorPointerInputAdapterFailure): void {
    try {
      this.#observer.onError(failure)
    } catch {
      // Browser event delivery must not escape into the host event loop.
    }
  }
}

/** Captures one primary Pointer sequence; Hit semantics belong to the owning Surface. */
export function createEditorPointerInputAdapter<Hit extends object>(
  input: CreateEditorPointerInputAdapterInput<Hit>,
): EditorPointerInputAdapter {
  return new EditorPointerInputAdapterImpl(input)
}
