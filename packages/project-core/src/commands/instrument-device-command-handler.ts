import { ProjectCommandError } from '#internal/commands/project-command-error'
import type { ReplaceInstrumentDeviceCommand } from '#internal/commands/project-command'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/project-command-preparation'
import { deviceDescriptorsHaveSameValues, type DeviceDescriptor } from '#internal/model/device'
import type { ModelStoreReader } from '#internal/model/model-store'
import type { InstrumentTrackRecord } from '#internal/model/track'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'

function commandDetails(command: ReplaceInstrumentDeviceCommand) {
  return {
    baseRevision: command.baseRevision,
    commandType: command.type,
    deviceId: command.instrumentDevice.id,
    trackId: command.trackId,
  } as const
}

function requireInstrumentTrack(
  reader: ModelStoreReader,
  command: ReplaceInstrumentDeviceCommand,
): InstrumentTrackRecord {
  const track = reader.getTrack(command.trackId)

  if (track === undefined) {
    throw new ProjectCommandError(
      'track-not-found',
      `Track ${command.trackId} does not exist`,
      commandDetails(command),
    )
  }

  if (track.kind !== 'instrument') {
    throw new ProjectCommandError(
      'instrument-device-track-kind-mismatch',
      `Track ${command.trackId} is ${track.kind}, not instrument`,
      { ...commandDetails(command), trackKind: track.kind },
    )
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
      commandDetails(command),
    )
  }

  const currentDevice = reader.getDevice(track.instrumentDeviceId)

  if (currentDevice === undefined) {
    throw new ProjectCommandError(
      'device-not-found',
      `Instrument Device ${track.instrumentDeviceId} for Track ${track.id} does not exist`,
      commandDetails(command),
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
        type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
        trackId: track.id,
        before,
        after: command.instrumentDevice,
      },
    ]),
  }
}
