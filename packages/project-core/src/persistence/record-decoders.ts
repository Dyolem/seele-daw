import {
  createMasterChannelRecord,
  type ChannelStripDescriptor,
  type MasterChannelRecord,
} from '#internal/model/channel'
import { createDeviceDescriptor, type DeviceDescriptor } from '#internal/model/device'
import {
  createMidiClipRecord,
  type ClipRecord,
  type MidiClipRecord,
} from '#internal/model/midi-clip'
import { createMidiNoteRecord, type MidiNoteRecord } from '#internal/model/midi-note'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import {
  createMidiSustainPedalEventRecord,
  type MidiSustainPedalEventRecord,
} from '#internal/model/midi-sustain-pedal-event'
import type {
  PartitionedRecordOf,
  PartitionedTableName,
  RecordOf,
  RecordTableName,
} from '#internal/model/model-tables'
import { createProjectRecord, type ProjectRecord } from '#internal/model/project'
import { createInstrumentTrackRecord, type TrackRecord } from '#internal/model/track'
import { createTempoEventRecord, type TempoEventRecord } from '#internal/model/tempo-event'
import {
  createTimeSignatureEventRecord,
  type TimeSignatureEventRecord,
} from '#internal/model/time-signature-event'
import { readFields, type DataPath, type Fields } from './stored-data'

/**
 * Turns one stored value into a record. Decoders check structure (fields, arrays, nested
 * objects); the record factory validates every value.
 */
export type RecordDecoder<RecordType> = (value: unknown, path: DataPath) => RecordType

const PROJECT: Fields<ProjectRecord> = { id: true, name: true }
const MASTER: Fields<MasterChannelRecord> = { gain: true, muted: true }
const CHANNEL_STRIP: Fields<ChannelStripDescriptor> = {
  gain: true,
  pan: true,
  muted: true,
  soloed: true,
}
const TRACK: Fields<TrackRecord> = {
  id: true,
  name: true,
  color: true,
  channel: true,
  instrumentDeviceId: true,
}
const MIDI_CLIP: Fields<MidiClipRecord> = {
  id: true,
  trackId: true,
  name: true,
  color: true,
  muted: true,
  startTick: true,
  spanTick: true,
  sourceId: true,
  sourceOffsetTick: true,
}
const MIDI_SOURCE: Fields<MidiSourceRecord> = { id: true, lengthTick: true }
const TEMPO_EVENT: Fields<TempoEventRecord> = { id: true, tick: true, bpm: true }
const TIME_SIGNATURE_EVENT: Fields<TimeSignatureEventRecord> = {
  id: true,
  tick: true,
  numerator: true,
  denominator: true,
}
const DEVICE: Fields<DeviceDescriptor> = {
  id: true,
  typeId: true,
  definitionVersion: true,
  enabled: true,
  parameters: true,
  opaqueState: true,
}
const MIDI_NOTE: Fields<MidiNoteRecord> = {
  id: true,
  startTick: true,
  durationTick: true,
  pitch: true,
  velocity: true,
  channel: true,
}
const MIDI_SUSTAIN_PEDAL_EVENT: Fields<MidiSustainPedalEventRecord> = {
  id: true,
  tick: true,
  value: true,
  channel: true,
}

export const decodeProject: RecordDecoder<ProjectRecord> = (value, path) =>
  createProjectRecord(readFields(value, PROJECT, path))

export const decodeMaster: RecordDecoder<MasterChannelRecord> = (value, path) =>
  createMasterChannelRecord(readFields(value, MASTER, path))

function decodeTrack(value: unknown, path: DataPath): TrackRecord {
  const track = readFields(value, TRACK, path)
  return createInstrumentTrackRecord({
    ...track,
    channel: readFields(track.channel, CHANNEL_STRIP, [...path, 'channel']),
  })
}

function decodeClip(value: unknown, path: DataPath): ClipRecord {
  return createMidiClipRecord(readFields(value, MIDI_CLIP, path))
}

/** One decoder per table; a table without one does not compile. */
export const RECORD_DECODERS: {
  readonly [Name in RecordTableName]: RecordDecoder<RecordOf<Name>>
} = {
  tracks: decodeTrack,
  clips: decodeClip,
  midiSources: (value, path) => createMidiSourceRecord(readFields(value, MIDI_SOURCE, path)),
  tempoEvents: (value, path) => createTempoEventRecord(readFields(value, TEMPO_EVENT, path)),
  timeSignatureEvents: (value, path) =>
    createTimeSignatureEventRecord(readFields(value, TIME_SIGNATURE_EVENT, path)),
  devices: (value, path) => createDeviceDescriptor(readFields(value, DEVICE, path)),
}

export const PARTITIONED_RECORD_DECODERS: {
  readonly [Name in PartitionedTableName]: RecordDecoder<PartitionedRecordOf<Name>>
} = {
  midiNotes: (value, path) => createMidiNoteRecord(readFields(value, MIDI_NOTE, path)),
  midiSustainPedalEvents: (value, path) =>
    createMidiSustainPedalEventRecord(readFields(value, MIDI_SUSTAIN_PEDAL_EVENT, path)),
}
