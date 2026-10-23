import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import {
  PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE,
  PIANO_ROLL_DOM_NOTE_CLIP_ID_ATTRIBUTE,
  PIANO_ROLL_DOM_NOTE_ZONE_ATTRIBUTE,
} from '#internal/browser/piano-roll/piano-roll-dom-note-hit'
import type {
  CreatePianoRollNoteRendererInput,
  PianoRollNoteRenderer,
  PianoRollNoteScene,
  PianoRollNoteVisual,
} from '#internal/browser/piano-roll/piano-roll-note-renderer'
import {
  PIANO_ROLL_HIT_ZONE,
  type PianoRollNoteResizeEdge,
} from '#internal/common/piano-roll/index'

const PIANO_ROLL_DOM_NOTE_RESIZE_HANDLE_WIDTH_CSS_PIXEL = 6

interface PianoRollDomNoteElements {
  readonly endHandle: HTMLDivElement
  readonly note: HTMLDivElement
  readonly startHandle: HTMLDivElement
  visual: PianoRollNoteVisual
}

function configureLayerRoot(root: HTMLDivElement): void {
  root.className = 'sd-piano-roll-dom-note-layer'
  root.setAttribute('aria-hidden', 'true')
  root.style.position = 'absolute'
  root.style.inset = '0'
  root.style.overflow = 'hidden'
  root.style.pointerEvents = 'none'
}

function createResizeHandle(document: Document, edge: PianoRollNoteResizeEdge): HTMLDivElement {
  const handle = document.createElement('div')
  const edgeClass = edge === PIANO_ROLL_HIT_ZONE.RESIZE_START ? 'start' : 'end'
  handle.className =
    `sd-piano-roll-dom-note__resize-handle ` + `sd-piano-roll-dom-note__resize-handle--${edgeClass}`
  handle.setAttribute(PIANO_ROLL_DOM_NOTE_ZONE_ATTRIBUTE, edge)
  handle.style.position = 'absolute'
  handle.style.insetBlock = '0'
  handle.style.cursor = 'ew-resize'
  handle.style.pointerEvents = 'auto'
  handle.style.touchAction = 'none'

  if (edge === PIANO_ROLL_HIT_ZONE.RESIZE_START) {
    handle.style.insetInlineStart = '0'
  } else {
    handle.style.insetInlineEnd = '0'
  }

  return handle
}

function createNoteElements(
  document: Document,
  visual: PianoRollNoteVisual,
): PianoRollDomNoteElements {
  const note = document.createElement('div')
  const startHandle = createResizeHandle(document, PIANO_ROLL_HIT_ZONE.RESIZE_START)
  const endHandle = createResizeHandle(document, PIANO_ROLL_HIT_ZONE.RESIZE_END)
  note.append(startHandle, endHandle)
  for (const target of [note, startHandle, endHandle]) {
    target.setAttribute(PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE, visual.noteId)
    target.setAttribute(PIANO_ROLL_DOM_NOTE_CLIP_ID_ATTRIBUTE, visual.clipId)
  }
  note.style.position = 'absolute'
  note.style.boxSizing = 'border-box'
  note.style.pointerEvents = 'auto'
  const elements = { endHandle, note, startHandle, visual }
  configureNoteElements(elements, visual, true)
  return elements
}

function configureNoteElements(
  elements: PianoRollDomNoteElements,
  visual: PianoRollNoteVisual,
  initial = false,
): void {
  const element = elements.note
  const previous = elements.visual
  if (initial || previous.selected !== visual.selected) {
    element.className = visual.selected
      ? 'sd-piano-roll-dom-note sd-piano-roll-dom-note--selected'
      : 'sd-piano-roll-dom-note'
    element.style.zIndex = visual.selected ? '1' : '0'
  }
  if (initial || previous.widthCssPixel !== visual.widthCssPixel) {
    const handleWidthCssPixel = Math.min(
      PIANO_ROLL_DOM_NOTE_RESIZE_HANDLE_WIDTH_CSS_PIXEL,
      visual.widthCssPixel / 2,
    )
    elements.startHandle.style.inlineSize = `${handleWidthCssPixel}px`
    elements.endHandle.style.inlineSize = `${handleWidthCssPixel}px`
    element.style.width = `${visual.widthCssPixel}px`
  }
  if (initial || previous.heightCssPixel !== visual.heightCssPixel)
    element.style.height = `${visual.heightCssPixel}px`
  if (initial || previous.xCssPixel !== visual.xCssPixel || previous.yCssPixel !== visual.yCssPixel)
    element.style.transform = `translate3d(${visual.xCssPixel}px, ${visual.yCssPixel}px, 0)`
  if (initial || previous.borderColor !== visual.borderColor)
    element.style.border = `1px solid ${visual.borderColor}`
  if (initial || previous.fillColor !== visual.fillColor)
    element.style.background = visual.fillColor
  if (initial || previous.glowColor !== visual.glowColor)
    element.style.boxShadow =
      visual.glowColor === null
        ? 'none'
        : `0 0 0 1px ${visual.glowColor}, 0 0 8px ${visual.glowColor}`
  if (initial || previous.opacity !== visual.opacity) element.style.opacity = String(visual.opacity)
  elements.visual = visual
}

class PianoRollDomNoteRenderer implements PianoRollNoteRenderer {
  readonly #elementsByOccurrence = new Map<string, PianoRollDomNoteElements>()
  readonly #root: HTMLDivElement
  #disposed = false

  constructor(input: CreatePianoRollNoteRendererInput) {
    this.#root = input.container.ownerDocument.createElement('div')
    configureLayerRoot(this.#root)
    input.container.append(this.#root)
  }

  render(scene: PianoRollNoteScene): void {
    this.#requireActive()
    // Tuple serialization preserves Clip occurrence identity without changing source Note IDs.
    const occurrences = scene.notes.map((visual) => ({
      key: JSON.stringify([visual.clipId, visual.noteId]),
      visual,
    }))
    const retainedOccurrences = new Set(occurrences.map(({ key }) => key))
    for (const [key, elements] of this.#elementsByOccurrence) {
      if (!retainedOccurrences.has(key)) {
        elements.note.remove()
        this.#elementsByOccurrence.delete(key)
      }
    }
    let nextChild = this.#root.firstChild

    this.#root.style.width = `${scene.widthCssPixel}px`
    this.#root.style.height = `${scene.heightCssPixel}px`

    for (const { key, visual } of occurrences) {
      let elements = this.#elementsByOccurrence.get(key)
      if (elements === undefined) {
        elements = createNoteElements(this.#root.ownerDocument, visual)
        this.#elementsByOccurrence.set(key, elements)
      } else {
        configureNoteElements(elements, visual)
      }
      // Preserve connected nodes unless the scene actually changes their stacking order.
      if (elements.note === nextChild) nextChild = nextChild.nextSibling
      else this.#root.insertBefore(elements.note, nextChild)
    }
  }

  clear(): void {
    this.#requireActive()
    this.#root.replaceChildren()
    this.#elementsByOccurrence.clear()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#root.replaceChildren()
    this.#root.remove()
    this.#elementsByOccurrence.clear()
    this.#disposed = true
  }

  #requireActive(): void {
    if (this.#disposed) {
      throw new PianoRollBrowserError(
        'renderer-disposed',
        'Piano Roll DOM Note Renderer has been disposed',
      )
    }
  }
}

/** Creates the default keyed, event-delegation-ready DOM Note renderer. */
export function createPianoRollDomNoteRenderer(
  input: CreatePianoRollNoteRendererInput,
): PianoRollNoteRenderer {
  return new PianoRollDomNoteRenderer(input)
}
