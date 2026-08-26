import type { ScheduledSampleVoicePlan } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'
import { SampleInstrumentVoiceRuntime } from '#internal/sample-instrument/voice/voice-runtime'
import {
  AUDIO_QUALITY_AQ0_VELOCITY_VECTOR,
  measureAudioQualityAq0Channel,
} from '#internal/development/audio-quality-aq0'
import {
  AUDIO_QUALITY_FIXTURE_SOUNDBANK_ID,
  AUDIO_QUALITY_NOTE_LENGTH_VECTOR_SECOND,
  AUDIO_QUALITY_VELOCITY_VECTOR,
  createAudioQualityVoicePlan,
  createAudioQualityVoicePlanScenarios,
} from '#internal/__tests__/support/audio-quality-plan-fixture'
import {
  createAudioQualityPcmFixtureSet,
  measureAudioQualityLoopWrapDelta,
  measureAudioQualityPcmChannel,
} from '#internal/__tests__/support/audio-quality-pcm-fixture'
import {
  FakeAudioContext,
  FakeGainNode,
  createFakeAudioBuffer,
} from '#internal/__tests__/support/fake-web-audio'

function createVelocityZone(): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({ curve: null, durationSecond: 0.133 }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: 'synthetic/reference-sine.wav', mediaType: 'audio/wav' }),
    rootMidiPitch: 60,
    selector: Object.freeze({ kind: 'exact-midi', pitch: 60 }),
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId: 'velocity-reference',
  })
}

function createPreparedResources(): PreparedAudibleMidiSampleResources {
  const zone = createVelocityZone()
  const manifest = Object.freeze({
    displayName: 'AQ0 Synthetic Reference',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: AUDIO_QUALITY_FIXTURE_SOUNDBANK_ID,
    zones: Object.freeze([zone]),
  }) as SampleInstrumentManifestV1
  return Object.freeze({
    failures: Object.freeze([]),
    instruments: Object.freeze([
      Object.freeze({
        manifest,
        resources: Object.freeze([
          Object.freeze({
            audioBuffer: createFakeAudioBuffer(8),
            encodedByteLength: 1_024,
            key: zone.resource.key,
          }),
        ]),
        soundbankId: AUDIO_QUALITY_FIXTURE_SOUNDBANK_ID,
      }),
    ]),
    modelRevision: 1,
  }) as unknown as PreparedAudibleMidiSampleResources
}

function createRuntime() {
  const context = new FakeAudioContext()
  const master = new FakeGainNode()
  const setMasterGainAtTime = vi.fn<ActiveWebAudioOutput['setMasterGainAtTime']>(
    (gain: number, time: number) => master.gain.setValueAtTime(gain, time),
  )
  const output: ActiveWebAudioOutput = Object.freeze({
    audioContext: context.asAudioContext(),
    masterInput: master as unknown as AudioNode,
    setMasterGainAtTime,
  })
  const runtime = new SampleInstrumentVoiceRuntime({
    output,
    preparedResources: createPreparedResources(),
  })
  runtime.advanceGeneration(1 as ScheduledSampleVoicePlan['engineGeneration'])
  return { context, runtime, setMasterGainAtTime }
}

describe('Audio Quality Foundation AQ0 baseline', () => {
  it('fixes deterministic PCM inputs and measurements without distributable soundbank assets', () => {
    const fixtures = createAudioQualityPcmFixtureSet()
    const sine = measureAudioQualityPcmChannel(fixtures.referenceSine.channels[0]!)
    const impulse = measureAudioQualityPcmChannel(fixtures.impulse.channels[0]!)

    expect(fixtures.referenceSine).toMatchObject({ frameCount: 4_800, sampleRateHz: 48_000 })
    expect(sine.peakLinear).toBeCloseTo(0.5, 7)
    expect(sine.rmsLinear).toBeCloseTo(Math.SQRT1_2 / 2, 7)
    expect(sine.dcOffset).toBeCloseTo(0, 7)
    expect(impulse.peakLinear).toBe(1)
    expect(impulse.rmsLinear).toBeCloseTo(Math.sqrt(1 / 480), 10)
    expect(measureAudioQualityLoopWrapDelta(fixtures.seamlessLoop.channels[0]!)).toBeCloseTo(0, 7)
    expect(measureAudioQualityLoopWrapDelta(fixtures.discontinuousLoop.channels[0]!)).toBe(1)

    const [left, right] = fixtures.opposedStereo.channels
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    for (let frame = 0; frame < fixtures.opposedStereo.frameCount; frame += 1) {
      expect(left![frame]! + right![frame]!).toBeCloseTo(0, 7)
    }

    expect(
      measureAudioQualityAq0Channel(fixtures.referenceSine.channels[0]!, 0, 4_800),
    ).toMatchObject({
      peakLinear: sine.peakLinear,
      rmsLinear: sine.rmsLinear,
    })
    expect(AUDIO_QUALITY_AQ0_VELOCITY_VECTOR).toEqual(AUDIO_QUALITY_VELOCITY_VECTOR)
  })

  it('freezes the shared Voice Plan scenario matrix and unique occurrence identities', () => {
    const scenarios = createAudioQualityVoicePlanScenarios()
    const plans = scenarios.flatMap((scenario) => scenario.plans)
    const occurrenceKeys = plans.map((plan) => plan.occurrenceKey)

    expect(Object.isFrozen(scenarios)).toBe(true)
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'velocity-response',
      'note-length',
      'triad',
      'dense-chord',
      'retrigger',
      'trigger-and-loop',
    ])
    expect(new Set(occurrenceKeys).size).toBe(occurrenceKeys.length)
    expect(
      scenarios
        .find((scenario) => scenario.id === 'velocity-response')
        ?.plans.map((plan) => plan.velocity),
    ).toEqual(AUDIO_QUALITY_VELOCITY_VECTOR)
    const measuredNoteLengths = scenarios
      .find((scenario) => scenario.id === 'note-length')
      ?.plans.map((plan) => plan.releasePlaybackClockSecond - plan.startPlaybackClockSecond)
    expect(measuredNoteLengths).toHaveLength(AUDIO_QUALITY_NOTE_LENGTH_VECTOR_SECOND.length)
    for (let index = 0; index < AUDIO_QUALITY_NOTE_LENGTH_VECTOR_SECOND.length; index += 1) {
      expect(measuredNoteLengths?.[index]).toBeCloseTo(
        AUDIO_QUALITY_NOTE_LENGTH_VECTOR_SECOND[index]!,
        10,
      )
    }
    expect(
      plans.every((plan) => plan.releasePlaybackClockSecond > plan.startPlaybackClockSecond),
    ).toBe(true)
  })

  it('characterizes the current linear Velocity amplitude and direct master gain handoff', () => {
    const { context, runtime, setMasterGainAtTime } = createRuntime()
    const plans = AUDIO_QUALITY_VELOCITY_VECTOR.map((velocity, index) =>
      createAudioQualityVoicePlan({
        occurrenceKey: `current-linear-${velocity}`,
        startSecond: 1 + index,
        velocity,
      }),
    )

    for (const plan of plans) expect(runtime.schedule(plan).outcome).toBe('scheduled')

    expect(context.gainNodes).toHaveLength(plans.length)
    for (let index = 0; index < plans.length; index += 1) {
      expect(context.gainNodes[index]?.gain.events).toContainEqual({
        kind: 'set',
        time: plans[index]!.startPlaybackClockSecond,
        value: plans[index]!.velocity / 127,
      })
    }
    expect(setMasterGainAtTime).toHaveBeenCalledTimes(plans.length)
    expect(setMasterGainAtTime.mock.calls.every(([gain]) => gain === 1)).toBe(true)

    for (const source of context.bufferSources) source.finish()
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 0,
      connectedNodeCount: 0,
      endedListenerCount: 0,
      sourceNodeCount: 0,
    })
  })

  it('records that current same-pitch occurrences have no per-runtime Voice cap', () => {
    const { context, runtime } = createRuntime()
    const plans = Array.from({ length: 65 }, (_, index) =>
      createAudioQualityVoicePlan({ occurrenceKey: `uncapped-${index + 1}` }),
    )

    for (const plan of plans) expect(runtime.schedule(plan).outcome).toBe('scheduled')
    expect(runtime.statistics.activeVoiceCount).toBe(65)

    runtime.dispose()
    for (const source of context.bufferSources) source.finish()
    expect(runtime.statistics.activeVoiceCount).toBe(0)
    expect(runtime.statistics.connectedNodeCount).toBe(0)
    expect(runtime.statistics.endedListenerCount).toBe(0)
  })
})
