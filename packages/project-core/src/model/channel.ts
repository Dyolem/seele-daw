import { rejectDomainValue } from './domain-value-error'
import { parseDeviceId, type DeviceId } from './ids'
import { parseBipolarValue, parseLinearGain, type BipolarValue, type LinearGain } from './scalars'

export interface ChannelStripDescriptor {
  readonly gain: LinearGain
  readonly pan: BipolarValue
  readonly muted: boolean
  readonly soloed: boolean
}

export interface MasterChannelRecord {
  readonly gain: LinearGain
  readonly muted: boolean
  readonly audioEffectIds: readonly DeviceId[]
}

export interface CreateChannelStripDescriptorInput {
  readonly gain: LinearGain
  readonly pan: BipolarValue
  readonly muted: boolean
  readonly soloed: boolean
}

export interface CreateMasterChannelRecordInput {
  readonly gain: LinearGain
  readonly muted: boolean
  readonly audioEffectIds: readonly DeviceId[]
}

function parseBoolean(value: unknown, valueName: string): boolean {
  if (typeof value !== 'boolean') {
    rejectDomainValue(valueName, 'a boolean')
  }

  return value
}

function copyUniqueAudioEffectIds(
  deviceIds: readonly DeviceId[],
  valueName: string,
): readonly DeviceId[] {
  const copiedDeviceIds = deviceIds.map((deviceId) => parseDeviceId(deviceId))

  if (new Set(copiedDeviceIds).size !== copiedDeviceIds.length) {
    rejectDomainValue(valueName, 'an ordered collection of unique DeviceId values')
  }

  return copiedDeviceIds
}

export function createChannelStripDescriptor(
  input: CreateChannelStripDescriptorInput,
): ChannelStripDescriptor {
  return {
    gain: parseLinearGain(input.gain),
    pan: parseBipolarValue(input.pan),
    muted: parseBoolean(input.muted, 'ChannelStrip.muted'),
    soloed: parseBoolean(input.soloed, 'ChannelStrip.soloed'),
  }
}

export function createMasterChannelRecord(
  input: CreateMasterChannelRecordInput,
): MasterChannelRecord {
  return {
    gain: parseLinearGain(input.gain),
    muted: parseBoolean(input.muted, 'MasterChannel.muted'),
    audioEffectIds: copyUniqueAudioEffectIds(input.audioEffectIds, 'MasterChannel.audioEffectIds'),
  }
}
