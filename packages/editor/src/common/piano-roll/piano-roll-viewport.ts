import {
  ZERO_TICK,
  addTicks,
  parseMidiPitch,
  parsePositiveTick,
  type ClipId,
  type MidiPitch,
  type Tick,
} from '@seele-daw/project-core'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'

export const PIANO_ROLL_DEFAULT_CENTER_PITCH = parseMidiPitch(60)

/** Visible rows may be clipped at either edge without changing their height. */
export interface PianoRollPitchViewport {
  readonly heightCssPixel: number
  readonly maximumPitch: MidiPitch
  readonly minimumPitch: MidiPitch
  readonly pitchRowHeightCssPixel: number
  readonly pitchOffsetCssPixel: number
}

/** Shared time-and-pitch geometry for Clip-local and global Track Piano Rolls. */
export interface PianoRollTimelineViewport extends PianoRollPitchViewport {
  readonly visibleEndTick: Tick
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
}

export interface PianoRollViewport extends PianoRollTimelineViewport {
  readonly clipId: ClipId
}

export interface CreatePianoRollPitchViewportInput {
  readonly heightCssPixel: number
  readonly maximumPitch: MidiPitch
  readonly minimumPitch: MidiPitch
  readonly pitchRowHeightCssPixel?: number
  readonly pitchOffsetCssPixel?: number
}

export interface CreatePianoRollTimelineViewportInput extends CreatePianoRollPitchViewportInput {
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
}

export type CreatePianoRollViewportInput = CreatePianoRollTimelineViewportInput

export interface CreateInitialPianoRollViewportInput extends CreatePianoRollPitchViewportInput {
  readonly widthCssPixel: number
}

/** Surface sizes come from layout, which reports zero while a panel is hidden. */
function requirePositiveCssPixel(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Piano Roll ${field} must be a finite positive CSS Pixel value`)
  }
  return value
}

export function createPianoRollViewport(
  context: PianoRollClipContext,
  input: CreatePianoRollViewportInput,
): PianoRollViewport {
  return Object.freeze({ ...createPianoRollTimelineViewport(input), clipId: context.clipId })
}

/** Creates identity-free geometry reusable by the global Track surface. */
export function createPianoRollTimelineViewport(
  input: CreatePianoRollTimelineViewportInput,
): PianoRollTimelineViewport {
  const visibleSpanTick = parsePositiveTick(input.visibleSpanTick)
  return Object.freeze({
    ...createPianoRollPitchViewport(input),
    visibleEndTick: addTicks(input.visibleStartTick, visibleSpanTick),
    visibleSpanTick,
    visibleStartTick: input.visibleStartTick,
    widthCssPixel: requirePositiveCssPixel(input.widthCssPixel, 'width'),
  })
}

export function createPianoRollPitchViewport(
  input: CreatePianoRollPitchViewportInput,
): PianoRollPitchViewport {
  const heightCssPixel = requirePositiveCssPixel(input.heightCssPixel, 'height')
  return Object.freeze({
    heightCssPixel,
    maximumPitch: input.maximumPitch,
    minimumPitch: input.minimumPitch,
    pitchRowHeightCssPixel:
      input.pitchRowHeightCssPixel ??
      heightCssPixel / (input.maximumPitch - input.minimumPitch + 1),
    pitchOffsetCssPixel: input.pitchOffsetCssPixel ?? 0,
  })
}

/** Creates the product-default horizontal view: the complete selected Clip. */
export function createInitialPianoRollViewport(
  context: PianoRollClipContext,
  input: CreateInitialPianoRollViewportInput,
): PianoRollViewport {
  return createPianoRollViewport(context, {
    ...input,
    visibleStartTick: ZERO_TICK,
    visibleSpanTick: context.clipSpanTick,
  })
}

export function pianoRollClipTickToCssPixel(
  viewport: PianoRollTimelineViewport,
  clipTick: Tick,
): number {
  return pianoRollTimelineTickToCssPixel(viewport, clipTick)
}

export function pianoRollTimelineTickToCssPixel(
  viewport: PianoRollTimelineViewport,
  timelineTick: Tick,
): number {
  return (
    ((timelineTick - viewport.visibleStartTick) / viewport.visibleSpanTick) * viewport.widthCssPixel
  )
}

/**
 * Returns an unrounded Clip-local Tick position. Snap policy converts this
 * continuous value into a domain Tick in a later interaction layer.
 */
export function pianoRollCssPixelToClipTickPosition(
  viewport: PianoRollTimelineViewport,
  xCssPixel: number,
): number {
  return pianoRollCssPixelToTimelineTickPosition(viewport, xCssPixel)
}

export function pianoRollCssPixelToTimelineTickPosition(
  viewport: PianoRollTimelineViewport,
  xCssPixel: number,
): number {
  return viewport.visibleStartTick + (xCssPixel / viewport.widthCssPixel) * viewport.visibleSpanTick
}

export function pianoRollMidiPitchToCssPixel(
  viewport: PianoRollPitchViewport,
  pitch: MidiPitch,
): number {
  return (
    (viewport.maximumPitch - pitch) * viewport.pitchRowHeightCssPixel - viewport.pitchOffsetCssPixel
  )
}

/** The visible pitch row under a vertical position; positions past the last row get that row. */
export function pianoRollCssPixelToMidiPitch(
  viewport: PianoRollPitchViewport,
  yCssPixel: number,
): MidiPitch {
  const row = Math.floor(
    (yCssPixel + viewport.pitchOffsetCssPixel) / viewport.pitchRowHeightCssPixel,
  )
  return parseMidiPitch(
    Math.min(viewport.maximumPitch, Math.max(viewport.minimumPitch, viewport.maximumPitch - row)),
  )
}
