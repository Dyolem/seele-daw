import { parseSoundbankId, type ScheduledSampleVoicePlan } from '@seele-daw/playback'

import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
} from '#internal/development/audio-quality-aq0/fixture'
import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'

export const AUDIO_QUALITY_AQ3_RENDER_DURATION_SECOND = 0.32
export const AUDIO_QUALITY_AQ3_SOURCE_AMPLITUDE = 0.005
export const AUDIO_QUALITY_AQ3_EARLY_START_SECOND = 0.04
export const AUDIO_QUALITY_AQ3_STEAL_SECOND = 0.05
export const AUDIO_QUALITY_AQ3_RELEASE_SECOND = 0.2
export const AUDIO_QUALITY_AQ3_ZONE_RELEASE_SECOND = 0.04
export const AUDIO_QUALITY_AQ3_STRESS_PLAN_COUNT = 10_000
export const AUDIO_QUALITY_AQ3_PROJECT_PLAN_COUNT = 129
export const AUDIO_QUALITY_AQ3_TAIL_WINDOW = Object.freeze({
  fromSecond: 0.28,
  toSecond: AUDIO_QUALITY_AQ3_RENDER_DURATION_SECOND,
})

const SOUNDBANK_ID = parseSoundbankId('audio-quality-aq3-browser-fixture')
const RESOURCE_KEY = 'synthetic/aq3-constant.wav'
const SOURCE_DURATION_SECOND = 0.5
const PITCH = 60

export interface CreateAudioQualityAq3PlanOptions {
  readonly instrumentDeviceId: string
  readonly occurrenceKey: string
  readonly pan: number
  readonly startSecond: number
}

function createBuffer(context: OfflineAudioContext): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    audioQualitySecondToFrame(SOURCE_DURATION_SECOND),
    AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  )
  buffer.getChannelData(0).fill(AUDIO_QUALITY_AQ3_SOURCE_AMPLITUDE)
  return buffer
}

function createZone(): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({
        curve: null,
        durationSecond: AUDIO_QUALITY_AQ3_ZONE_RELEASE_SECOND,
      }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: RESOURCE_KEY, mediaType: 'audio/wav' }),
    rootMidiPitch: PITCH,
    selector: Object.freeze({ kind: 'midi-range', maximumPitch: 127, minimumPitch: 0 }),
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId: 'aq3-polyphony-reference',
  })
}

export function createAudioQualityAq3PreparedResources(
  context: OfflineAudioContext,
): PreparedAudibleMidiSampleResources {
  const audioBuffer = createBuffer(context)
  const zone = createZone()
  const manifest = Object.freeze({
    displayName: 'AQ3 Synthetic Polyphony Reference',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: SOUNDBANK_ID,
    zones: Object.freeze([zone]),
  }) as SampleInstrumentManifestV1
  return Object.freeze({
    failures: Object.freeze([]),
    instruments: Object.freeze([
      Object.freeze({
        manifest,
        resources: Object.freeze([
          Object.freeze({
            audioBuffer,
            encodedByteLength: audioBuffer.length * Float32Array.BYTES_PER_ELEMENT,
            key: RESOURCE_KEY,
          }),
        ]),
        soundbankId: SOUNDBANK_ID,
      }),
    ]),
    modelRevision: 1,
  }) as unknown as PreparedAudibleMidiSampleResources
}

export function createAudioQualityAq3Plan(
  options: CreateAudioQualityAq3PlanOptions,
): ScheduledSampleVoicePlan {
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: options.instrumentDeviceId,
    kind: 'sample-voice',
    masterGain: 1,
    occurrenceKey: options.occurrenceKey,
    pan: options.pan,
    pitch: PITCH,
    releasePlaybackClockSecond: AUDIO_QUALITY_AQ3_RELEASE_SECOND,
    soundbankId: SOUNDBANK_ID,
    startPlaybackClockSecond: options.startSecond,
    timing: 'on-time',
    trackGain: 1,
    trackId: `aq3-track-${options.instrumentDeviceId}`,
    velocity: 127,
  }) as unknown as ScheduledSampleVoicePlan
}

export function createAudioQualityAq3StressPlans(): readonly ScheduledSampleVoicePlan[] {
  return Object.freeze(
    Array.from({ length: AUDIO_QUALITY_AQ3_STRESS_PLAN_COUNT }, (_, index) =>
      createAudioQualityAq3Plan({
        instrumentDeviceId: 'aq3-stress-instrument',
        occurrenceKey: `aq3-stress-${String(index).padStart(5, '0')}`,
        pan: index < 16 ? -1 : 1,
        startSecond:
          index < 64 ? AUDIO_QUALITY_AQ3_EARLY_START_SECOND : AUDIO_QUALITY_AQ3_STEAL_SECOND,
      }),
    ),
  )
}

export function createAudioQualityAq3ProjectLimitPlans(): readonly ScheduledSampleVoicePlan[] {
  return Object.freeze(
    Array.from({ length: AUDIO_QUALITY_AQ3_PROJECT_PLAN_COUNT }, (_, index) =>
      createAudioQualityAq3Plan({
        instrumentDeviceId:
          index < 64
            ? 'aq3-project-instrument-a'
            : index < 128
              ? 'aq3-project-instrument-b'
              : 'aq3-project-instrument-c',
        occurrenceKey: `aq3-project-${String(index).padStart(3, '0')}`,
        pan: index === 0 ? -1 : 1,
        startSecond:
          index < 128 ? AUDIO_QUALITY_AQ3_EARLY_START_SECOND : AUDIO_QUALITY_AQ3_STEAL_SECOND,
      }),
    ),
  )
}
