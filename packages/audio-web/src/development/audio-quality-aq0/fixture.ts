import { parseSoundbankId, type ScheduledSampleVoicePlan } from '@seele-daw/playback'

import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'

export const AUDIO_QUALITY_AQ0_REPORT_SCHEMA = 'seele.audio-quality-aq0-browser-report'
export const AUDIO_QUALITY_AQ0_VELOCITY_VECTOR = Object.freeze([1, 32, 64, 96, 127] as const)
export const AUDIO_QUALITY_AQ1_REFERENCE_TRIAD_PITCHES = Object.freeze([60, 64, 67] as const)
export const AUDIO_QUALITY_AQ1_COHERENT_STRESS_VOICE_COUNT = 10
export const AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ = 48_000
export const AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND = 0.5
export const AUDIO_QUALITY_AQ0_SOURCE_DURATION_SECOND = 1
export const AUDIO_QUALITY_AQ0_SOURCE_AMPLITUDE = 0.5
export const AUDIO_QUALITY_AQ0_SOURCE_FREQUENCY_HZ = 1_000
export const AUDIO_QUALITY_AQ0_NOTE_START_SECOND = 0.05
export const AUDIO_QUALITY_AQ0_NOTE_RELEASE_SECOND = 0.3
export const AUDIO_QUALITY_AQ0_ZONE_RELEASE_SECOND = 0.133
export const AUDIO_QUALITY_AQ0_STEADY_WINDOW = Object.freeze({ fromSecond: 0.1, toSecond: 0.2 })
export const AUDIO_QUALITY_AQ0_TAIL_WINDOW = Object.freeze({
  fromSecond: 0.45,
  toSecond: AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND,
})

const SOUNDBANK_ID = parseSoundbankId('audio-quality-aq0-browser-fixture')

export interface CreateAudioQualityBrowserPlanOptions {
  readonly occurrenceKey: string
  readonly pitch?: number
  readonly velocity: number
}

export function audioQualitySecondToFrame(second: number): number {
  return Math.round(second * AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ)
}

function createZone(): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({
        curve: null,
        durationSecond: AUDIO_QUALITY_AQ0_ZONE_RELEASE_SECOND,
      }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: 'synthetic/reference-sine.wav', mediaType: 'audio/wav' }),
    rootMidiPitch: 60,
    selector: Object.freeze({ kind: 'midi-range', maximumPitch: 127, minimumPitch: 0 }),
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId: 'aq0-reference-sine',
  })
}

export function createAudioQualityReferenceSineBuffer(context: OfflineAudioContext): AudioBuffer {
  const frameCount = audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_SOURCE_DURATION_SECOND)
  const buffer = context.createBuffer(1, frameCount, AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ)
  const channel = buffer.getChannelData(0)
  for (let frame = 0; frame < frameCount; frame += 1) {
    channel[frame] =
      AUDIO_QUALITY_AQ0_SOURCE_AMPLITUDE *
      Math.sin(
        (2 * Math.PI * AUDIO_QUALITY_AQ0_SOURCE_FREQUENCY_HZ * frame) /
          AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
      )
  }
  return buffer
}

export function createAudioQualityPreparedResources(
  audioBuffer: AudioBuffer,
): PreparedAudibleMidiSampleResources {
  const zone = createZone()
  const manifest = Object.freeze({
    displayName: 'AQ0 Synthetic Reference',
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
            key: zone.resource.key,
          }),
        ]),
        soundbankId: SOUNDBANK_ID,
      }),
    ]),
    modelRevision: 1,
  }) as unknown as PreparedAudibleMidiSampleResources
}

export function createAudioQualityBrowserPlan(
  options: CreateAudioQualityBrowserPlanOptions,
): ScheduledSampleVoicePlan {
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: 'audio-quality-aq0-browser-device',
    kind: 'sample-voice',
    keyReleasePlaybackClockSecond: AUDIO_QUALITY_AQ0_NOTE_RELEASE_SECOND,
    masterGain: 1,
    occurrenceKey: options.occurrenceKey,
    pan: 0,
    pitch: options.pitch ?? 60,
    releasePlaybackClockSecond: AUDIO_QUALITY_AQ0_NOTE_RELEASE_SECOND,
    soundbankId: SOUNDBANK_ID,
    startPlaybackClockSecond: AUDIO_QUALITY_AQ0_NOTE_START_SECOND,
    timing: 'on-time',
    trackGain: 1,
    trackId: 'audio-quality-aq0-browser-track',
    velocity: options.velocity,
  }) as unknown as ScheduledSampleVoicePlan
}
