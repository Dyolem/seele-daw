import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type { ProjectCommandType } from '#internal/commands/protocol/project-command'
import type { MidiSourceId, MidiSustainPedalEventId } from '#internal/model/ids'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { MidiSustainPedalEventRecord } from '#internal/model/midi-sustain-pedal-event'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'

export interface MidiSustainPedalEventCommandValidationContext {
  readonly baseRevision: ModelRevision
  readonly commandType: ProjectCommandType
  readonly eventId: MidiSustainPedalEventId
  readonly sourceId: MidiSourceId
}

export function assertMidiSustainPedalEventIdAvailable(
  reader: ModelStoreReader,
  context: MidiSustainPedalEventCommandValidationContext,
): void {
  for (const sourceId of reader.midiSustainPedalEventPartitionIds()) {
    if (reader.getMidiSustainPedalEvent(sourceId, context.eventId) === undefined) continue

    throw new ProjectCommandError(
      'sustain-pedal-event-id-already-exists',
      `MIDI Sustain Pedal Event ID ${context.eventId} is already used in this project`,
      { ...context, sustainPedalEventId: context.eventId },
    )
  }
}

export function assertMidiSustainPedalEventWithinSource(
  context: MidiSustainPedalEventCommandValidationContext,
  source: MidiSourceRecord,
  event: MidiSustainPedalEventRecord,
): void {
  if (event.tick <= source.lengthTick) return

  throw new ProjectCommandError(
    'sustain-pedal-event-out-of-source-range',
    `MIDI Sustain Pedal Event ${event.id} occurs at Tick ${event.tick}, beyond MidiSource ${source.id} length ${source.lengthTick}`,
    {
      ...context,
      sourceLengthTick: source.lengthTick,
      sustainPedalEventTick: event.tick,
    },
  )
}

export function assertMidiSustainPedalEventPositionsAvailable(
  reader: ModelStoreReader,
  context: MidiSustainPedalEventCommandValidationContext,
  candidates: readonly MidiSustainPedalEventRecord[],
  ignoredEventIds: ReadonlySet<MidiSustainPedalEventId> = new Set(),
): void {
  const eventByPosition = new Map<string, MidiSustainPedalEventRecord>()

  for (const [, event] of reader.midiSustainPedalEventEntries(context.sourceId)) {
    if (ignoredEventIds.has(event.id)) continue
    eventByPosition.set(`${event.tick}\u0000${event.channel}`, event)
  }

  for (const event of candidates) {
    const position = `${event.tick}\u0000${event.channel}`
    const blockingEvent = eventByPosition.get(position)

    if (blockingEvent !== undefined) {
      throw new ProjectCommandError(
        'sustain-pedal-event-tick-channel-already-exists',
        `MIDI Sustain Pedal Event ${blockingEvent.id} already occupies Tick ${event.tick} and Channel ${event.channel} in MidiSource ${context.sourceId}`,
        {
          ...context,
          blockingSustainPedalEventId: blockingEvent.id,
          sustainPedalEventChannel: event.channel,
          sustainPedalEventId: event.id,
          sustainPedalEventTick: event.tick,
        },
      )
    }

    eventByPosition.set(position, event)
  }
}
