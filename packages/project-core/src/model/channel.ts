import { rejectDomainValue } from './domain-value-error'
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
}

function parseBoolean(value: unknown, valueName: string): boolean {
  if (typeof value !== 'boolean') {
    rejectDomainValue(valueName, 'a boolean')
  }

  return value
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
  }
}
