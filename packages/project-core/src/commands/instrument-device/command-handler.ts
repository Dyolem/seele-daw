import type { ReplaceInstrumentDeviceCommand } from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/preparation/project-command-preparation'
import { deviceDescriptorsHaveSameValues, type DeviceDescriptor } from '#internal/model/device'
import type { ModelStoreReader } from '#internal/model/model-store'
import type { InstrumentTrackRecord } from '#internal/model/track'
import { createMutationPlan } from '#internal/mutation/mutation-plan'

function requireInstrumentTrack(
  reader: ModelStoreReader,
  command: ReplaceInstrumentDeviceCommand,
): InstrumentTrackRecord {
  const track = reader.getTrack(command.trackId)

  if (track === undefined) {
    throw new ProjectCommandError('track-not-found', `Track ${command.trackId} does not exist`)
  }

  return track
}

function requireCurrentInstrumentDevice(
  reader: ModelStoreReader,
  track: InstrumentTrackRecord,
  command: ReplaceInstrumentDeviceCommand,
): DeviceDescriptor {
  if (command.instrumentDevice.id !== track.instrumentDeviceId) {
    throw new ProjectCommandError(
      'instrument-device-id-mismatch',
      `Replacement Device ${command.instrumentDevice.id} does not preserve Instrument Track ${track.id} Device ID ${track.instrumentDeviceId}`,
    )
  }

  const currentDevice = reader.getDevice(track.instrumentDeviceId)

  if (currentDevice === undefined) {
    throw new ProjectCommandError(
      'device-not-found',
      `Instrument Device ${track.instrumentDeviceId} for Track ${track.id} does not exist`,
    )
  }

  return currentDevice
}

/** Prepares one identity-preserving Instrument Device fact replacement. */
export function prepareReplaceInstrumentDeviceCommand(
  reader: ModelStoreReader,
  command: ReplaceInstrumentDeviceCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const track = requireInstrumentTrack(reader, command)
  const before = requireCurrentInstrumentDevice(reader, track, command)

  if (deviceDescriptorsHaveSameValues(before, command.instrumentDevice)) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        op: 'replace',
        table: 'devices',
        before,
        after: command.instrumentDevice,
      },
    ]),
  }
}
