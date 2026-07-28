import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import { resolvePianoRollDomNoteHit } from '#internal/browser/piano-roll/piano-roll-dom-note-hit'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollCssPoint,
  type PianoRollHit,
  type PianoRollInputModifiers,
  type PianoRollPointerInput,
  type PianoRollPointerInputPhase,
  type PianoRollPointerType,
} from '#internal/common/piano-roll/index'

export const PIANO_ROLL_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL = 4

export type PianoRollPointerInputAdapterFailureOperation =
  | 'hit-test'
  | 'observer-delivery'
  | 'pointer-capture'

export interface PianoRollPointerInputAdapterFailure {
  readonly cause: unknown
  readonly operation: PianoRollPointerInputAdapterFailureOperation
}

export interface PianoRollPointerInputAdapterObserver {
  onError(failure: PianoRollPointerInputAdapterFailure): void
  onInput(input: PianoRollPointerInput): void
}

export interface PianoRollPointerInputAdapter {
  dispose(): void
}

export type PianoRollBrowserHitResolver = (
  event: PointerEvent,
  surface: HTMLElement,
) => PianoRollHit | null

export interface CreatePianoRollPointerInputAdapterInput {
  readonly dragThresholdCssPixel?: number
  readonly observer: PianoRollPointerInputAdapterObserver
  readonly resolveHit?: PianoRollBrowserHitResolver
  readonly surface: HTMLElement
}

interface ActivePointer {
  readonly hit: PianoRollHit | null
  readonly modifiers: PianoRollInputModifiers
  readonly originPosition: PianoRollCssPoint
  readonly pointerId: number
  readonly pointerType: PianoRollPointerType
  hasExceededDragThreshold: boolean
  lastPosition: PianoRollCssPoint
}

function requireDragThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PianoRollBrowserError(
      'invalid-pointer-input-configuration',
      'Piano Roll drag threshold must be a finite positive CSS Pixel value',
    )
  }
  return value
}

function normalizePointerType(pointerType: string): PianoRollPointerType {
  switch (pointerType) {
    case 'mouse':
    case 'pen':
    case 'touch':
      return pointerType
    default:
      return 'unknown'
  }
}

function createModifiers(event: PointerEvent): PianoRollInputModifiers {
  return Object.freeze({
    alt: event.altKey,
    control: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  })
}

function copyHit(hit: PianoRollHit | null): PianoRollHit | null {
  return hit === null
    ? null
    : Object.freeze({
        noteId: hit.noteId,
        zone: hit.zone,
      })
}

function createPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  surface: HTMLElement,
): PianoRollCssPoint {
  const bounds = surface.getBoundingClientRect()
  return Object.freeze({
    xCssPixel: event.clientX - bounds.left,
    yCssPixel: event.clientY - bounds.top,
  })
}

function createFailure(
  operation: PianoRollPointerInputAdapterFailureOperation,
  cause: unknown,
): PianoRollPointerInputAdapterFailure {
  return Object.freeze({ cause, operation })
}

class PianoRollPointerInputAdapterImpl implements PianoRollPointerInputAdapter {
  readonly #dragThresholdSquared: number
  readonly #observer: PianoRollPointerInputAdapterObserver
  readonly #resolveHit: PianoRollBrowserHitResolver
  readonly #surface: HTMLElement
  #activePointer: ActivePointer | null = null
  #disposed = false

  constructor(input: CreatePianoRollPointerInputAdapterInput) {
    const dragThreshold = requireDragThreshold(
      input.dragThresholdCssPixel ??
        PIANO_ROLL_DEFAULT_DRAG_THRESHOLD_CSS_PIXEL,
    )
    this.#dragThresholdSquared = dragThreshold * dragThreshold
    this.#observer = input.observer
    this.#resolveHit =
      input.resolveHit ??
      ((event, surface) => resolvePianoRollDomNoteHit(event, surface))
    this.#surface = input.surface

    input.surface.addEventListener('pointerdown', this.#handlePointerDown)
    input.surface.addEventListener('pointermove', this.#handlePointerMove)
    input.surface.addEventListener('pointerup', this.#handlePointerUp)
    input.surface.addEventListener('pointercancel', this.#handlePointerCancel)
    input.surface.addEventListener(
      'lostpointercapture',
      this.#handleLostPointerCapture,
    )
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true

    this.#surface.removeEventListener('pointerdown', this.#handlePointerDown)
    this.#surface.removeEventListener('pointermove', this.#handlePointerMove)
    this.#surface.removeEventListener('pointerup', this.#handlePointerUp)
    this.#surface.removeEventListener('pointercancel', this.#handlePointerCancel)
    this.#surface.removeEventListener(
      'lostpointercapture',
      this.#handleLostPointerCapture,
    )

    const activePointer = this.#activePointer
    this.#activePointer = null
    if (activePointer === null) return

    this.#deliverInput(
      this.#createInput(
        activePointer,
        PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
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

    let hit: PianoRollHit | null
    try {
      hit = copyHit(this.#resolveHit(event, this.#surface))
    } catch (cause) {
      this.#deliverFailure(createFailure('hit-test', cause))
      return
    }

    if (!this.#capturePointer(event.pointerId)) return
    const position = createPoint(event, this.#surface)
    const activePointer: ActivePointer = {
      hit,
      modifiers: createModifiers(event),
      originPosition: position,
      pointerId: event.pointerId,
      pointerType: normalizePointerType(event.pointerType),
      hasExceededDragThreshold: false,
      lastPosition: position,
    }
    this.#activePointer = activePointer
    this.#deliverInput(
      this.#createInput(
        activePointer,
        PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN,
        position,
      ),
    )
  }

  readonly #handlePointerMove = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = createPoint(event, this.#surface)
    this.#updateActivePointer(activePointer, position)
    this.#deliverInput(
      this.#createInput(
        activePointer,
        PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE,
        position,
      ),
    )
  }

  readonly #handlePointerUp = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = createPoint(event, this.#surface)
    this.#updateActivePointer(activePointer, position)
    this.#activePointer = null
    this.#releasePointerCapture(activePointer.pointerId)
    this.#deliverInput(
      this.#createInput(
        activePointer,
        PIANO_ROLL_POINTER_INPUT_PHASE.END,
        position,
      ),
    )
  }

  readonly #handlePointerCancel = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    const position = createPoint(event, this.#surface)
    this.#updateActivePointer(activePointer, position)
    this.#activePointer = null
    this.#releasePointerCapture(activePointer.pointerId)
    this.#deliverInput(
      this.#createInput(
        activePointer,
        PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
        position,
      ),
    )
  }

  readonly #handleLostPointerCapture = (event: PointerEvent): void => {
    const activePointer = this.#requireActivePointer(event.pointerId)
    if (activePointer === null) return

    this.#activePointer = null
    this.#deliverInput(
      this.#createInput(
        activePointer,
        PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL,
        activePointer.lastPosition,
      ),
    )
  }

  #requireActivePointer(pointerId: number): ActivePointer | null {
    if (this.#disposed || this.#activePointer?.pointerId !== pointerId) return null
    return this.#activePointer
  }

  #updateActivePointer(
    activePointer: ActivePointer,
    position: PianoRollCssPoint,
  ): void {
    activePointer.lastPosition = position
    if (activePointer.hasExceededDragThreshold) return

    const deltaX = position.xCssPixel - activePointer.originPosition.xCssPixel
    const deltaY = position.yCssPixel - activePointer.originPosition.yCssPixel
    activePointer.hasExceededDragThreshold =
      deltaX * deltaX + deltaY * deltaY >= this.#dragThresholdSquared
  }

  #createInput(
    activePointer: ActivePointer,
    phase: PianoRollPointerInputPhase,
    position: PianoRollCssPoint,
  ): PianoRollPointerInput {
    return Object.freeze({
      hasExceededDragThreshold: activePointer.hasExceededDragThreshold,
      hit: activePointer.hit,
      modifiers: activePointer.modifiers,
      originPosition: activePointer.originPosition,
      phase,
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

  #deliverInput(input: PianoRollPointerInput): void {
    try {
      this.#observer.onInput(input)
    } catch (cause) {
      this.#deliverFailure(createFailure('observer-delivery', cause))
    }
  }

  #deliverFailure(failure: PianoRollPointerInputAdapterFailure): void {
    try {
      this.#observer.onError(failure)
    } catch {
      // Browser event delivery must not escape into the host event loop.
    }
  }
}

/** Captures one primary Pointer gesture and emits renderer-neutral inputs. */
export function createPianoRollPointerInputAdapter(
  input: CreatePianoRollPointerInputAdapterInput,
): PianoRollPointerInputAdapter {
  return new PianoRollPointerInputAdapterImpl(input)
}
