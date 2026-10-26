import {
  addTicks,
  parseTick,
  type ClipId,
  type MidiClipRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type Tick,
} from '@seele-daw/project-core'

export interface PianoRollClipContext {
  readonly clipId: ClipId
  readonly clipSpanTick: Tick
  readonly sourceEndTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceLengthTick: Tick
  readonly sourceStartTick: Tick
}

/**
 * The window a Clip shows of its MidiSource, one Clip Tick to one Source Tick. Null for a looped
 * Clip: the Piano Roll cannot edit repeated Source ranges yet.
 */
export function createPianoRollClipContext(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
): PianoRollClipContext | null {
  if (clip.loop !== null) return null
  return Object.freeze({
    clipId: clip.id,
    clipSpanTick: clip.spanTick,
    sourceEndTick: addTicks(clip.sourceOffsetTick, clip.spanTick),
    sourceId: source.id,
    sourceLengthTick: source.lengthTick,
    sourceStartTick: clip.sourceOffsetTick,
  })
}

/** Maps a Clip-local Tick to the MidiSource Tick it shows. */
export function pianoRollClipTickToSourceTick(context: PianoRollClipContext, clipTick: Tick): Tick {
  return addTicks(context.sourceStartTick, clipTick)
}

/** Maps a MidiSource Tick inside the Clip's window to its Clip-local Tick. */
export function pianoRollSourceTickToClipTick(
  context: PianoRollClipContext,
  sourceTick: Tick,
): Tick {
  return parseTick(sourceTick - context.sourceStartTick)
}
