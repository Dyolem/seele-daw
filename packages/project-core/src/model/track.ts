import { createChannelStripDescriptor, type ChannelStripDescriptor } from './channel'
import { rejectDomainValue } from './domain-value-error'
import { parseDeviceId, parseTrackId, type DeviceId, type TrackId } from './ids'
import { parseEntityName, parseProjectColor, type ProjectColor } from './scalars'

export interface TrackBase {
  readonly id: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: ChannelStripDescriptor
  readonly audioEffectIds: readonly DeviceId[]
}

export interface InstrumentTrackRecord extends TrackBase {
  readonly kind: 'instrument'
  readonly midiEffectIds: readonly DeviceId[]
  readonly instrumentDeviceId: DeviceId
}

export interface AudioTrackRecord extends TrackBase {
  readonly kind: 'audio'
}

export type TrackRecord = InstrumentTrackRecord | AudioTrackRecord

export interface CreateTrackBaseInput {
  readonly id: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: ChannelStripDescriptor
  readonly audioEffectIds: readonly DeviceId[]
}

export interface CreateInstrumentTrackRecordInput extends CreateTrackBaseInput {
  readonly midiEffectIds: readonly DeviceId[]
  readonly instrumentDeviceId: DeviceId
}

export type CreateAudioTrackRecordInput = CreateTrackBaseInput

function copyDeviceIds(deviceIds: readonly DeviceId[]): readonly DeviceId[] {
  return deviceIds.map((deviceId) => parseDeviceId(deviceId))
}

function rejectDuplicateDeviceIds(deviceIds: readonly DeviceId[], valueName: string): void {
  if (new Set(deviceIds).size !== deviceIds.length) {
    rejectDomainValue(valueName, 'a topology in which each DeviceId appears exactly once')
  }
}

function createTrackBase(input: CreateTrackBaseInput): TrackBase {
  const audioEffectIds = copyDeviceIds(input.audioEffectIds)

  rejectDuplicateDeviceIds(audioEffectIds, 'Track.audioEffectIds')

  return {
    id: parseTrackId(input.id),
    name: parseEntityName(input.name),
    color: input.color === null ? null : parseProjectColor(input.color),
    channel: createChannelStripDescriptor(input.channel),
    audioEffectIds,
  }
}

export function createInstrumentTrackRecord(
  input: CreateInstrumentTrackRecordInput,
): InstrumentTrackRecord {
  const base = createTrackBase(input)
  const midiEffectIds = copyDeviceIds(input.midiEffectIds)
  const instrumentDeviceId = parseDeviceId(input.instrumentDeviceId)

  rejectDuplicateDeviceIds(
    [...midiEffectIds, instrumentDeviceId, ...base.audioEffectIds],
    'InstrumentTrack.deviceIds',
  )

  return {
    ...base,
    kind: 'instrument',
    midiEffectIds,
    instrumentDeviceId,
  }
}

export function createAudioTrackRecord(input: CreateAudioTrackRecordInput): AudioTrackRecord {
  return {
    ...createTrackBase(input),
    kind: 'audio',
  }
}
