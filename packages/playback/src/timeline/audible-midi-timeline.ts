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

export type AudibleMidiTimelineErrorCode =
  | 'initial-time-signature-ambiguous'
  | 'initial-time-signature-missing'

/** Stable failure raised when a Project cannot provide the V1 timeline basis. */
export class AudibleMidiTimelineError extends Error {
  readonly code: AudibleMidiTimelineErrorCode

  constructor(code: AudibleMidiTimelineErrorCode, message: string) {
    super(message)
    this.name = 'AudibleMidiTimelineError'
    this.code = code
  }
}

export interface AudibleMidiTimelineRange {
  readonly initialBarSpanTick: Tick
  readonly minimumTimelineEndTick: Tick
  readonly contentEndTick: Tick
  readonly timelineEndTick: Tick
  readonly timelineBarCount: number
}

/**
 * Derives the shared V1 view and playback extent without creating a persisted Project fact.
 * Later meter events do not reshape the initial fixed-width Arrangement grid.
 */
export function deriveAudibleMidiTimelineRange(
  snapshot: ProjectSnapshot,
): AudibleMidiTimelineRange {
  const initialTimeSignatures = snapshot.timeSignatureEvents.filter(
    ({ tick }) => tick === ZERO_TICK,
  )
  if (initialTimeSignatures.length === 0) {
    throw new AudibleMidiTimelineError(
      'initial-time-signature-missing',
      'Audible MIDI Timeline requires an initial Project time signature at Tick 0',
    )
  }
  if (initialTimeSignatures.length > 1) {
    throw new AudibleMidiTimelineError(
      'initial-time-signature-ambiguous',
      'Audible MIDI Timeline requires exactly one initial Project time signature',
    )
  }

  const initialTimeSignature = initialTimeSignatures[0]!
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

  const timelineEndTick = parseTick(Math.max(minimumTimelineEndTick, contentEndTick))

  return Object.freeze({
    contentEndTick,
    initialBarSpanTick,
    minimumTimelineEndTick,
    timelineBarCount: Math.ceil(timelineEndTick / initialBarSpanTick),
    timelineEndTick,
  })
}
