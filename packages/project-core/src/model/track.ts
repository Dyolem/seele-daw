import { createChannelStripDescriptor, type ChannelStripDescriptor } from './channel'
import { parseDeviceId, parseTrackId, type DeviceId, type TrackId } from './ids'
import { parseEntityName, parseProjectColor, type ProjectColor } from './scalars'

/** A Track plays its MIDI Clips through its instrument Device and Channel into the Master. */
export interface InstrumentTrackRecord {
  readonly id: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: ChannelStripDescriptor
  readonly instrumentDeviceId: DeviceId
}

/** Every Track is an Instrument Track until Audio Tracks exist. */
export type TrackRecord = InstrumentTrackRecord

export interface CreateInstrumentTrackRecordInput {
  readonly id: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: ChannelStripDescriptor
  readonly instrumentDeviceId: DeviceId
}

export function createInstrumentTrackRecord(
  input: CreateInstrumentTrackRecordInput,
): InstrumentTrackRecord {
  return {
    id: parseTrackId(input.id),
    name: parseEntityName(input.name),
    color: input.color === null ? null : parseProjectColor(input.color),
    channel: createChannelStripDescriptor(input.channel),
    instrumentDeviceId: parseDeviceId(input.instrumentDeviceId),
  }
}
