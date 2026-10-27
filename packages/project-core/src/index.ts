/** Public API for the framework-agnostic project kernel. */
export {
  PROJECT_COMMAND_TYPE,
  createAddTempoEventCommand,
  createAddInstrumentTrackCommand,
  createAddInstrumentTrackCollectionCommand,
  createAddMidiClipCommand,
  createAddMidiClipWithNoteCommand,
  createAddMidiSustainPedalEventCommand,
  createAddNoteCommand,
  createExtendMidiClipWithNoteCommand,
  createMoveNotesCommand,
  createMoveMidiSustainPedalEventsCommand,
  createMoveTempoEventCommand,
  createRemoveNotesCommand,
  createRemoveMidiSustainPedalEventsCommand,
  createRemoveTempoEventCommand,
  createReplaceInstrumentDeviceCommand,
  createReplaceMidiSustainPedalEventValueCommand,
  createReplaceTempoEventBpmCommand,
  createResizeNoteCommand,
} from './commands/protocol/project-command'
export type {
  AddTempoEventCommand,
  AddInstrumentTrackCommand,
  AddInstrumentTrackCollectionCommand,
  AddMidiClipCommand,
  AddMidiClipWithNoteCommand,
  AddNoteCommand,
  AddMidiSustainPedalEventCommand,
  CreateAddInstrumentTrackCommandInput,
  CreateAddInstrumentTrackCollectionCommandInput,
  CreateAddMidiClipCommandInput,
  CreateAddMidiClipWithNoteCommandInput,
  CreateAddNoteCommandInput,
  CreateAddMidiSustainPedalEventCommandInput,
  CreateAddTempoEventCommandInput,
  CreateExtendMidiClipWithNoteCommandInput,
  CreateMoveNotesCommandInput,
  CreateMoveMidiSustainPedalEventsCommandInput,
  CreateMoveTempoEventCommandInput,
  CreateRemoveNotesCommandInput,
  CreateRemoveMidiSustainPedalEventsCommandInput,
  CreateRemoveTempoEventCommandInput,
  CreateReplaceInstrumentDeviceCommandInput,
  CreateReplaceMidiSustainPedalEventValueCommandInput,
  CreateReplaceTempoEventBpmCommandInput,
  CreateResizeNoteCommandInput,
  ExtendMidiClipWithNoteCommand,
  InstrumentTrackCollectionClip,
  InstrumentTrackCollectionEntry,
  MoveNotesCommand,
  MoveMidiSustainPedalEventsCommand,
  MoveTempoEventCommand,
  ProjectCommand,
  ProjectCommandType,
  RemoveNotesCommand,
  RemoveMidiSustainPedalEventsCommand,
  RemoveTempoEventCommand,
  ReplaceInstrumentDeviceCommand,
  ReplaceMidiSustainPedalEventValueCommand,
  ReplaceTempoEventBpmCommand,
  ResizeNoteCommand,
} from './commands/protocol/project-command'
export { ProjectCommandError } from './commands/protocol/project-command-error'
export type { ProjectCommandErrorCode } from './commands/protocol/project-command-error'

export type {
  MasterReplacement,
  PartitionChange,
  PartitionRecordChange,
  ProjectChange,
  ProjectReplacement,
  RecordChange,
  TrackOrderChange,
} from './mutation/project-change'
export type {
  PartitionedRecordOf,
  PartitionedTableName,
  RecordOf,
  RecordTableName,
} from './model/model-tables'
export { PROJECT_COMMIT_ORIGIN_KIND, PROJECT_HISTORY_DIRECTION } from './commit/project-commit'
export type {
  ProjectCommandCommitOrigin,
  ProjectCommit,
  ProjectCommitOrigin,
  ProjectCommitOriginKind,
  ProjectHistoryCommitOrigin,
  ProjectHistoryDirection,
} from './commit/project-commit'

export {
  PROJECT_QUERY_TYPE,
  createMidiNoteByIdQuery,
  createMidiNotesIntersectingRangeQuery,
} from './queries/project-query'
export type {
  CreateMidiNoteByIdQueryInput,
  CreateMidiNotesIntersectingRangeQueryInput,
  MidiNoteByIdQuery,
  MidiNoteByIdQueryResult,
  MidiNotesIntersectingRangeQuery,
  MidiNotesIntersectingRangeQueryResult,
  ProjectQuery,
  ProjectQueryResult,
  ProjectQueryResultFor,
  ProjectQueryType,
} from './queries/project-query'

export {
  PROJECT_SUBSCRIPTION_TYPE,
  createAllProjectCommitsSubscription,
  createMidiNoteChangesSubscription,
} from './subscriptions/project-subscription'
export type {
  AffectedTickRange,
  AllProjectCommitsSubscription,
  CreateMidiNoteChangesSubscriptionInput,
  MidiNoteChangesSubscription,
  ProjectCommitListener,
  ProjectSubscription,
  ProjectSubscriptionType,
  ProjectUnsubscribe,
} from './subscriptions/project-subscription'
export { reportListenerError } from './subscriptions/report-listener-error'

export type {
  MidiSourcePartitions,
  ProjectSnapshot,
  ProjectTables,
} from './snapshots/project-snapshot'
export { diffSnapshotRecords } from './snapshots/snapshot-record-changes'
export type { SnapshotRecordChanges } from './snapshots/snapshot-record-changes'

export {
  PROJECT_CHECKPOINT_FORMAT_VERSION,
  createProjectCheckpoint,
  decodeProjectCheckpoint,
  parseProjectCheckpointId,
} from './persistence/checkpoint/project-checkpoint'
export type {
  CreateProjectCheckpointInput,
  ProjectCheckpoint,
  ProjectCheckpointFormatVersion,
  ProjectCheckpointId,
  ProjectCheckpointStore,
} from './persistence/checkpoint/project-checkpoint'
export {
  restoreProjectCheckpoint,
  saveProjectCheckpoint,
} from './persistence/checkpoint/project-checkpoint-coordinator'
export type {
  ProjectCheckpointCandidateFailure,
  ProjectCheckpointRestoreResult,
  ProjectCheckpointSaveReceipt,
  SaveProjectCheckpointInput,
} from './persistence/checkpoint/project-checkpoint-coordinator'

export {
  PROJECT_FILE_FORMAT_VERSION,
  createProjectFile,
  decodeProjectFile,
} from './persistence/project-file'
export type { ProjectFile } from './persistence/project-file'
export { ProjectFileError } from './persistence/project-file-error'
export { createProjectSessionFromProjectFile } from './persistence/project-file-loader'

export { PROJECT_COMMAND_EXECUTION_STATUS } from './session/project-command-execution'
export type {
  CommittedProjectCommandExecution,
  NoChangeProjectCommandExecution,
  ProjectCommandExecutionResult,
  ProjectCommandExecutionStatus,
} from './session/project-command-execution'
export { createInitialProjectSession } from './session/project-session'
export type { CreateInitialProjectSessionInput, ProjectSession } from './session/project-session'
export type { ProjectContentStateId } from './session/project-content-state-id'

export { createChannelStripDescriptor, createMasterChannelRecord } from './model/channel'
export type {
  ChannelStripDescriptor,
  CreateChannelStripDescriptorInput,
  CreateMasterChannelRecordInput,
  MasterChannelRecord,
} from './model/channel'

export { DomainValueError } from './model/domain-value-error'

export { DEVICE_DEFINITION_VERSION_MIN, createDeviceDescriptor } from './model/device'
export type { CreateDeviceDescriptorInput, DeviceDescriptor } from './model/device'

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

export {
  MIDI_SUSTAIN_PEDAL_CONTROLLER_NUMBER,
  MIDI_SUSTAIN_PEDAL_DOWN_VALUE_MIN,
  createMidiSustainPedalEventRecord,
  isMidiSustainPedalDown,
} from './model/midi-sustain-pedal-event'
export type {
  CreateMidiSustainPedalEventRecordInput,
  MidiSustainPedalEventAddress,
  MidiSustainPedalEventRecord,
} from './model/midi-sustain-pedal-event'

export { createProjectRecord } from './model/project'
export type { CreateProjectRecordInput, ProjectRecord } from './model/project'

export type { ModelRevision } from './model/model-revision'

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
  parseMidiSustainPedalEventId,
  parseNoteId,
  parseParameterId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
} from './model/ids'

export { parseJsonValue } from './model/json-value'
export type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from './model/json-value'
export type {
  ClipId,
  DeviceId,
  DeviceTypeId,
  MidiSourceId,
  MidiSustainPedalEventId,
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
  MIDI_CONTROL_VALUE_MAX,
  MIDI_CONTROL_VALUE_MIN,
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  MIDI_VELOCITY_MAX,
  MIDI_VELOCITY_MIN,
  parseBipolarValue,
  parseEntityName,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiVelocity,
  parseProjectColor,
} from './model/scalars'
export type {
  BipolarValue,
  LinearGain,
  MidiChannel,
  MidiControlValue,
  MidiPitch,
  MidiPitchDelta,
  MidiVelocity,
  ProjectColor,
} from './model/scalars'

export {
  PROJECT_PPQ,
  ZERO_TICK,
  addTicks,
  parsePositiveTick,
  parseTick,
  parseTickDelta,
} from './time/tick'
export type { Tick, TickDelta } from './time/tick'

export {
  TEMPO_BPM_MAX,
  TEMPO_BPM_MIN,
  createTempoEventRecord,
  parseTempoBpm,
} from './time/tempo-event'
export type { CreateTempoEventRecordInput, TempoBpm, TempoEventRecord } from './time/tempo-event'

export {
  TIME_SIGNATURE_DENOMINATORS,
  TIME_SIGNATURE_NUMERATOR_MAX,
  TIME_SIGNATURE_NUMERATOR_MIN,
  createTimeSignatureEventRecord,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
} from './time/time-signature-event'
export type {
  CreateTimeSignatureEventRecordInput,
  TimeSignatureDenominator,
  TimeSignatureEventRecord,
  TimeSignatureNumerator,
} from './time/time-signature-event'
