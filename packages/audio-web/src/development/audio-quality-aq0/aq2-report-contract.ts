import type { SampleInstrumentVoiceRuntimeStatistics } from '#internal/sample-instrument/voice/voice-runtime'

export const AUDIO_QUALITY_AQ2_GATE_POLICY = Object.freeze({
  envelopeErrorToleranceFullScale: 1e-4,
  loopSeamErrorToleranceFullScale: 1e-4,
  renderQuantumFrameCount: 128,
  tailThresholdDbfs: -90,
} as const)

export interface AudioQualityAq2RuntimeMeasurement {
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly tailPeakDbfs: number | null
  readonly tailPeakLinear: number
}

export interface AudioQualityAq2EnvelopeMeasurement extends AudioQualityAq2RuntimeMeasurement {
  readonly id: 'fast-release' | 'shaped-envelope' | 'short-note'
  readonly maximumAbsoluteError: number
}

export interface AudioQualityAq2LoopMeasurement extends AudioQualityAq2RuntimeMeasurement {
  readonly id: 'continuous-loop' | 'sustain-loop'
  readonly maximumSeamError: number
  readonly steadyPeakLinear: number
  readonly transitionCount: number
}

export interface AudioQualityAq2OneShotMeasurement extends AudioQualityAq2RuntimeMeasurement {
  readonly levelAfterNoteOffPeakLinear: number
}

export interface AudioQualityAq2MutexMeasurement extends AudioQualityAq2RuntimeMeasurement {
  readonly newVoiceChannelPeakLinear: number
  readonly oldVoiceChannelTailPeakDbfs: number | null
  readonly oldVoiceChannelTailPeakLinear: number
  readonly oldVoiceFastReleaseMaximumAbsoluteError: number
}

export interface AudioQualityAq2BrowserReport {
  readonly checks: {
    readonly allMeasurementsFinite: boolean
    readonly envelopeErrorsAtOrBelowTolerance: boolean
    readonly loopSeamsAtOrBelowTolerance: boolean
    readonly loopSignalsAudible: boolean
    readonly mutexFastReleaseAtOrBelowTolerance: boolean
    readonly mutexRoutesNewVoiceAfterChoke: boolean
    readonly oneShotContinuesAfterNoteOff: boolean
    readonly resourcesReleasedAfterDispose: boolean
    readonly resourcesReleasedAfterRender: boolean
    readonly tailsBelowMinus90Dbfs: boolean
  }
  readonly envelopeMeasurements: readonly AudioQualityAq2EnvelopeMeasurement[]
  readonly gatePolicy: typeof AUDIO_QUALITY_AQ2_GATE_POLICY
  readonly loopMeasurements: readonly AudioQualityAq2LoopMeasurement[]
  readonly mutexMeasurement: AudioQualityAq2MutexMeasurement
  readonly oneShotMeasurement: AudioQualityAq2OneShotMeasurement
}
