/** Public API for the framework-agnostic project kernel. */
export { createChannelStripDescriptor, createMasterChannelRecord } from './model/channel'
export type {
  ChannelStripDescriptor,
  CreateChannelStripDescriptorInput,
  CreateMasterChannelRecordInput,
  MasterChannelRecord,
} from './model/channel'

export { DomainValueError } from './model/domain-value-error'

export { createMidiClipRecord, createMidiLoop } from './model/midi-clip'
export type {
  ClipBase,
  ClipRecord,
  CreateMidiClipRecordInput,
  CreateMidiLoopInput,
  MidiClipRecord,
  MidiLoop,
} from './model/midi-clip'

export { createMidiNoteRecord } from './model/midi-note'
export type { CreateMidiNoteRecordInput, MidiNoteAddress, MidiNoteRecord } from './model/midi-note'

export { createMidiSourceRecord } from './model/midi-source'
export type { CreateMidiSourceRecordInput, MidiSourceRecord } from './model/midi-source'

export { createProjectRecord } from './model/project'
export type { CreateProjectRecordInput, ProjectRecord } from './model/project'

export { createAudioTrackRecord, createInstrumentTrackRecord } from './model/track'
export type {
  AudioTrackRecord,
  CreateAudioTrackRecordInput,
  CreateInstrumentTrackRecordInput,
  CreateTrackBaseInput,
  InstrumentTrackRecord,
  TrackBase,
  TrackRecord,
} from './model/track'

export {
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseMidiSourceId,
  parseNoteId,
  parseParameterId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
} from './model/ids'
export type {
  ClipId,
  DeviceId,
  DeviceTypeId,
  MidiSourceId,
  NoteId,
  ParameterId,
  ProjectId,
  TempoEventId,
  TimeSignatureEventId,
  TrackId,
} from './model/ids'

export {
  BIPOLAR_VALUE_MAX,
  BIPOLAR_VALUE_MIN,
  LINEAR_GAIN_MAX,
  LINEAR_GAIN_MIN,
  MAX_ENTITY_NAME_LENGTH,
  MIDI_CHANNEL_MAX,
  MIDI_CHANNEL_MIN,
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  MIDI_VELOCITY_MAX,
  MIDI_VELOCITY_MIN,
  parseBipolarValue,
  parseEntityName,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseProjectColor,
} from './model/scalars'
export type {
  BipolarValue,
  LinearGain,
  MidiChannel,
  MidiPitch,
  MidiVelocity,
  ProjectColor,
} from './model/scalars'

export { PROJECT_PPQ, ZERO_TICK, addTicks, parsePositiveTick, parseTick } from './time/tick'
export type { Tick } from './time/tick'
