import type { Brand } from './brand'
import { rejectDomainValue } from './domain-value-error'

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

const OPAQUE_ID_CONSTRAINT =
  'a non-empty opaque string without surrounding whitespace or control characters'

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)

    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
}

function parseOpaqueId<Id extends string>(value: unknown, valueName: string): Id {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    containsControlCharacter(value)
  ) {
    rejectDomainValue(valueName, OPAQUE_ID_CONSTRAINT)
  }

  return value as Id
}

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
  return parseOpaqueId<DeviceTypeId>(value, 'DeviceTypeId')
}

export function parseParameterId(value: unknown): ParameterId {
  return parseOpaqueId<ParameterId>(value, 'ParameterId')
}
