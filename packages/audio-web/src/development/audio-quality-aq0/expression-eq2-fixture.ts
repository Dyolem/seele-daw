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

export const AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND = 0.48
export const AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_AMPLITUDE = 0.04
export const AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_FREQUENCY_HZ = 1_000
export const AUDIO_QUALITY_EXPRESSION_EQ2_NOTE_START_SECOND = 0.05
export const AUDIO_QUALITY_EXPRESSION_EQ2_KEY_RELEASE_SECOND = 0.15
export const AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND = 0.3
export const AUDIO_QUALITY_EXPRESSION_EQ2_ZONE_RELEASE_SECOND = 0.08
export const AUDIO_QUALITY_EXPRESSION_EQ2_STRESS_VOICE_COUNT = 32
export const AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND = 0.18
export const AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_FIRST_KEY_RELEASE_SECOND = 0.12
export const AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND_KEY_RELEASE_SECOND = 0.24
export const AUDIO_QUALITY_EXPRESSION_EQ2_TAIL_WINDOW = Object.freeze({
  fromSecond: 0.44,
  toSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RENDER_DURATION_SECOND,
})
export const AUDIO_QUALITY_EXPRESSION_EQ2_PITCH = Object.freeze({
  continuousLoop: 61,
  noLoop: 60,
  oneShot: 63,
  sustainLoop: 62,
} as const)

const SOUNDBANK_ID = parseSoundbankId('audio-quality-expression-eq2-browser-fixture')
const LOOP_RESOURCE_KEY = 'synthetic/expression-eq2-loop-sine.wav'
const ONE_SHOT_RESOURCE_KEY = 'synthetic/expression-eq2-one-shot-sine.wav'
const LOOP_SOURCE_DURATION_SECOND = 1
const ONE_SHOT_SOURCE_DURATION_SECOND = 0.35
const LOOP_START_SECOND = 0.02
const LOOP_END_SECOND = 0.04

export interface CreateAudioQualityExpressionEq2PlanOptions {
  readonly keyReleaseSecond?: number
  readonly occurrenceKey: string
  readonly pan?: number
  readonly pitch: number
  readonly releaseSecond?: number
  readonly startSecond?: number
}

function createSineBuffer(context: OfflineAudioContext, durationSecond: number): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    audioQualitySecondToFrame(durationSecond),
    AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  )
  const channel = buffer.getChannelData(0)
  for (let frame = 0; frame < channel.length; frame += 1) {
    channel[frame] =
      AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_AMPLITUDE *
      Math.sin(
        (2 * Math.PI * AUDIO_QUALITY_EXPRESSION_EQ2_SOURCE_FREQUENCY_HZ * frame) /
          AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
      )
  }
  return buffer
}

function createZone(
  zoneId: string,
  pitch: number,
  overrides: Partial<SampleInstrumentZoneV1> = {},
): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({
        curve: null,
        durationSecond: AUDIO_QUALITY_EXPRESSION_EQ2_ZONE_RELEASE_SECOND,
      }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: LOOP_RESOURCE_KEY, mediaType: 'audio/wav' }),
    rootMidiPitch: pitch,
    selector: Object.freeze({ kind: 'exact-midi', pitch }),
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId,
    ...overrides,
  } as SampleInstrumentZoneV1)
}

function createZones(): readonly SampleInstrumentZoneV1[] {
  return Object.freeze([
    createZone('expression-eq2-no-loop', AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.noLoop),
    createZone(
      'expression-eq2-continuous-loop',
      AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.continuousLoop,
      {
        loop: Object.freeze({
          endSecond: LOOP_END_SECOND,
          kind: 'continuous',
          startSecond: LOOP_START_SECOND,
        }),
      },
    ),
    createZone('expression-eq2-sustain-loop', AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.sustainLoop, {
      loop: Object.freeze({
        endSecond: LOOP_END_SECOND,
        kind: 'sustain',
        startSecond: LOOP_START_SECOND,
      }),
    }),
    createZone('expression-eq2-one-shot', AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.oneShot, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: null, durationSecond: 0 }),
        release: null,
      }),
      resource: Object.freeze({ key: ONE_SHOT_RESOURCE_KEY, mediaType: 'audio/wav' }),
      triggerMode: 'one-shot',
    }),
  ])
}

export function createAudioQualityExpressionEq2PreparedResources(
  context: OfflineAudioContext,
): PreparedAudibleMidiSampleResources {
  const loopBuffer = createSineBuffer(context, LOOP_SOURCE_DURATION_SECOND)
  const oneShotBuffer = createSineBuffer(context, ONE_SHOT_SOURCE_DURATION_SECOND)
  const zones = createZones()
  const manifest = Object.freeze({
    displayName: 'Expression EQ2 Synthetic Pedal Reference',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: SOUNDBANK_ID,
    zones,
  }) as SampleInstrumentManifestV1
  return Object.freeze({
    failures: Object.freeze([]),
    instruments: Object.freeze([
      Object.freeze({
        manifest,
        resources: Object.freeze([
          Object.freeze({
            audioBuffer: loopBuffer,
            encodedByteLength: loopBuffer.length * Float32Array.BYTES_PER_ELEMENT,
            key: LOOP_RESOURCE_KEY,
          }),
          Object.freeze({
            audioBuffer: oneShotBuffer,
            encodedByteLength: oneShotBuffer.length * Float32Array.BYTES_PER_ELEMENT,
            key: ONE_SHOT_RESOURCE_KEY,
          }),
        ]),
        soundbankId: SOUNDBANK_ID,
      }),
    ]),
    modelRevision: 1,
  }) as unknown as PreparedAudibleMidiSampleResources
}

export function createAudioQualityExpressionEq2Plan(
  options: CreateAudioQualityExpressionEq2PlanOptions,
): ScheduledSampleVoicePlan {
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: 'audio-quality-expression-eq2-browser-device',
    kind: 'sample-voice',
    keyReleasePlaybackClockSecond:
      options.keyReleaseSecond ?? AUDIO_QUALITY_EXPRESSION_EQ2_KEY_RELEASE_SECOND,
    masterGain: 1,
    occurrenceKey: options.occurrenceKey,
    pan: options.pan ?? -1,
    pitch: options.pitch,
    releasePlaybackClockSecond:
      options.releaseSecond ?? AUDIO_QUALITY_EXPRESSION_EQ2_PEDAL_UP_SECOND,
    soundbankId: SOUNDBANK_ID,
    startPlaybackClockSecond: options.startSecond ?? AUDIO_QUALITY_EXPRESSION_EQ2_NOTE_START_SECOND,
    timing: 'on-time',
    trackGain: 1,
    trackId: 'audio-quality-expression-eq2-browser-track',
    velocity: 127,
  }) as unknown as ScheduledSampleVoicePlan
}

export function createAudioQualityExpressionEq2StressPlans(): readonly ScheduledSampleVoicePlan[] {
  return Object.freeze(
    Array.from({ length: AUDIO_QUALITY_EXPRESSION_EQ2_STRESS_VOICE_COUNT }, (_, index) =>
      createAudioQualityExpressionEq2Plan({
        occurrenceKey: `expression-eq2-stress-${String(index).padStart(2, '0')}`,
        pitch: AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.noLoop,
      }),
    ),
  )
}

export function createAudioQualityExpressionEq2RetriggerPlans(): readonly ScheduledSampleVoicePlan[] {
  return Object.freeze([
    createAudioQualityExpressionEq2Plan({
      keyReleaseSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_FIRST_KEY_RELEASE_SECOND,
      occurrenceKey: 'expression-eq2-retrigger-first',
      pitch: AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.noLoop,
    }),
    createAudioQualityExpressionEq2Plan({
      keyReleaseSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND_KEY_RELEASE_SECOND,
      occurrenceKey: 'expression-eq2-retrigger-second',
      pitch: AUDIO_QUALITY_EXPRESSION_EQ2_PITCH.noLoop,
      startSecond: AUDIO_QUALITY_EXPRESSION_EQ2_RETRIGGER_SECOND,
    }),
  ])
}
