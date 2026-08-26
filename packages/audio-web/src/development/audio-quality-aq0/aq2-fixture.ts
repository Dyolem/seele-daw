import { parseSoundbankId, type ScheduledSampleVoicePlan } from '@seele-daw/playback'

import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'
import {
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
} from '#internal/development/audio-quality-aq0/fixture'

export const AUDIO_QUALITY_AQ2_RENDER_DURATION_SECOND = 0.4
export const AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE = 0.5
export const AUDIO_QUALITY_AQ2_NOTE_START_SECOND = 0.05
export const AUDIO_QUALITY_AQ2_NORMAL_RELEASE_SECOND = 0.2
export const AUDIO_QUALITY_AQ2_SHAPED_ATTACK_SECOND = 0.08
export const AUDIO_QUALITY_AQ2_SHORT_ATTACK_SECOND = 0.2
export const AUDIO_QUALITY_AQ2_SHORT_NOTE_RELEASE_SECOND = 0.13
export const AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND = 0.08
export const AUDIO_QUALITY_AQ2_FAST_RELEASE_START_SECOND = 0.2
export const AUDIO_QUALITY_AQ2_LOOP_START_SECOND = 0.02
export const AUDIO_QUALITY_AQ2_LOOP_END_SECOND = 0.04
export const AUDIO_QUALITY_AQ2_CONTINUOUS_RELEASE_SECOND = 0.25
export const AUDIO_QUALITY_AQ2_SUSTAIN_RELEASE_SECOND = 0.19
export const AUDIO_QUALITY_AQ2_ONE_SHOT_RELEASE_SECOND = 0.1
export const AUDIO_QUALITY_AQ2_MUTEX_NEW_START_SECOND = 0.15
export const AUDIO_QUALITY_AQ2_MUTEX_RELEASE_SECOND = 0.28
export const AUDIO_QUALITY_AQ2_TAIL_WINDOW = Object.freeze({
  fromSecond: 0.37,
  toSecond: AUDIO_QUALITY_AQ2_RENDER_DURATION_SECOND,
})
export const AUDIO_QUALITY_AQ2_PITCH = Object.freeze({
  continuousLoop: 63,
  fastRelease: 62,
  mutexNew: 67,
  mutexOld: 66,
  oneShot: 65,
  shapedEnvelope: 60,
  shortNote: 61,
  sustainLoop: 64,
} as const)

const SOUNDBANK_ID = parseSoundbankId('audio-quality-aq2-browser-fixture')
const CONSTANT_RESOURCE_KEY = 'synthetic/aq2-constant.wav'
const LOOP_RESOURCE_KEY = 'synthetic/aq2-loop-sine.wav'
const ONE_SHOT_RESOURCE_KEY = 'synthetic/aq2-one-shot.wav'
const SOURCE_DURATION_SECOND = 1
const ONE_SHOT_DURATION_SECOND = 0.15
const LOOP_FREQUENCY_HZ = 1_000

export interface CreateAudioQualityAq2PlanOptions {
  readonly occurrenceKey: string
  readonly pan?: number
  readonly pitch: number
  readonly releaseSecond: number
  readonly startSecond?: number
}

function createBuffer(
  context: OfflineAudioContext,
  durationSecond: number,
  sampleAtFrame: (frame: number) => number,
): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    audioQualitySecondToFrame(durationSecond),
    AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  )
  const channel = buffer.getChannelData(0)
  for (let frame = 0; frame < channel.length; frame += 1) {
    channel[frame] = sampleAtFrame(frame)
  }
  return buffer
}

function createZone(
  zoneId: string,
  pitch: number,
  resourceKey: string,
  overrides: Partial<SampleInstrumentZoneV1> = {},
): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({
        curve: null,
        durationSecond: AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND,
      }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: resourceKey, mediaType: 'audio/wav' }),
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
    createZone(
      'aq2-shaped-envelope',
      AUDIO_QUALITY_AQ2_PITCH.shapedEnvelope,
      CONSTANT_RESOURCE_KEY,
      {
        amplitudeEnvelope: Object.freeze({
          attack: Object.freeze({
            curve: -2,
            durationSecond: AUDIO_QUALITY_AQ2_SHAPED_ATTACK_SECOND,
          }),
          release: Object.freeze({
            curve: 2,
            durationSecond: AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND,
          }),
        }),
      },
    ),
    createZone('aq2-short-note', AUDIO_QUALITY_AQ2_PITCH.shortNote, CONSTANT_RESOURCE_KEY, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: -2, durationSecond: AUDIO_QUALITY_AQ2_SHORT_ATTACK_SECOND }),
        release: Object.freeze({ curve: 2, durationSecond: AUDIO_QUALITY_AQ2_ZONE_RELEASE_SECOND }),
      }),
    }),
    createZone('aq2-fast-release', AUDIO_QUALITY_AQ2_PITCH.fastRelease, CONSTANT_RESOURCE_KEY),
    createZone('aq2-continuous-loop', AUDIO_QUALITY_AQ2_PITCH.continuousLoop, LOOP_RESOURCE_KEY, {
      loop: Object.freeze({
        endSecond: AUDIO_QUALITY_AQ2_LOOP_END_SECOND,
        kind: 'continuous',
        startSecond: AUDIO_QUALITY_AQ2_LOOP_START_SECOND,
      }),
    }),
    createZone('aq2-sustain-loop', AUDIO_QUALITY_AQ2_PITCH.sustainLoop, LOOP_RESOURCE_KEY, {
      loop: Object.freeze({
        endSecond: AUDIO_QUALITY_AQ2_LOOP_END_SECOND,
        kind: 'sustain',
        startSecond: AUDIO_QUALITY_AQ2_LOOP_START_SECOND,
      }),
    }),
    createZone('aq2-one-shot', AUDIO_QUALITY_AQ2_PITCH.oneShot, ONE_SHOT_RESOURCE_KEY, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: null, durationSecond: 0 }),
        release: null,
      }),
      triggerMode: 'one-shot',
    }),
    createZone('aq2-mutex-old', AUDIO_QUALITY_AQ2_PITCH.mutexOld, CONSTANT_RESOURCE_KEY, {
      exclusiveGroup: Object.freeze({ groupId: 1, offByGroupId: 2, offMode: 'fast' }),
    }),
    createZone('aq2-mutex-new', AUDIO_QUALITY_AQ2_PITCH.mutexNew, CONSTANT_RESOURCE_KEY, {
      exclusiveGroup: Object.freeze({ groupId: 2, offByGroupId: 1, offMode: 'fast' }),
    }),
  ])
}

export function createAudioQualityAq2PreparedResources(
  context: OfflineAudioContext,
): PreparedAudibleMidiSampleResources {
  const constantBuffer = createBuffer(
    context,
    SOURCE_DURATION_SECOND,
    () => AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE,
  )
  const loopBuffer = createBuffer(
    context,
    SOURCE_DURATION_SECOND,
    (frame) =>
      AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE *
      Math.sin((2 * Math.PI * LOOP_FREQUENCY_HZ * frame) / AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ),
  )
  const oneShotBuffer = createBuffer(
    context,
    ONE_SHOT_DURATION_SECOND,
    () => AUDIO_QUALITY_AQ2_SOURCE_AMPLITUDE,
  )
  const zones = createZones()
  const manifest = Object.freeze({
    displayName: 'AQ2 Synthetic Envelope and Loop Reference',
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
            audioBuffer: constantBuffer,
            encodedByteLength: constantBuffer.length * Float32Array.BYTES_PER_ELEMENT,
            key: CONSTANT_RESOURCE_KEY,
          }),
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

export function createAudioQualityAq2Plan(
  options: CreateAudioQualityAq2PlanOptions,
): ScheduledSampleVoicePlan {
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: 'audio-quality-aq2-browser-device',
    kind: 'sample-voice',
    masterGain: 1,
    occurrenceKey: options.occurrenceKey,
    pan: options.pan ?? 0,
    pitch: options.pitch,
    releasePlaybackClockSecond: options.releaseSecond,
    soundbankId: SOUNDBANK_ID,
    startPlaybackClockSecond: options.startSecond ?? AUDIO_QUALITY_AQ2_NOTE_START_SECOND,
    timing: 'on-time',
    trackGain: 1,
    trackId: 'audio-quality-aq2-browser-track',
    velocity: 127,
  }) as unknown as ScheduledSampleVoicePlan
}
