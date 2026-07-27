import {
  clearPianoRollCanvasLayer,
  createPianoRollCanvasLayer,
  preparePianoRollCanvasLayer,
  requirePianoRollDevicePixelRatio,
  type PianoRollCanvasLayer,
} from '#internal/browser/piano-roll/piano-roll-canvas-layer'
import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import type {
  CreatePianoRollNoteRendererInput,
  PianoRollNoteRenderer,
  PianoRollNoteScene,
} from '#internal/browser/piano-roll/piano-roll-note-renderer'

class PianoRollCanvasNoteRenderer implements PianoRollNoteRenderer {
  readonly #devicePixelRatio: number
  readonly #layer: PianoRollCanvasLayer
  #disposed = false

  constructor(input: CreatePianoRollNoteRendererInput) {
    this.#devicePixelRatio = requirePianoRollDevicePixelRatio(
      input.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1,
    )
    const canvas = input.container.ownerDocument.createElement('canvas')
    canvas.className = 'sd-piano-roll-canvas-note-layer'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.display = 'block'
    input.container.append(canvas)

    try {
      this.#layer = createPianoRollCanvasLayer(canvas, 'Note')
    } catch (cause) {
      canvas.remove()
      throw cause
    }
  }

  render(scene: PianoRollNoteScene): void {
    this.#requireActive()
    preparePianoRollCanvasLayer(
      this.#layer,
      scene.widthCssPixel,
      scene.heightCssPixel,
      this.#devicePixelRatio,
    )

    this.#layer.context.save()
    this.#layer.context.beginPath()
    this.#layer.context.rect(0, 0, scene.widthCssPixel, scene.heightCssPixel)
    this.#layer.context.clip()
    for (const visual of scene.notes) {
      this.#layer.context.globalAlpha = visual.opacity
      this.#layer.context.fillStyle = visual.fillColor
      this.#layer.context.fillRect(
        visual.xCssPixel,
        visual.yCssPixel,
        visual.widthCssPixel,
        visual.heightCssPixel,
      )
      this.#layer.context.strokeStyle = visual.borderColor
      this.#layer.context.lineWidth = 1
      this.#layer.context.strokeRect(
        visual.xCssPixel + 0.5,
        visual.yCssPixel + 0.5,
        Math.max(0, visual.widthCssPixel - 1),
        Math.max(0, visual.heightCssPixel - 1),
      )
    }
    this.#layer.context.restore()
  }

  clear(): void {
    this.#requireActive()
    clearPianoRollCanvasLayer(this.#layer)
  }

  dispose(): void {
    if (this.#disposed) return
    clearPianoRollCanvasLayer(this.#layer)
    this.#layer.canvas.remove()
    this.#disposed = true
  }

  #requireActive(): void {
    if (this.#disposed) {
      throw new PianoRollBrowserError(
        'renderer-disposed',
        'Piano Roll Canvas Note Renderer has been disposed',
      )
    }
  }
}

/** Creates the interchangeable DPR-aware Canvas implementation of the Note port. */
export function createPianoRollCanvasNoteRenderer(
  input: CreatePianoRollNoteRendererInput,
): PianoRollNoteRenderer {
  return new PianoRollCanvasNoteRenderer(input)
}
