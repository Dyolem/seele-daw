import type { Brand } from '@seele-daw/type-utils'
import { rejectDomainValue } from '#internal/model/domain-value-error'
import { parseOpaqueId } from '#internal/model/opaque-id'

export type ProjectId = Brand<string, 'ProjectId'>
export type TrackId = Brand<string, 'TrackId'>
export type ClipId = Brand<string, 'ClipId'>
export type MidiSourceId = Brand<string, 'MidiSourceId'>
export type NoteId = Brand<string, 'NoteId'>
export type DeviceId = Brand<string, 'DeviceId'>
export type TempoEventId = Brand<string, 'TempoEventId'>
export type TimeSignatureEventId = Brand<string, 'TimeSignatureEventId'>
export type DeviceTypeId = Brand<string, 'DeviceTypeId'>
export type ParameterId = Brand<string, 'ParameterId'>

const DEVICE_TYPE_ID_CONSTRAINT = 'a lowercase namespaced identifier such as seele.basic-synth'
const DEVICE_TYPE_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u

export function parseProjectId(value: unknown): ProjectId {
  return parseOpaqueId<ProjectId>(value, 'ProjectId')
}

export function parseTrackId(value: unknown): TrackId {
  return parseOpaqueId<TrackId>(value, 'TrackId')
}

export function parseClipId(value: unknown): ClipId {
  return parseOpaqueId<ClipId>(value, 'ClipId')
}

export function parseMidiSourceId(value: unknown): MidiSourceId {
  return parseOpaqueId<MidiSourceId>(value, 'MidiSourceId')
}

export function parseNoteId(value: unknown): NoteId {
  return parseOpaqueId<NoteId>(value, 'NoteId')
}

export function parseDeviceId(value: unknown): DeviceId {
  return parseOpaqueId<DeviceId>(value, 'DeviceId')
}

export function parseTempoEventId(value: unknown): TempoEventId {
  return parseOpaqueId<TempoEventId>(value, 'TempoEventId')
}

export function parseTimeSignatureEventId(value: unknown): TimeSignatureEventId {
  return parseOpaqueId<TimeSignatureEventId>(value, 'TimeSignatureEventId')
}

export function parseDeviceTypeId(value: unknown): DeviceTypeId {
  const typeId = parseOpaqueId<DeviceTypeId>(value, 'DeviceTypeId')

  if (!DEVICE_TYPE_ID_PATTERN.test(typeId)) {
    rejectDomainValue('DeviceTypeId', DEVICE_TYPE_ID_CONSTRAINT)
  }

  return typeId
}

export function parseParameterId(value: unknown): ParameterId {
  return parseOpaqueId<ParameterId>(value, 'ParameterId')
}
