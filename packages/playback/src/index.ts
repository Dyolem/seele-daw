/** Public API for playback compilation, time projection, transport, and scheduler contracts. */
export { compileAudibleMidiProject } from './compiler/audible-midi-compiler'
export { AUDIBLE_MIDI_PLAN_STATUS } from './compiler/audible-midi-plan'
export type {
  AudibleMidiPlanStatus,
  AudibleMidiProjectPlan,
  MasterChannelPlan,
  MidiNoteSpanPlan,
  NoteOccurrenceKey,
  PlaybackDiagnostic,
  PlaybackDiagnosticCode,
  TrackPlaybackPlan,
} from './compiler/audible-midi-plan'
export { PLAYBACK_PHASE, PlaybackEngineError, createPlaybackEngine } from './engine/playback-engine'
export type {
  PlaybackEngine,
  PlaybackEngineDependencies,
  PlaybackEngineErrorCode,
  PlaybackEngineState,
  PlaybackLocateSession,
  PlaybackPhase,
  PlaybackVisualPosition,
} from './engine/playback-engine'
export { PLAYBACK_INSTRUMENT_FAILURE_MODE } from './engine/playback-runtime'
export type {
  InstrumentPreparationFailure,
  PlaybackAbortSignal,
  PlaybackInstrumentFailureMode,
  PlaybackPreparationOptions,
  PlaybackRuntimePort,
  PlaybackTimerPort,
  PlaybackVoiceHandle,
  PreparedPlaybackRuntime,
  UnsupportedNoteOccurrence,
} from './engine/playback-runtime'
export {
  AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND,
  AUDIBLE_MIDI_RECONCILIATION_REASON,
  AUDIBLE_MIDI_RECONCILIATION_SCOPE,
  AUDIBLE_MIDI_TRACK_CHANGE_KIND,
  AudibleMidiReconciliationError,
  createAudibleMidiReconciliationPlan,
} from './reconciliation/audible-midi-reconciliation'
export type {
  AudibleMidiOccurrenceChange,
  AudibleMidiOccurrenceChangeKind,
  AudibleMidiOccurrenceField,
  AudibleMidiReconciliationPlan,
  AudibleMidiReconciliationReason,
  AudibleMidiReconciliationScope,
  AudibleMidiTrackChange,
  AudibleMidiTrackChangeKind,
  AudibleMidiTrackField,
  CreateAudibleMidiReconciliationPlanInput,
} from './reconciliation/audible-midi-reconciliation'
export {
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  createAudibleMidiSchedulerPlanner,
} from './scheduler/audible-midi-scheduler'
export type {
  AudibleMidiScheduleBatch,
  AudibleMidiSchedulerConfiguration,
  AudibleMidiSchedulerPlanner,
  ScheduledSampleVoicePlan,
} from './scheduler/audible-midi-scheduler'
export {
  SAMPLE_INSTRUMENT_DEVICE_DEFINITION,
  createSampleInstrumentDeviceDescriptor,
  decodeSampleInstrumentDeviceState,
  parseSoundbankId,
} from './sample-instrument-device'
export type { SampleInstrumentDeviceState, SoundbankId } from './sample-instrument-device'
export {
  STUDIO_GRAND_DEVICE_DEFINITION,
  STUDIO_GRAND_SOUNDBANK_ID,
  createStudioGrandDeviceDescriptor,
  decodeStudioGrandDeviceState,
} from './studio-grand-device'
export type { StudioGrandDeviceState } from './studio-grand-device'
export { resolveProjectSecondAtTick } from './time/tempo-map'
export { parsePlaybackClockDurationSecond, parsePlaybackClockSecond } from './time/project-time'
export type {
  PlaybackClockDurationSecond,
  PlaybackClockSecond,
  ProjectSecond,
} from './time/project-time'
export {
  AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
  AUDIBLE_MIDI_TIMELINE_TAIL_BAR_COUNT,
  AudibleMidiTimelineError,
  deriveAudibleMidiTimelineRange,
} from './timeline/audible-midi-timeline'
export type {
  AudibleMidiTimelineErrorCode,
  AudibleMidiTimelineRange,
} from './timeline/audible-midi-timeline'
export {
  AUDIBLE_MIDI_TRANSPORT_OUTCOME,
  createAudibleMidiTransport,
} from './transport/audible-midi-transport'
export type {
  AudibleMidiTransport,
  AudibleMidiTransportSnapshot,
  AudibleMidiTransportTransition,
  EngineGeneration,
  PlaybackClock,
} from './transport/audible-midi-transport'
