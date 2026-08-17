import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  ZERO_TICK,
  addTicks,
  parseMidiPitch,
  parsePositiveTick,
  parseTick,
  type ClipId,
  type MidiPitch,
  type Tick,
} from '@seele-daw/project-core'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'
import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'

export const PIANO_ROLL_DEFAULT_CENTER_PITCH = parseMidiPitch(60)

/** Shared time-and-pitch geometry for Clip-local and global Track Piano Rolls. */
export interface PianoRollTimelineViewport {
  readonly heightCssPixel: number
  readonly maximumPitch: MidiPitch
  readonly minimumPitch: MidiPitch
  readonly visibleEndTick: Tick
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
}

export interface PianoRollViewport extends PianoRollTimelineViewport {
  readonly clipId: ClipId
}

export interface CreatePianoRollTimelineViewportInput {
  readonly heightCssPixel: number
  readonly maximumPitch: MidiPitch
  readonly minimumPitch: MidiPitch
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
  readonly widthCssPixel: number
}

export type CreatePianoRollViewportInput = CreatePianoRollTimelineViewportInput

export interface CreateInitialPianoRollViewportInput {
  readonly heightCssPixel: number
  readonly maximumPitch: MidiPitch
  readonly minimumPitch: MidiPitch
  readonly widthCssPixel: number
}

function requirePositiveCssPixel(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PianoRollError(
      'invalid-viewport-dimension',
      `Piano Roll ${field} must be a finite positive CSS Pixel value`,
    )
  }
  return value
}

export function createPianoRollViewport(
  context: PianoRollClipContext,
  input: CreatePianoRollViewportInput,
): PianoRollViewport {
  const viewport = createPianoRollTimelineViewport(input)

  if (viewport.visibleEndTick > context.clipSpanTick) {
    throw new PianoRollError(
      'viewport-outside-clip',
      `Piano Roll Viewport extends beyond Clip ${context.clipId}`,
    )
  }

  return Object.freeze({
    ...viewport,
    clipId: context.clipId,
  })
}

/** Creates identity-free geometry reusable by the global Track surface. */
export function createPianoRollTimelineViewport(
  input: CreatePianoRollTimelineViewportInput,
): PianoRollTimelineViewport {
  const visibleStartTick = parseTick(input.visibleStartTick)
  const visibleSpanTick = parsePositiveTick(input.visibleSpanTick)
  const visibleEndTick = addTicks(visibleStartTick, visibleSpanTick)
  const minimumPitch = parseMidiPitch(input.minimumPitch)
  const maximumPitch = parseMidiPitch(input.maximumPitch)

  if (maximumPitch < minimumPitch) {
    throw new PianoRollError(
      'invalid-viewport-pitch-range',
      'Piano Roll Viewport maximumPitch must not be below minimumPitch',
    )
  }

  return Object.freeze({
    heightCssPixel: requirePositiveCssPixel(input.heightCssPixel, 'height'),
    maximumPitch,
    minimumPitch,
    visibleEndTick,
    visibleSpanTick,
    visibleStartTick,
    widthCssPixel: requirePositiveCssPixel(input.widthCssPixel, 'width'),
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

function requireVisibleTick(viewport: PianoRollTimelineViewport, timelineTickInput: Tick): Tick {
  const timelineTick = parseTick(timelineTickInput)
  if (timelineTick < viewport.visibleStartTick || timelineTick > viewport.visibleEndTick) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      `Timeline Tick ${timelineTick} is outside the Piano Roll Viewport`,
    )
  }
  return timelineTick
}

function requireCssPixelPosition(
  value: number,
  maximum: number,
  axis: 'horizontal' | 'vertical',
  includeMaximum: boolean,
): number {
  const insideMaximum = includeMaximum ? value <= maximum : value < maximum
  if (!Number.isFinite(value) || value < 0 || !insideMaximum) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      `Piano Roll ${axis} CSS Pixel position is outside the Viewport`,
    )
  }
  return value
}

export function pianoRollClipTickToCssPixel(
  viewport: PianoRollTimelineViewport,
  clipTickInput: Tick,
): number {
  return pianoRollTimelineTickToCssPixel(viewport, clipTickInput)
}

export function pianoRollTimelineTickToCssPixel(
  viewport: PianoRollTimelineViewport,
  timelineTickInput: Tick,
): number {
  const timelineTick = requireVisibleTick(viewport, timelineTickInput)
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
  xCssPixelInput: number,
): number {
  return pianoRollCssPixelToTimelineTickPosition(viewport, xCssPixelInput)
}

export function pianoRollCssPixelToTimelineTickPosition(
  viewport: PianoRollTimelineViewport,
  xCssPixelInput: number,
): number {
  const xCssPixel = requireCssPixelPosition(
    xCssPixelInput,
    viewport.widthCssPixel,
    'horizontal',
    true,
  )
  return viewport.visibleStartTick + (xCssPixel / viewport.widthCssPixel) * viewport.visibleSpanTick
}

function pitchRowHeight(viewport: PianoRollTimelineViewport): number {
  return viewport.heightCssPixel / (viewport.maximumPitch - viewport.minimumPitch + 1)
}

export function pianoRollMidiPitchToCssPixel(
  viewport: PianoRollTimelineViewport,
  pitchInput: MidiPitch,
): number {
  const pitch = parseMidiPitch(pitchInput)
  if (pitch < viewport.minimumPitch || pitch > viewport.maximumPitch) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      `MIDI Pitch ${pitch} is outside the Piano Roll Viewport`,
    )
  }
  return (viewport.maximumPitch - pitch) * pitchRowHeight(viewport)
}

export function pianoRollCssPixelToMidiPitch(
  viewport: PianoRollTimelineViewport,
  yCssPixelInput: number,
): MidiPitch {
  const yCssPixel = requireCssPixelPosition(
    yCssPixelInput,
    viewport.heightCssPixel,
    'vertical',
    false,
  )
  const pitch = viewport.maximumPitch - Math.floor(yCssPixel / pitchRowHeight(viewport))
  return parseMidiPitch(Math.min(MIDI_PITCH_MAX, Math.max(MIDI_PITCH_MIN, pitch)))
}
