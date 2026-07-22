/** Public API for the framework-agnostic project kernel. */
export {
  PROJECT_COMMAND_TYPE,
  createAddNoteCommand,
  createMoveNoteCommand,
  createRemoveNoteCommand,
} from './commands/project-command'
export type {
  AddNoteCommand,
  CreateAddNoteCommandInput,
  CreateMoveNoteCommandInput,
  CreateRemoveNoteCommandInput,
  MoveNoteCommand,
  ProjectCommand,
  ProjectCommandType,
  RemoveNoteCommand,
} from './commands/project-command'
export { ProjectCommandError } from './commands/project-command-error'
export type {
  ProjectCommandErrorCode,
  ProjectCommandErrorDetails,
} from './commands/project-command-error'

export { PROJECT_CHANGE_TYPE } from './commit/project-change'
export type {
  AffectedTickRange,
  MidiNoteAddedChange,
  MidiNoteRemovedChange,
  MidiNoteUpdatedChange,
  ProjectChange,
  ProjectChangeType,
} from './commit/project-change'
export { PROJECT_COMMIT_ORIGIN_KIND, PROJECT_HISTORY_DIRECTION } from './commit/project-commit'
export type {
  ProjectCommandCommitOrigin,
  ProjectCommit,
  ProjectCommitOrigin,
  ProjectCommitOriginKind,
  ProjectHistoryCommitOrigin,
  ProjectHistoryDirection,
} from './commit/project-commit'
export type { ProjectDelta } from './commit/project-delta'

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
export { ProjectQueryError } from './queries/project-query-error'
export type { ProjectQueryErrorCode, ProjectQueryErrorDetails } from './queries/project-query-error'

export {
  PROJECT_SUBSCRIPTION_TYPE,
  createAllProjectCommitsSubscription,
  createMidiNoteChangesSubscription,
} from './subscriptions/project-subscription'
export type {
  AllProjectCommitsSubscription,
  CreateMidiNoteChangesSubscriptionInput,
  MidiNoteChangesSubscription,
  ProjectSubscription,
  ProjectSubscriptionDeliveryFailure,
  ProjectSubscriptionObserver,
  ProjectSubscriptionType,
  ProjectUnsubscribe,
} from './subscriptions/project-subscription'
export { ProjectSubscriptionError } from './subscriptions/project-subscription-error'
export type {
  ProjectSubscriptionErrorCode,
  ProjectSubscriptionErrorDetails,
} from './subscriptions/project-subscription-error'

export type { MidiNotePartitionSnapshot, ProjectSnapshot } from './snapshots/project-snapshot'

export {
  PROJECT_CHECKPOINT_FORMAT_VERSION,
  createProjectCheckpoint,
  parseProjectCheckpointId,
} from './persistence/checkpoint/project-checkpoint'
export type {
  CreateProjectCheckpointInput,
  ProjectCheckpoint,
  ProjectCheckpointFormatVersion,
  ProjectCheckpointId,
} from './persistence/checkpoint/project-checkpoint'
export {
  restoreProjectCheckpoint,
  saveProjectCheckpoint,
} from './persistence/checkpoint/project-checkpoint-coordinator'
export type {
  ProjectCheckpointRestoreResult,
  ProjectCheckpointSaveReceipt,
  SaveProjectCheckpointInput,
} from './persistence/checkpoint/project-checkpoint-coordinator'
export { decodeProjectCheckpoint } from './persistence/checkpoint/project-checkpoint-decoder'
export {
  ProjectCheckpointOperationError,
  ProjectCheckpointValidationError,
} from './persistence/checkpoint/project-checkpoint-error'
export type {
  ProjectCheckpointCandidateFailure,
  ProjectCheckpointOperationErrorCode,
  ProjectCheckpointOperationErrorDetails,
  ProjectCheckpointValidationErrorCode,
  ProjectCheckpointValidationErrorDetails,
  ProjectCheckpointValidationPathSegment,
} from './persistence/checkpoint/project-checkpoint-error'
export type { ProjectCheckpointStore } from './persistence/checkpoint/project-checkpoint-store'

export { PROJECT_FILE_FORMAT_VERSION } from './persistence/project-file-dto'
export type {
  AudioTrackDTO,
  ChannelStripDTO,
  ClipDTO,
  DeviceDTO,
  InstrumentTrackDTO,
  MasterChannelDTO,
  MidiClipDTO,
  MidiLoopDTO,
  MidiNoteDTO,
  MidiSourceDTO,
  ProjectFileDTO,
  ProjectFileFormatVersion,
  TempoEventDTO,
  TimeSignatureEventDTO,
  TrackDTO,
} from './persistence/project-file-dto'
export { decodeProjectFileDTO } from './persistence/project-file-decoder'
export { ProjectFileLoadError } from './persistence/project-file-load-error'
export type {
  ProjectFileLoadErrorCode,
  ProjectFileLoadErrorDetails,
  ProjectFileLoadPathSegment,
} from './persistence/project-file-load-error'
export { createProjectSessionFromProjectFile } from './persistence/project-file-loader'
export { ProjectFileProjectionError } from './persistence/project-file-projection-error'
export type {
  ProjectFileProjectionErrorCode,
  ProjectFileProjectionErrorDetails,
} from './persistence/project-file-projection-error'
export { createProjectFileDTO } from './persistence/project-file-projector'
export { ProjectFileValidationError } from './persistence/project-file-validation-error'
export type {
  ProjectFileValidationErrorCode,
  ProjectFileValidationErrorDetails,
  ProjectFileValidationPathSegment,
} from './persistence/project-file-validation-error'

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
