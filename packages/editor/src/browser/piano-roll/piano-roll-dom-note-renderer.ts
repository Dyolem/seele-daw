import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import type {
  CreatePianoRollNoteRendererInput,
  PianoRollNoteRenderer,
  PianoRollNoteScene,
  PianoRollNoteVisual,
} from '#internal/browser/piano-roll/piano-roll-note-renderer'
import type { NoteId } from '@seele-daw/project-core'

function configureLayerRoot(root: HTMLDivElement): void {
  root.className = 'sd-piano-roll-dom-note-layer'
  root.setAttribute('aria-hidden', 'true')
  root.style.position = 'absolute'
  root.style.inset = '0'
  root.style.overflow = 'hidden'
  root.style.pointerEvents = 'none'
}

function configureNoteElement(
  element: HTMLDivElement,
  visual: PianoRollNoteVisual,
): void {
  element.className = 'sd-piano-roll-dom-note'
  element.dataset.pianoRollNoteId = visual.noteId
  element.style.position = 'absolute'
  element.style.boxSizing = 'border-box'
  element.style.width = `${visual.widthCssPixel}px`
  element.style.height = `${visual.heightCssPixel}px`
  element.style.transform = `translate3d(${visual.xCssPixel}px, ${visual.yCssPixel}px, 0)`
  element.style.border = `1px solid ${visual.borderColor}`
  element.style.background = visual.fillColor
  element.style.opacity = String(visual.opacity)
  element.style.pointerEvents = 'auto'
}

class PianoRollDomNoteRenderer implements PianoRollNoteRenderer {
  readonly #elementsByNoteId = new Map<NoteId, HTMLDivElement>()
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
      let element = this.#elementsByNoteId.get(visual.noteId)
      if (element === undefined) {
        element = this.#root.ownerDocument.createElement('div')
        this.#elementsByNoteId.set(visual.noteId, element)
      }

      configureNoteElement(element, visual)
      retainedNoteIds.add(visual.noteId)
      fragment.append(element)
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
