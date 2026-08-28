import {
  assertMidiSustainPedalEventIdAvailable,
  assertMidiSustainPedalEventPositionsAvailable,
  assertMidiSustainPedalEventWithinSource,
  type MidiSustainPedalEventCommandValidationContext,
} from '#internal/commands/midi-sustain-pedal-event/command-validation'
import type {
  AddMidiSustainPedalEventCommand,
  MoveMidiSustainPedalEventsCommand,
  RemoveMidiSustainPedalEventsCommand,
  ReplaceMidiSustainPedalEventValueCommand,
} from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/preparation/project-command-preparation'
import type { MidiSustainPedalEventId } from '#internal/model/ids'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import {
  createMidiSustainPedalEventRecord,
  type MidiSustainPedalEventRecord,
} from '#internal/model/midi-sustain-pedal-event'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectMutation } from '#internal/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { parseTick } from '#internal/time/tick'

type MidiSustainPedalEventCommand =
  | AddMidiSustainPedalEventCommand
  | MoveMidiSustainPedalEventsCommand
  | RemoveMidiSustainPedalEventsCommand
  | ReplaceMidiSustainPedalEventValueCommand

function commandEventId(command: MidiSustainPedalEventCommand): MidiSustainPedalEventId {
  if ('event' in command) return command.event.id
  if ('eventId' in command) return command.eventId
  return command.eventIds[0]!
}

function validationContext(
  command: MidiSustainPedalEventCommand,
  eventId: MidiSustainPedalEventId,
): MidiSustainPedalEventCommandValidationContext {
  return {
    baseRevision: command.baseRevision,
    commandType: command.type,
    eventId,
    sourceId: command.sourceId,
  }
}

function requireMidiSource(
  reader: ModelStoreReader,
  command: MidiSustainPedalEventCommand,
): MidiSourceRecord {
  const source = reader.getMidiSource(command.sourceId)

  if (source !== undefined) return source

  throw new ProjectCommandError(
    'midi-source-not-found',
    `MidiSource ${command.sourceId} does not exist`,
    {
      baseRevision: command.baseRevision,
      commandType: command.type,
      sourceId: command.sourceId,
      sustainPedalEventId: commandEventId(command),
    },
  )
}

function assertEventPartitionExists(
  reader: ModelStoreReader,
  command: MidiSustainPedalEventCommand,
): void {
  if (reader.hasMidiSustainPedalEventPartition(command.sourceId)) return

  throw new ProjectCommandError(
    'sustain-pedal-event-partition-missing',
    `MidiSource ${command.sourceId} does not have a MIDI Sustain Pedal Event partition`,
    {
      baseRevision: command.baseRevision,
      commandType: command.type,
      sourceId: command.sourceId,
      sustainPedalEventId: commandEventId(command),
    },
  )
}

function requireEvent(
  reader: ModelStoreReader,
  command:
    | MoveMidiSustainPedalEventsCommand
    | RemoveMidiSustainPedalEventsCommand
    | ReplaceMidiSustainPedalEventValueCommand,
  eventId: MidiSustainPedalEventId,
): MidiSustainPedalEventRecord {
  const event = reader.getMidiSustainPedalEvent(command.sourceId, eventId)

  if (event !== undefined) return event

  throw new ProjectCommandError(
    'sustain-pedal-event-not-found',
    `MIDI Sustain Pedal Event ${eventId} does not exist in MidiSource ${command.sourceId}`,
    {
      baseRevision: command.baseRevision,
      commandType: command.type,
      sourceId: command.sourceId,
      sustainPedalEventId: eventId,
    },
  )
}

function ready(
  command: MidiSustainPedalEventCommand,
  mutations: readonly ProjectMutation[],
): ReadyProjectCommandPreparation {
  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, mutations),
  }
}

export function prepareAddMidiSustainPedalEventCommand(
  reader: ModelStoreReader,
  command: AddMidiSustainPedalEventCommand,
): ReadyProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertEventPartitionExists(reader, command)
  const context = validationContext(command, command.event.id)

  assertMidiSustainPedalEventIdAvailable(reader, context)
  assertMidiSustainPedalEventWithinSource(context, source, command.event)
  assertMidiSustainPedalEventPositionsAvailable(reader, context, [command.event])

  return ready(command, [
    {
      type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.INSERT,
      sourceId: command.sourceId,
      after: command.event,
    },
  ])
}

function createMovedEvent(
  command: MoveMidiSustainPedalEventsCommand,
  before: MidiSustainPedalEventRecord,
): MidiSustainPedalEventRecord {
  const nextTick = before.tick + command.deltaTick

  if (!Number.isSafeInteger(nextTick) || nextTick < 0) {
    throw new ProjectCommandError(
      'sustain-pedal-event-out-of-source-range',
      `MIDI Sustain Pedal Event ${before.id} cannot move to Tick ${nextTick}`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        sourceId: command.sourceId,
        sustainPedalEventId: before.id,
        sustainPedalEventTick: nextTick,
      },
    )
  }

  return createMidiSustainPedalEventRecord({ ...before, tick: parseTick(nextTick) })
}

export function prepareMoveMidiSustainPedalEventsCommand(
  reader: ModelStoreReader,
  command: MoveMidiSustainPedalEventsCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertEventPartitionExists(reader, command)
  const events = command.eventIds.map((eventId) => requireEvent(reader, command, eventId))

  if (command.deltaTick === 0) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const movedEvents = events.map((event) => createMovedEvent(command, event))
  const ignoredEventIds = new Set(command.eventIds)

  for (const event of movedEvents) {
    assertMidiSustainPedalEventWithinSource(validationContext(command, event.id), source, event)
  }
  assertMidiSustainPedalEventPositionsAvailable(
    reader,
    validationContext(command, movedEvents[0]!.id),
    movedEvents,
    ignoredEventIds,
  )

  return ready(
    command,
    events.map<ProjectMutation>((before, index) => ({
      type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
      sourceId: command.sourceId,
      before,
      after: movedEvents[index]!,
    })),
  )
}

export function prepareRemoveMidiSustainPedalEventsCommand(
  reader: ModelStoreReader,
  command: RemoveMidiSustainPedalEventsCommand,
): ReadyProjectCommandPreparation {
  requireMidiSource(reader, command)
  assertEventPartitionExists(reader, command)

  return ready(
    command,
    command.eventIds.map<ProjectMutation>((eventId) => ({
      type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REMOVE,
      sourceId: command.sourceId,
      before: requireEvent(reader, command, eventId),
    })),
  )
}

export function prepareReplaceMidiSustainPedalEventValueCommand(
  reader: ModelStoreReader,
  command: ReplaceMidiSustainPedalEventValueCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  requireMidiSource(reader, command)
  assertEventPartitionExists(reader, command)
  const before = requireEvent(reader, command, command.eventId)

  if (before.value === command.value) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const after = createMidiSustainPedalEventRecord({ ...before, value: command.value })

  return ready(command, [
    {
      type: PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT.REPLACE,
      sourceId: command.sourceId,
      before,
      after,
    },
  ])
}
