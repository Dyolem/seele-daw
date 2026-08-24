import type {
  AddTempoEventCommand,
  MoveTempoEventCommand,
  RemoveTempoEventCommand,
  ReplaceTempoEventBpmCommand,
} from '#internal/commands/protocol/project-command'
import { PROJECT_COMMAND_TYPE } from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/preparation/project-command-preparation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createTempoEventRecord, type TempoEventRecord } from '#internal/time/tempo-event'
import { ZERO_TICK, type Tick } from '#internal/time/tick'

function findTempoEventAtTick(
  reader: ModelStoreReader,
  tick: Tick,
  excludedTempoEventId: TempoEventRecord['id'] | null = null,
): TempoEventRecord | undefined {
  for (const [, tempoEvent] of reader.tempoEventEntries()) {
    if (tempoEvent.tick === tick && tempoEvent.id !== excludedTempoEventId) return tempoEvent
  }
  return undefined
}

function rejectOccupiedTempoEventTick(
  command: AddTempoEventCommand | MoveTempoEventCommand,
  blockingTempoEvent: TempoEventRecord,
): never {
  const tempoEventId =
    command.type === PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD
      ? command.tempoEvent.id
      : command.tempoEventId
  const tempoEventTick =
    command.type === PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD ? command.tempoEvent.tick : command.tick

  throw new ProjectCommandError(
    'tempo-event-tick-already-exists',
    `Tempo Event ${blockingTempoEvent.id} already occupies Tick ${tempoEventTick}`,
    {
      baseRevision: command.baseRevision,
      blockingTempoEventId: blockingTempoEvent.id,
      commandType: command.type,
      tempoEventId,
      tempoEventTick,
    },
  )
}

/** Prepares one new non-conflicting step Tempo Event with an exact removal inverse. */
export function prepareAddTempoEventCommand(
  reader: ModelStoreReader,
  command: AddTempoEventCommand,
): ReadyProjectCommandPreparation {
  const tempoEvent = command.tempoEvent
  if (reader.getTempoEvent(tempoEvent.id) !== undefined) {
    throw new ProjectCommandError(
      'tempo-event-id-already-exists',
      `Tempo Event ID ${tempoEvent.id} already exists`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: tempoEvent.id,
        tempoEventTick: tempoEvent.tick,
      },
    )
  }

  const blockingTempoEvent = findTempoEventAtTick(reader, tempoEvent.tick)
  if (blockingTempoEvent !== undefined) {
    rejectOccupiedTempoEventTick(command, blockingTempoEvent)
  }

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
        after: tempoEvent,
      },
    ]),
  }
}

/** Prepares an identity- and BPM-preserving move to one unoccupied Project Tick. */
export function prepareMoveTempoEventCommand(
  reader: ModelStoreReader,
  command: MoveTempoEventCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const before = reader.getTempoEvent(command.tempoEventId)
  if (before === undefined) {
    throw new ProjectCommandError(
      'tempo-event-not-found',
      `Tempo Event ${command.tempoEventId} does not exist`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: command.tempoEventId,
        tempoEventTick: command.tick,
      },
    )
  }

  if (before.tick === command.tick) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  if (before.tick === ZERO_TICK) {
    throw new ProjectCommandError(
      'initial-tempo-event-cannot-move',
      `Initial Tempo Event ${before.id} must remain at Tick 0`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: before.id,
        tempoEventTick: command.tick,
      },
    )
  }

  const blockingTempoEvent = findTempoEventAtTick(reader, command.tick, before.id)
  if (blockingTempoEvent !== undefined) {
    rejectOccupiedTempoEventTick(command, blockingTempoEvent)
  }

  const after = createTempoEventRecord({ ...before, tick: command.tick })
  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before,
        after,
      },
    ]),
  }
}

/** Prepares removal of one non-initial Tempo Event with an exact insertion inverse. */
export function prepareRemoveTempoEventCommand(
  reader: ModelStoreReader,
  command: RemoveTempoEventCommand,
): ReadyProjectCommandPreparation {
  const before = reader.getTempoEvent(command.tempoEventId)
  if (before === undefined) {
    throw new ProjectCommandError(
      'tempo-event-not-found',
      `Tempo Event ${command.tempoEventId} does not exist`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: command.tempoEventId,
      },
    )
  }

  if (before.tick === ZERO_TICK) {
    throw new ProjectCommandError(
      'initial-tempo-event-cannot-remove',
      `Initial Tempo Event ${before.id} cannot be removed`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: before.id,
        tempoEventTick: before.tick,
      },
    )
  }

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
        before,
      },
    ]),
  }
}

/** Prepares an identity- and position-preserving Tempo Event BPM replacement. */
export function prepareReplaceTempoEventBpmCommand(
  reader: ModelStoreReader,
  command: ReplaceTempoEventBpmCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const before = reader.getTempoEvent(command.tempoEventId)
  if (before === undefined) {
    throw new ProjectCommandError(
      'tempo-event-not-found',
      `Tempo Event ${command.tempoEventId} does not exist`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: command.tempoEventId,
      },
    )
  }

  if (before.bpm === command.bpm) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const after = createTempoEventRecord({ ...before, bpm: command.bpm })
  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before,
        after,
      },
    ]),
  }
}
