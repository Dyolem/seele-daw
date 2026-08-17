import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import {
  PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE,
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
import type { NoteId } from '@seele-daw/project-core'

const PIANO_ROLL_DOM_NOTE_RESIZE_HANDLE_WIDTH_CSS_PIXEL = 6

interface PianoRollDomNoteElements {
  readonly endHandle: HTMLDivElement
  readonly note: HTMLDivElement
  readonly startHandle: HTMLDivElement
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

function createNoteElements(document: Document): PianoRollDomNoteElements {
  const note = document.createElement('div')
  const startHandle = createResizeHandle(document, PIANO_ROLL_HIT_ZONE.RESIZE_START)
  const endHandle = createResizeHandle(document, PIANO_ROLL_HIT_ZONE.RESIZE_END)
  note.append(startHandle, endHandle)
  return { endHandle, note, startHandle }
}

function configureNoteElements(
  elements: PianoRollDomNoteElements,
  visual: PianoRollNoteVisual,
): void {
  const element = elements.note
  element.className = visual.selected
    ? 'sd-piano-roll-dom-note sd-piano-roll-dom-note--selected'
    : 'sd-piano-roll-dom-note'
  element.setAttribute(PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE, visual.noteId)
  elements.startHandle.setAttribute(PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE, visual.noteId)
  elements.endHandle.setAttribute(PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE, visual.noteId)
  const handleWidthCssPixel = Math.min(
    PIANO_ROLL_DOM_NOTE_RESIZE_HANDLE_WIDTH_CSS_PIXEL,
    visual.widthCssPixel / 2,
  )
  elements.startHandle.style.inlineSize = `${handleWidthCssPixel}px`
  elements.endHandle.style.inlineSize = `${handleWidthCssPixel}px`
  element.style.position = 'absolute'
  element.style.boxSizing = 'border-box'
  element.style.width = `${visual.widthCssPixel}px`
  element.style.height = `${visual.heightCssPixel}px`
  element.style.transform = `translate3d(${visual.xCssPixel}px, ${visual.yCssPixel}px, 0)`
  element.style.border = `1px solid ${visual.borderColor}`
  element.style.background = visual.fillColor
  element.style.boxShadow =
    visual.glowColor === null
      ? 'none'
      : `0 0 0 1px ${visual.glowColor}, 0 0 8px ${visual.glowColor}`
  element.style.opacity = String(visual.opacity)
  element.style.pointerEvents = 'auto'
  element.style.zIndex = visual.selected ? '1' : '0'
}

class PianoRollDomNoteRenderer implements PianoRollNoteRenderer {
  readonly #elementsByNoteId = new Map<NoteId, PianoRollDomNoteElements>()
  readonly #root: HTMLDivElement
  #disposed = false

  constructor(input: CreatePianoRollNoteRendererInput) {
    this.#root = input.container.ownerDocument.createElement('div')
    configureLayerRoot(this.#root)
    input.container.append(this.#root)
  }

  render(scene: PianoRollNoteScene): void {
    this.#requireActive()
    const fragment = this.#root.ownerDocument.createDocumentFragment()
    const retainedNoteIds = new Set<NoteId>()

    this.#root.style.width = `${scene.widthCssPixel}px`
    this.#root.style.height = `${scene.heightCssPixel}px`

    for (const visual of scene.notes) {
      let elements = this.#elementsByNoteId.get(visual.noteId)
      if (elements === undefined) {
        elements = createNoteElements(this.#root.ownerDocument)
        this.#elementsByNoteId.set(visual.noteId, elements)
      }

      configureNoteElements(elements, visual)
      retainedNoteIds.add(visual.noteId)
      fragment.append(elements.note)
    }

    for (const noteId of this.#elementsByNoteId.keys()) {
      if (!retainedNoteIds.has(noteId)) this.#elementsByNoteId.delete(noteId)
    }
    this.#root.replaceChildren(fragment)
  }

  clear(): void {
    this.#requireActive()
    this.#root.replaceChildren()
    this.#elementsByNoteId.clear()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#root.replaceChildren()
    this.#root.remove()
    this.#elementsByNoteId.clear()
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
