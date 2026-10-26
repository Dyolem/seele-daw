import {
  PROJECT_PPQ,
  ZERO_TICK,
  addTicks,
  parsePositiveTick,
  parseTick,
  type ProjectSnapshot,
  type Tick,
} from '@seele-daw/project-core'

export const AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT = 150
export const AUDIBLE_MIDI_TIMELINE_TAIL_BAR_COUNT = 8

export interface AudibleMidiTimelineRange {
  readonly initialBarSpanTick: Tick
  readonly minimumTimelineEndTick: Tick
  readonly contentEndTick: Tick
  readonly timelineEndTick: Tick
  readonly timelineBarCount: number
}

/**
 * Derives the shared V1 view and playback extent without creating a persisted Project fact.
 * Authored content keeps its exact end while the Timeline ends on a full bar with a visual tail.
 * Later meter events do not reshape the initial fixed-width Arrangement grid.
 */
export function deriveAudibleMidiTimelineRange(
  snapshot: ProjectSnapshot,
): AudibleMidiTimelineRange {
  // Project facts hold exactly one time signature at Tick 0.
  const initialTimeSignature = snapshot.timeSignatureEvents.find(({ tick }) => tick === ZERO_TICK)!
  const beatSpanTick = (PROJECT_PPQ * 4) / initialTimeSignature.denominator
  const initialBarSpanTick = parsePositiveTick(beatSpanTick * initialTimeSignature.numerator)
  const minimumTimelineEndTick = parseTick(
    initialBarSpanTick * AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
  )
  let contentEndTick = ZERO_TICK

  // Muted and unsupported Clips remain authored geometry and therefore extend the timeline.
  for (const clip of snapshot.clips) {
    const clipEndTick = addTicks(clip.startTick, clip.spanTick)
    if (clipEndTick > contentEndTick) contentEndTick = clipEndTick
  }

  const contentBarCount = Math.ceil(contentEndTick / initialBarSpanTick)
  const timelineBarCount = Math.max(
    AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
    contentBarCount + AUDIBLE_MIDI_TIMELINE_TAIL_BAR_COUNT,
  )
  const timelineEndTick = parseTick(timelineBarCount * initialBarSpanTick)

  return Object.freeze({
    contentEndTick,
    initialBarSpanTick,
    minimumTimelineEndTick,
    timelineBarCount,
    timelineEndTick,
  })
}
