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
  return Object.freeze({
    ...createPianoRollPitchViewport(input),
    visibleEndTick,
    visibleSpanTick,
    visibleStartTick,
    widthCssPixel: requirePositiveCssPixel(input.widthCssPixel, 'width'),
  })
}

export function createPianoRollPitchViewport(
  input: CreatePianoRollPitchViewportInput,
): PianoRollPitchViewport {
  const minimumPitch = parseMidiPitch(input.minimumPitch)
  const maximumPitch = parseMidiPitch(input.maximumPitch)

  if (maximumPitch < minimumPitch) {
    throw new PianoRollError(
      'invalid-viewport-pitch-range',
      'Piano Roll Viewport maximumPitch must not be below minimumPitch',
    )
  }

  const heightCssPixel = requirePositiveCssPixel(input.heightCssPixel, 'height')
  const pitchRowHeightCssPixel = requirePositiveCssPixel(
    input.pitchRowHeightCssPixel ?? heightCssPixel / (maximumPitch - minimumPitch + 1),
    'pitch row height',
  )
  const pitchOffsetCssPixel = input.pitchOffsetCssPixel ?? 0
  if (
    !Number.isFinite(pitchOffsetCssPixel) ||
    pitchOffsetCssPixel < 0 ||
    pitchOffsetCssPixel >= pitchRowHeightCssPixel
  ) {
    throw new PianoRollError(
      'invalid-viewport-dimension',
      'Pitch offset must be within the first visible row',
    )
  }
  return Object.freeze({
    heightCssPixel,
    maximumPitch,
    minimumPitch,
    pitchRowHeightCssPixel,
    pitchOffsetCssPixel,
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

export function pianoRollMidiPitchToCssPixel(
  viewport: PianoRollPitchViewport,
  pitchInput: MidiPitch,
): number {
  const pitch = parseMidiPitch(pitchInput)
  if (pitch < viewport.minimumPitch || pitch > viewport.maximumPitch) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      `MIDI Pitch ${pitch} is outside the Piano Roll Viewport`,
    )
  }
  return (
    (viewport.maximumPitch - pitch) * viewport.pitchRowHeightCssPixel - viewport.pitchOffsetCssPixel
  )
}

export function pianoRollCssPixelToMidiPitch(
  viewport: PianoRollPitchViewport,
  yCssPixelInput: number,
): MidiPitch {
  const yCssPixel = requireCssPixelPosition(
    yCssPixelInput,
    viewport.heightCssPixel,
    'vertical',
    false,
  )
  const pitch =
    viewport.maximumPitch -
    Math.floor((yCssPixel + viewport.pitchOffsetCssPixel) / viewport.pitchRowHeightCssPixel)
  if (pitch < viewport.minimumPitch) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      'Vertical position is below the visible MIDI range',
    )
  }
  return parseMidiPitch(Math.min(MIDI_PITCH_MAX, Math.max(MIDI_PITCH_MIN, pitch)))
}
