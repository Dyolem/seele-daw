import {
  isMidiSustainPedalDown,
  type MidiChannel,
  type MidiSustainPedalEventRecord,
  type Tick,
} from '@seele-daw/project-core'

interface SustainPedalChannelTimeline {
  readonly events: readonly MidiSustainPedalEventRecord[]
  readonly nextPedalUpTickByIndex: readonly (Tick | null)[]
}

export interface SustainPedalReleaseResolver {
  resolveFinalReleaseTick(
    channel: MidiChannel,
    keyReleaseTick: Tick,
    sourceWindowEndTick: Tick,
  ): Tick
}

function createChannelTimeline(
  events: readonly MidiSustainPedalEventRecord[],
): SustainPedalChannelTimeline {
  const nextPedalUpTickByIndex: (Tick | null)[] = Array.from<null>({ length: events.length }).fill(
    null,
  )
  let nextPedalUpTick: Tick | null = null

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    nextPedalUpTickByIndex[index] = nextPedalUpTick
    if (!isMidiSustainPedalDown(event.value)) nextPedalUpTick = event.tick
  }

  return Object.freeze({
    events: Object.freeze([...events]),
    nextPedalUpTickByIndex: Object.freeze(nextPedalUpTickByIndex),
  })
}

function findLastEventIndexAtOrBefore(
  events: readonly MidiSustainPedalEventRecord[],
  tick: Tick,
): number {
  let lowerIndex = 0
  let upperIndex = events.length

  while (lowerIndex < upperIndex) {
    const candidateIndex = Math.floor((lowerIndex + upperIndex) / 2)
    const candidate = events[candidateIndex]
    if (candidate !== undefined && candidate.tick <= tick) lowerIndex = candidateIndex + 1
    else upperIndex = candidateIndex
  }

  return lowerIndex - 1
}

/**
 * Derives final Gate Release without rewriting authored Note duration. CC64 at the same Tick is
 * applied before Note Off. The events are a Snapshot partition: in Tick order, at most one per
 * Tick and Channel.
 */
export function createSustainPedalReleaseResolver(
  events: readonly MidiSustainPedalEventRecord[],
): SustainPedalReleaseResolver {
  const eventsByChannel = new Map<MidiChannel, MidiSustainPedalEventRecord[]>()
  for (const event of events) {
    const channelEvents = eventsByChannel.get(event.channel)
    if (channelEvents === undefined) eventsByChannel.set(event.channel, [event])
    else channelEvents.push(event)
  }

  const timelines = new Map<MidiChannel, SustainPedalChannelTimeline>()
  for (const [channel, channelEvents] of eventsByChannel) {
    timelines.set(channel, createChannelTimeline(channelEvents))
  }

  return Object.freeze({
    /** The key release is never after the window end: the compiler clips Notes to it. */
    resolveFinalReleaseTick(
      channel: MidiChannel,
      keyReleaseTick: Tick,
      sourceWindowEndTick: Tick,
    ): Tick {
      if (keyReleaseTick === sourceWindowEndTick) return sourceWindowEndTick

      const timeline = timelines.get(channel)
      if (timeline === undefined) return keyReleaseTick
      const stateEventIndex = findLastEventIndexAtOrBefore(timeline.events, keyReleaseTick)
      if (stateEventIndex < 0) return keyReleaseTick
      const stateEvent = timeline.events[stateEventIndex]!
      if (!isMidiSustainPedalDown(stateEvent.value)) return keyReleaseTick

      const nextPedalUpTick = timeline.nextPedalUpTickByIndex[stateEventIndex] ?? null
      return nextPedalUpTick !== null && nextPedalUpTick < sourceWindowEndTick
        ? nextPedalUpTick
        : sourceWindowEndTick
    },
  })
}
