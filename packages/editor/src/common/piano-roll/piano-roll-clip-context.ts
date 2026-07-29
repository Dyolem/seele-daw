import {
  addTicks,
  parseTick,
  type ClipId,
  type MidiClipRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type Tick,
} from '@seele-daw/project-core'

import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'

export interface PianoRollClipContext {
  readonly clipId: ClipId
  readonly clipSpanTick: Tick
  readonly sourceEndTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceLengthTick: Tick
  readonly sourceStartTick: Tick
}

/** Creates the first 1:1, non-looped Clip editing window over its owned MidiSource. */
export function createPianoRollClipContext(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
): PianoRollClipContext {
  if (clip.sourceId !== source.id) {
    throw new PianoRollError(
      'clip-source-mismatch',
      `Cannot edit Clip ${clip.id} with unrelated MidiSource ${source.id}`,
    )
  }

  if (clip.loop !== null) {
    throw new PianoRollError(
      'looped-clip-unsupported',
      `Piano Roll does not yet support looped Clip ${clip.id}`,
    )
  }

  const sourceEndTick = addTicks(clip.sourceOffsetTick, clip.spanTick)
  if (sourceEndTick > source.lengthTick) {
    throw new PianoRollError(
      'clip-source-range-invalid',
      `Clip ${clip.id} reads beyond MidiSource ${source.id}`,
    )
  }

  return Object.freeze({
    clipId: clip.id,
    clipSpanTick: clip.spanTick,
    sourceEndTick,
    sourceId: source.id,
    sourceLengthTick: source.lengthTick,
    sourceStartTick: clip.sourceOffsetTick,
  })
}

function requireClipTick(context: PianoRollClipContext, clipTickInput: Tick): Tick {
  const clipTick = parseTick(clipTickInput)
  if (clipTick > context.clipSpanTick) {
    throw new PianoRollError(
      'tick-outside-clip',
      `Clip-local Tick ${clipTick} is outside Clip ${context.clipId}`,
    )
  }
  return clipTick
}

/** Maps a Clip-local endpoint Tick into its current 1:1 MidiSource window. */
export function pianoRollClipTickToSourceTick(
  context: PianoRollClipContext,
  clipTickInput: Tick,
): Tick {
  return addTicks(context.sourceStartTick, requireClipTick(context, clipTickInput))
}

/** Maps a MidiSource endpoint Tick back into the current 1:1 Clip window. */
export function pianoRollSourceTickToClipTick(
  context: PianoRollClipContext,
  sourceTickInput: Tick,
): Tick {
  const sourceTick = parseTick(sourceTickInput)
  if (sourceTick < context.sourceStartTick || sourceTick > context.sourceEndTick) {
    throw new PianoRollError(
      'tick-outside-clip',
      `MidiSource Tick ${sourceTick} is outside Clip ${context.clipId}`,
    )
  }
  return parseTick(sourceTick - context.sourceStartTick)
}
