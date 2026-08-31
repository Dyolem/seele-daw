import {
  isMidiSustainPedalDown,
  parseTick,
  type MidiChannel,
  type MidiSustainPedalEventRecord,
  type Tick,
} from '@seele-daw/project-core'

import { AudibleMidiCompilerError } from '#internal/compiler/audible-midi-compiler-error'

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

function compareEvents(
  left: MidiSustainPedalEventRecord,
  right: MidiSustainPedalEventRecord,
): number {
  if (left.tick !== right.tick) return left.tick - right.tick
  if (left.channel !== right.channel) return left.channel - right.channel
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
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
 * applied before Note Off, matching the package's deterministic continuous-event ordering.
 */
export function createSustainPedalReleaseResolver(
  inputEvents: readonly MidiSustainPedalEventRecord[],
): SustainPedalReleaseResolver {
  const events = [...inputEvents].sort(compareEvents)
  const eventsByChannel = new Map<MidiChannel, MidiSustainPedalEventRecord[]>()
  let previous: MidiSustainPedalEventRecord | null = null

  for (const event of events) {
    if (previous !== null && previous.channel === event.channel && previous.tick === event.tick) {
      throw new AudibleMidiCompilerError(
        'duplicate-snapshot-entity',
        `midi-sustain-pedal-position:${event.channel}:${event.tick}`,
        `Project Snapshot repeats MIDI Sustain Pedal Channel ${event.channel} at Tick ${event.tick}`,
      )
    }
    const channelEvents = eventsByChannel.get(event.channel) ?? []
    channelEvents.push(event)
    eventsByChannel.set(event.channel, channelEvents)
    previous = event
  }

  const timelines = new Map<MidiChannel, SustainPedalChannelTimeline>()
  for (const [channel, channelEvents] of eventsByChannel) {
    timelines.set(channel, createChannelTimeline(channelEvents))
  }

  return Object.freeze({
    resolveFinalReleaseTick(
      channel: MidiChannel,
      keyReleaseTickInput: Tick,
      sourceWindowEndTickInput: Tick,
    ): Tick {
      const keyReleaseTick = parseTick(keyReleaseTickInput)
      const sourceWindowEndTick = parseTick(sourceWindowEndTickInput)
      if (keyReleaseTick > sourceWindowEndTick) {
        throw new AudibleMidiCompilerError(
          'invalid-snapshot-reference',
          `midi-sustain-pedal-release:${channel}:${keyReleaseTick}`,
          'A MIDI Note key release cannot follow its Clip source-window end',
        )
      }
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
