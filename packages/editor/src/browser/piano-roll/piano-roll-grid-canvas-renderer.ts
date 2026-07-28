import {
  parseTick,
  type Tick,
} from '@seele-daw/project-core'

import {
  clearPianoRollCanvasLayer,
  createPianoRollCanvasLayer,
  preparePianoRollCanvasLayer,
  requirePianoRollDevicePixelRatio,
  type PianoRollCanvasLayer,
} from '#internal/browser/piano-roll/piano-roll-canvas-layer'
import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import {
  createPianoRollGrid,
  pianoRollClipTickToCssPixel,
  type PianoRollGrid,
  type PianoRollViewport,
} from '#internal/common/piano-roll/index'

export interface PianoRollGridCanvasTheme {
  readonly background: string
  readonly blackPitchRow: string
  readonly gridBar: string
  readonly gridBeat: string
  readonly gridSubdivision: string
  readonly pitchRowBorder: string
  readonly whitePitchRow: string
}

export interface PianoRollGridCanvasRenderInput {
  readonly grid: PianoRollGrid
  readonly theme: PianoRollGridCanvasTheme
  readonly viewport: PianoRollViewport
}

export interface CreatePianoRollGridCanvasRendererInput {
  readonly canvas: HTMLCanvasElement
  readonly devicePixelRatio?: number
}

export interface PianoRollGridCanvasRenderer {
  clear(): void
  dispose(): void
  render(input: PianoRollGridCanvasRenderInput): void
}

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])

function requireTheme(theme: PianoRollGridCanvasTheme): PianoRollGridCanvasTheme {
  for (const [name, value] of Object.entries(theme)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new PianoRollBrowserError(
        'invalid-theme',
        `Piano Roll Grid theme token ${name} must be a non-empty CSS color`,
      )
    }
  }
  return theme
}

function pitchRowHeight(viewport: PianoRollViewport): number {
  return (
    viewport.heightCssPixel /
    (viewport.maximumPitch - viewport.minimumPitch + 1)
  )
}

function drawPitchRows(
  context: CanvasRenderingContext2D,
  viewport: PianoRollViewport,
  theme: PianoRollGridCanvasTheme,
): void {
  const rowHeight = pitchRowHeight(viewport)
  context.fillStyle = theme.background
  context.fillRect(0, 0, viewport.widthCssPixel, viewport.heightCssPixel)

  for (
    let pitch: number = viewport.maximumPitch;
    pitch >= viewport.minimumPitch;
    pitch -= 1
  ) {
    const y = (viewport.maximumPitch - pitch) * rowHeight
    context.fillStyle = BLACK_PITCH_CLASSES.has(pitch % 12)
      ? theme.blackPitchRow
      : theme.whitePitchRow
    context.fillRect(0, y, viewport.widthCssPixel, rowHeight)
  }

  context.beginPath()
  context.strokeStyle = theme.pitchRowBorder
  context.lineWidth = 1
  for (let row = 1; row <= viewport.maximumPitch - viewport.minimumPitch; row += 1) {
    const y = row * rowHeight
    context.moveTo(0, y)
    context.lineTo(viewport.widthCssPixel, y)
  }
  context.stroke()
}

function firstGridTick(
  visibleStartTick: Tick,
  originTick: Tick,
  spanTick: Tick,
): Tick {
  if (visibleStartTick <= originTick) return originTick
  return parseTick(
    originTick +
      Math.ceil((visibleStartTick - originTick) / spanTick) * spanTick,
  )
}

function drawVerticalGrid(
  context: CanvasRenderingContext2D,
  viewport: PianoRollViewport,
  grid: PianoRollGrid,
  theme: PianoRollGridCanvasTheme,
): void {
  const groups = [
    {
      color: theme.gridSubdivision,
      lineWidth: 0.5,
      minimumSpacingCssPixel: 6,
      spanTick: grid.subdivisionSpanTick,
    },
    {
      color: theme.gridBeat,
      lineWidth: 1,
      minimumSpacingCssPixel: 4,
      spanTick: grid.beatSpanTick,
    },
    {
      color: theme.gridBar,
      lineWidth: 1,
      minimumSpacingCssPixel: 2,
      spanTick: grid.barSpanTick,
    },
  ] as const

  for (const group of groups) {
    const spacingCssPixel =
      (group.spanTick / viewport.visibleSpanTick) * viewport.widthCssPixel
    if (spacingCssPixel < group.minimumSpacingCssPixel) continue

    context.beginPath()
    context.strokeStyle = group.color
    context.lineWidth = group.lineWidth

    for (
      let tick: number = firstGridTick(
        viewport.visibleStartTick,
        grid.originTick,
        group.spanTick,
      );
      tick <= viewport.visibleEndTick;
      tick += group.spanTick
    ) {
      const x = pianoRollClipTickToCssPixel(viewport, parseTick(tick))
      context.moveTo(x, 0)
      context.lineTo(x, viewport.heightCssPixel)
    }
    context.stroke()
  }
}

class PianoRollGridCanvasRendererImpl implements PianoRollGridCanvasRenderer {
  readonly #devicePixelRatio: number
  readonly #layer: PianoRollCanvasLayer
  #disposed = false

  constructor(input: CreatePianoRollGridCanvasRendererInput) {
    this.#devicePixelRatio = requirePianoRollDevicePixelRatio(
      input.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1,
    )
    this.#layer = createPianoRollCanvasLayer(input.canvas, 'Grid')
  }

  render(input: PianoRollGridCanvasRenderInput): void {
    this.#requireActive()
    const theme = requireTheme(input.theme)
    const grid = createPianoRollGrid(input.grid)

    preparePianoRollCanvasLayer(
      this.#layer,
      input.viewport.widthCssPixel,
      input.viewport.heightCssPixel,
      this.#devicePixelRatio,
    )
    drawPitchRows(this.#layer.context, input.viewport, theme)
    drawVerticalGrid(this.#layer.context, input.viewport, grid, theme)
  }

  clear(): void {
    this.#requireActive()
    clearPianoRollCanvasLayer(this.#layer)
  }

  dispose(): void {
    if (this.#disposed) return
    clearPianoRollCanvasLayer(this.#layer)
    this.#disposed = true
  }

  #requireActive(): void {
    if (this.#disposed) {
      throw new PianoRollBrowserError(
        'renderer-disposed',
        'Piano Roll Grid Canvas Renderer has been disposed',
      )
    }
  }
}

/** Creates the framework-neutral, DPR-aware static Grid Canvas renderer. */
export function createPianoRollGridCanvasRenderer(
  input: CreatePianoRollGridCanvasRendererInput,
): PianoRollGridCanvasRenderer {
  return new PianoRollGridCanvasRendererImpl(input)
}
