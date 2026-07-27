import type { AddInstrumentTrackCommand } from '#internal/commands/project-command'
import { ProjectCommandError } from '#internal/commands/project-command-error'
import type { ReadyProjectCommandPreparation } from '#internal/commands/project-command-preparation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'

function commandDetails(command: AddInstrumentTrackCommand) {
  return {
    baseRevision: command.baseRevision,
    commandType: command.type,
    deviceId: command.instrumentDevice.id,
    insertAt: command.insertAt,
    trackId: command.track.id,
  } as const
}

function assertTrackIdAvailable(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCommand,
): void {
  if (reader.getTrack(command.track.id) !== undefined) {
    throw new ProjectCommandError(
      'track-id-already-exists',
      `Track ID ${command.track.id} is already used in this project`,
      commandDetails(command),
    )
  }
}

function assertDeviceIdAvailable(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCommand,
): void {
  if (reader.getDevice(command.instrumentDevice.id) !== undefined) {
    throw new ProjectCommandError(
      'device-id-already-exists',
      `Device ID ${command.instrumentDevice.id} is already used in this project`,
      commandDetails(command),
    )
  }
}

function requireTrackOrderLength(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCommand,
): number {
  const trackOrderLength = Array.from(reader.orderedTrackIds()).length

  if (command.insertAt > trackOrderLength) {
    throw new ProjectCommandError(
      'track-order-index-out-of-bounds',
      `Cannot insert Track ${command.track.id} at index ${command.insertAt} for Track Order length ${trackOrderLength}`,
      { ...commandDetails(command), trackOrderLength },
    )
  }

  return trackOrderLength
}

/** Prepares the complete graph insertion without acquiring authoritative write access. */
export function prepareAddInstrumentTrackCommand(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCommand,
): ReadyProjectCommandPreparation {
  assertTrackIdAvailable(reader, command)
  assertDeviceIdAvailable(reader, command)
  requireTrackOrderLength(reader, command)

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.INSERT,
        after: command.instrumentDevice,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.INSERT,
        after: command.track,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
        index: command.insertAt,
        trackId: command.track.id,
      },
    ]),
  }
}
