/** Public API for the Web Audio backend. */
export { WebAudioContextRuntime } from './context/audio-context-runtime'
export type { ActiveWebAudioOutput } from './context/audio-context-runtime'
export {
  AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE,
  prepareAudibleMidiSampleResources,
} from './sample-instrument/loading/prepare-plan-resources'
export type {
  AudibleMidiSamplePreparationFailure,
  AudibleMidiSamplePreparationFailureMode,
  AudibleMidiSampleResourceLocator,
  PrepareAudibleMidiSampleResourcesOptions,
  PreparedAudibleMidiSampleResources,
} from './sample-instrument/loading/prepare-plan-resources'
export { SampleInstrumentResourceCache } from './sample-instrument/loading/resource-cache'
export type {
  SampleInstrumentAssetLocation,
  SampleInstrumentResourceCacheLimits,
} from './sample-instrument/loading/resource-cache'
export { SampleInstrumentVoiceRuntime } from './sample-instrument/voice/voice-runtime'
export type {
  SampleInstrumentVoiceReleaseUpdateOutcome,
  SampleInstrumentVoiceReleaseUpdateResult,
  SampleInstrumentVoicePolyphonyStatistics,
  SampleInstrumentVoiceRuntimeStatistics,
  SampleInstrumentVoiceScheduleOutcome,
  SampleInstrumentVoiceScheduleResult,
  SampleInstrumentVoiceToken,
} from './sample-instrument/voice/voice-runtime'
