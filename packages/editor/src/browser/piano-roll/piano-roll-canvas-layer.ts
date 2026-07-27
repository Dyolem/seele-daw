import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'

export interface PianoRollCanvasLayer {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
}

export function requirePianoRollDevicePixelRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PianoRollBrowserError(
      'invalid-device-pixel-ratio',
      'Piano Roll devicePixelRatio must be a finite positive number',
    )
  }
  return value
}

export function createPianoRollCanvasLayer(
  canvas: HTMLCanvasElement,
  layerName: string,
): PianoRollCanvasLayer {
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new PianoRollBrowserError(
      'canvas-context-unavailable',
      `Piano Roll ${layerName} Canvas does not provide a 2D rendering context`,
    )
  }
  return { canvas, context }
}

export function preparePianoRollCanvasLayer(
  layer: PianoRollCanvasLayer,
  widthCssPixel: number,
  heightCssPixel: number,
  devicePixelRatio: number,
): void {
  const bitmapWidth = Math.max(1, Math.round(widthCssPixel * devicePixelRatio))
  const bitmapHeight = Math.max(1, Math.round(heightCssPixel * devicePixelRatio))

  if (layer.canvas.width !== bitmapWidth) layer.canvas.width = bitmapWidth
  if (layer.canvas.height !== bitmapHeight) layer.canvas.height = bitmapHeight

  layer.canvas.style.width = `${widthCssPixel}px`
  layer.canvas.style.height = `${heightCssPixel}px`
  layer.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  layer.context.clearRect(0, 0, widthCssPixel, heightCssPixel)
}

export function clearPianoRollCanvasLayer(layer: PianoRollCanvasLayer): void {
  layer.context.setTransform(1, 0, 0, 1, 0, 0)
  layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
}
