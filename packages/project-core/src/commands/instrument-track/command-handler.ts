import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type { AddInstrumentTrackCommand } from '#internal/commands/protocol/project-command'
import type { ReadyProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'

function assertTrackIdAvailable(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCommand,
): void {
  if (reader.getTrack(command.track.id) !== undefined) {
    throw new ProjectCommandError(
      'track-id-already-exists',
      `Track ID ${command.track.id} is already used in this project`,
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
        op: 'insert',
        table: 'devices',
        after: command.instrumentDevice,
      },
      {
        op: 'insert',
        table: 'tracks',
        after: command.track,
      },
      {
        op: 'insert',
        table: 'trackOrder',
        index: command.insertAt,
        trackId: command.track.id,
      },
    ]),
  }
}
