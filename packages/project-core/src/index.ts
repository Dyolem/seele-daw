/** Public API for the framework-agnostic project kernel. */
export { DomainValueError } from './model/domain-value-error'

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

export { PROJECT_PPQ, ZERO_TICK, parsePositiveTick, parseTick } from './time/tick'
export type { Tick } from './time/tick'
