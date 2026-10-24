import {
  parsePlaybackClockSecond,
  parseSoundbankId,
  type ScheduledSampleVoicePlan,
} from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import {
  SampleInstrumentVoiceRuntime,
  type SampleInstrument,
} from '#internal/sample-instrument/voice/voice-runtime'
import {
  FakeAudioContext,
  FakeGainNode,
  createFakeAudioBuffer,
} from '#internal/__tests__/support/fake-web-audio'

const SOUNDBANK_ID = parseSoundbankId('fixture-voice-bank')
const FAST_RELEASE_SECOND = AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
const STOP_SAFETY_SECOND = AUDIO_QUALITY_V1A_RENDER_POLICY.sourceStopSafetySecond

function createZone(
  zoneId: string,
  pitch: number,
  overrides: Partial<SampleInstrumentZoneV1> = {},
): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({ curve: null, durationSecond: 0.3 }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: `samples/${zoneId}.wav`, mediaType: 'audio/wav' }),
    rootMidiPitch: pitch,
    selector: Object.freeze({ kind: 'exact-midi', pitch }),
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId,
    ...overrides,
  } as SampleInstrumentZoneV1)
}

function createVoiceZones(): readonly SampleInstrumentZoneV1[] {
  return Object.freeze([
    createZone('range', 48, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: -2, durationSecond: 0.2 }),
        release: Object.freeze({ curve: 1, durationSecond: 0.4 }),
      }),
      selector: Object.freeze({ kind: 'midi-range', minimumPitch: 48, maximumPitch: 59 }),
      startOffsetSecond: 0.25,
      tuneCent: 50,
    }),
    createZone('exact', 60),
    createZone('continuous', 61, {
      loop: Object.freeze({ kind: 'continuous', startSecond: 1, endSecond: 2 }),
    }),
    createZone('sustain', 62, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: null, durationSecond: 0 }),
        release: Object.freeze({ curve: null, durationSecond: 0.5 }),
      }),
      loop: Object.freeze({ kind: 'sustain', startSecond: 1, endSecond: 2 }),
      startOffsetSecond: 0.25,
    }),
    createZone('one-shot', 63, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: null, durationSecond: 0 }),
        release: null,
      }),
      triggerMode: 'one-shot',
    }),
    createZone('fast-old', 64, {
      exclusiveGroup: Object.freeze({ groupId: 1, offByGroupId: 2, offMode: 'fast' }),
    }),
    createZone('fast-new', 65, {
      exclusiveGroup: Object.freeze({ groupId: 2, offByGroupId: 1, offMode: 'fast' }),
    }),
    createZone('normal-old', 66, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: null, durationSecond: 0 }),
        release: Object.freeze({ curve: null, durationSecond: 0.4 }),
      }),
      exclusiveGroup: Object.freeze({ groupId: 3, offByGroupId: 4, offMode: 'normal' }),
    }),
    createZone('normal-new', 67, {
      exclusiveGroup: Object.freeze({ groupId: 4, offByGroupId: 3, offMode: 'fast' }),
    }),
    createZone('normal-sustain-old', 68, {
      amplitudeEnvelope: Object.freeze({
        attack: Object.freeze({ curve: null, durationSecond: 0 }),
        release: Object.freeze({ curve: null, durationSecond: 0.4 }),
      }),
      exclusiveGroup: Object.freeze({ groupId: 5, offByGroupId: 6, offMode: 'normal' }),
      loop: Object.freeze({ kind: 'sustain', startSecond: 1, endSecond: 2 }),
    }),
    createZone('normal-sustain-new', 69, {
      exclusiveGroup: Object.freeze({ groupId: 6, offByGroupId: 5, offMode: 'fast' }),
    }),
  ])
}

function createInstrument(
  zones: readonly SampleInstrumentZoneV1[] = createVoiceZones(),
  audioBuffer = createFakeAudioBuffer(),
): SampleInstrument {
  const manifest = Object.freeze({
    displayName: 'Fixture Voice Bank',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: SOUNDBANK_ID,
    zones,
  }) as SampleInstrumentManifestV1
  return Object.freeze({
    manifest,
    resources: new Map(
      zones.map((zone) => [
        zone.resource.key,
        Object.freeze({ audioBuffer, encodedByteLength: 1_024, key: zone.resource.key }),
      ]),
    ),
  })
}

type VoicePlanOverrides = Omit<
  Partial<ScheduledSampleVoicePlan>,
  | 'instrumentDeviceId'
  | 'keyReleasePlaybackClockSecond'
  | 'masterGain'
  | 'pan'
  | 'releasePlaybackClockSecond'
  | 'startPlaybackClockSecond'
  | 'trackGain'
  | 'velocity'
> & {
  readonly instrumentDeviceId?: string
  readonly keyReleasePlaybackClockSecond?: number
  readonly masterGain?: number
  readonly pan?: number
  readonly releasePlaybackClockSecond?: number
  readonly startPlaybackClockSecond?: number
  readonly trackGain?: number
  readonly velocity?: number
}

function createPlan(
  occurrenceKey: string,
  pitch: number,
  overrides: VoicePlanOverrides = {},
): ScheduledSampleVoicePlan {
  const releasePlaybackClockSecond = overrides.releasePlaybackClockSecond ?? 6
  return Object.freeze({
    channel: 0,
    instrumentDeviceId: 'fixture-device',
    kind: 'sample-voice',
    keyReleasePlaybackClockSecond:
      overrides.keyReleasePlaybackClockSecond ?? releasePlaybackClockSecond,
    masterGain: 0.9,
    occurrenceKey,
    pan: -0.25,
    pitch,
    releasePlaybackClockSecond,
    soundbankId: SOUNDBANK_ID,
    startPlaybackClockSecond: 4,
    timing: 'on-time',
    trackGain: 0.8,
    trackId: 'fixture-track',
    velocity: 64,
    ...overrides,
  }) as unknown as ScheduledSampleVoicePlan
}

function createRuntime(
  options: {
    readonly createGain?: () => FakeGainNode
    readonly currentTime?: number
    readonly instrument?: SampleInstrument
    readonly setMasterGainAtTime?: ActiveWebAudioOutput['setMasterGainAtTime']
    readonly stereoPannerAvailable?: boolean
  } = {},
) {
  const context = new FakeAudioContext({
    createGain: options.createGain,
    currentTime: options.currentTime ?? 0,
    stereoPannerAvailable: options.stereoPannerAvailable,
  })
  const master = new FakeGainNode()
  const setMasterGainAtTime =
    options.setMasterGainAtTime ??
    vi.fn<ActiveWebAudioOutput['setMasterGainAtTime']>((gain: number, time: number) =>
      master.gain.setValueAtTime(gain, Math.max(time, context.currentTime)),
    )
  const output: ActiveWebAudioOutput = Object.freeze({
    audioContext: context.asAudioContext(),
    isRunning: () => context.state === 'running',
    masterInput: master as unknown as AudioNode,
    setMasterGainAtTime,
  })
  const runtime = new SampleInstrumentVoiceRuntime({ output })
  const instrument = options.instrument ?? createInstrument()
  const schedule = (plan: ScheduledSampleVoicePlan) => runtime.schedule(plan, instrument)
  return { context, master, runtime, schedule, setMasterGainAtTime }
}

const EMPTY_STATISTICS = Object.freeze({
  activeVoiceCount: 0,
  connectedNodeCount: 0,
  endedListenerCount: 0,
  sourceNodeCount: 0,
})

describe('Sample Instrument Voice Runtime', () => {
  it('selects a range Zone and schedules pitch, offset, velocity, gain, pan, and envelope', () => {
    const { context, runtime, schedule, setMasterGainAtTime } = createRuntime({ currentTime: 5 })

    const voice = schedule(createPlan('range-note', 50, { keyReleasePlaybackClockSecond: 5.5 }))

    const expectedRate = 2 ** (2.5 / 12)
    const expectedGain = 0.26577656381975606 * 0.8
    expect(voice?.isActive()).toBe(true)
    expect(context.bufferSources[0]).toMatchObject({
      loop: false,
      starts: [{ duration: null, offset: 0.25, when: 5 }],
    })
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(6.4 + STOP_SAFETY_SECOND)
    expect(context.bufferSources[0]?.playbackRate.events).toEqual([
      { kind: 'set', time: 5, value: expectedRate },
    ])
    expect(context.pannerNodes[0]?.pan.events).toEqual([{ kind: 'set', time: 5, value: -0.25 }])
    expect(context.gainNodes[0]?.gain.events[0]).toEqual({ kind: 'set', time: 5, value: 0 })
    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'linear-ramp',
      time: 5.2,
      value: expectedGain,
    })
    expect(context.gainNodes[0]?.gain.events.at(-1)).toEqual({
      kind: 'linear-ramp',
      time: 6.4,
      value: 0,
    })
    expect(context.gainNodes[0]?.gain.events).not.toContainEqual(
      expect.objectContaining({ time: 5.5 }),
    )
    expect(setMasterGainAtTime).toHaveBeenCalledWith(0.9, 5)
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 1,
      connectedNodeCount: 3,
      endedListenerCount: 1,
      sourceNodeCount: 1,
    })

    context.bufferSources[0]?.finish()
    expect(voice?.isActive()).toBe(false)
    expect(runtime.statistics).toEqual(EMPTY_STATISTICS)
  })

  it('keeps a continuous loop active through pedal hold and stops after final release', () => {
    const { context, schedule, setMasterGainAtTime } = createRuntime()

    schedule(
      createPlan('continuous-note', 61, {
        startPlaybackClockSecond: 1,
        keyReleasePlaybackClockSecond: 2,
        releasePlaybackClockSecond: 3,
      }),
    )

    expect(context.bufferSources[0]).toMatchObject({
      loop: true,
      loopStart: 1,
      loopEnd: 2,
      starts: [{ duration: null, offset: 0, when: 1 }],
    })
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(3.3 + STOP_SAFETY_SECOND)
    expect(setMasterGainAtTime).toHaveBeenCalledWith(0.9, 0)
  })

  it('moves the master gain only when a plan brings another one', () => {
    const setMasterGainAtTime = vi.fn<ActiveWebAudioOutput['setMasterGainAtTime']>()
    const { schedule } = createRuntime({ setMasterGainAtTime })

    schedule(createPlan('first-master', 60))
    schedule(createPlan('same-master', 61))
    schedule(createPlan('louder-master', 62, { masterGain: 1 }))

    expect(setMasterGainAtTime.mock.calls).toEqual([
      [0.9, 0],
      [1, 0],
    ])
  })

  it('falls back to a centered Gain output only when StereoPanner is unavailable', () => {
    const centered = createRuntime({ stereoPannerAvailable: false })

    expect(centered.schedule(createPlan('centered-note', 60, { pan: 0 }))).not.toBeNull()
    expect(centered.context.gainNodes).toHaveLength(2)
    expect(centered.runtime.statistics.connectedNodeCount).toBe(3)

    const panned = createRuntime({ stereoPannerAvailable: false })
    expect(() => panned.schedule(createPlan('panned-note', 60))).toThrow(
      'Stereo panning is unavailable',
    )
    expect(panned.runtime.statistics.activeVoiceCount).toBe(0)
  })

  it('switches a sustain loop to an unlooped tail at final release after pedal hold', () => {
    const { context, runtime, schedule } = createRuntime()

    schedule(
      createPlan('sustain-note', 62, {
        startPlaybackClockSecond: 10,
        keyReleasePlaybackClockSecond: 11,
        releasePlaybackClockSecond: 12,
      }),
    )

    expect(context.bufferSources).toHaveLength(2)
    expect(context.bufferSources[0]).toMatchObject({
      loop: true,
      loopStart: 1,
      loopEnd: 2,
      starts: [{ duration: null, offset: 0.25, when: 10 }],
      stops: [12],
    })
    expect(context.bufferSources[1]).toMatchObject({
      loop: false,
      starts: [{ duration: null, offset: 1.25, when: 12 }],
      stops: [12.5 + STOP_SAFETY_SECOND],
    })
    expect(runtime.statistics.sourceNodeCount).toBe(2)

    context.bufferSources[0]?.finish()
    expect(runtime.statistics.activeVoiceCount).toBe(1)
    context.bufferSources[1]?.finish()
    expect(runtime.statistics.activeVoiceCount).toBe(0)
  })

  it('does not reinterpret one-shot behavior when a pedal-derived release is supplied', () => {
    const { context, schedule } = createRuntime()
    const voice = schedule(
      createPlan('one-shot-note', 63, {
        startPlaybackClockSecond: 1,
        keyReleasePlaybackClockSecond: 1.5,
        releasePlaybackClockSecond: 2,
      }),
    )!

    expect(context.bufferSources[0]?.stops).toEqual([])
    expect(context.gainNodes[0]?.gain.events).toEqual([
      { kind: 'set', time: 1, value: 0 },
      { kind: 'set', time: 1, value: 0.26577656381975606 * 0.8 },
    ])
    voice.cancel(parsePlaybackClockSecond(2.5))
    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'cancel-and-hold',
      time: 2.5,
    })
    expect(context.bufferSources[0]?.stops).toHaveLength(1)
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(
      2.5 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )

    context.bufferSources[0]?.finish()
    expect(voice.isActive()).toBe(false)
    voice.cancel()
    expect(context.bufferSources[0]?.stops).toHaveLength(1)
  })

  it('reschedules a gated Note Off before release without recreating its active Voice', () => {
    const { context, schedule } = createRuntime({ currentTime: 2 })
    const voice = schedule(
      createPlan('rescheduled-note', 50, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 6,
      }),
    )!

    voice.rescheduleRelease(parsePlaybackClockSecond(8))
    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'cancel-and-hold',
      time: 6,
    })
    expect(context.gainNodes[0]?.gain.events.at(-1)).toEqual({
      kind: 'linear-ramp',
      time: 8.4,
      value: 0,
    })
    expect(context.bufferSources).toHaveLength(1)
    expect(context.bufferSources[0]?.stops).toHaveLength(2)
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(6.4 + STOP_SAFETY_SECOND)
    expect(context.bufferSources[0]?.stops[1]).toBeCloseTo(8.4 + STOP_SAFETY_SECOND)

    context.bufferSources[0]?.finish()
    expect(voice.isActive()).toBe(false)
    voice.rescheduleRelease(parsePlaybackClockSecond(9))
    expect(context.bufferSources[0]?.stops).toHaveLength(2)
  })

  it('replaces a future sustain-loop tail when its Note Off moves', () => {
    const { context, schedule } = createRuntime({ currentTime: 2 })
    const voice = schedule(
      createPlan('rescheduled-sustain-note', 62, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 5,
      }),
    )!

    voice.rescheduleRelease(parsePlaybackClockSecond(7))
    expect(context.bufferSources).toHaveLength(3)
    expect(context.bufferSources[0]?.stops).toEqual([5, 7])
    expect(context.bufferSources[1]).toMatchObject({
      disconnectCallCount: 1,
      starts: [{ duration: null, offset: 1.25, when: 5 }],
      stops: [5.5 + STOP_SAFETY_SECOND, 2],
    })
    expect(context.bufferSources[2]).toMatchObject({
      loop: false,
      starts: [{ duration: null, offset: 1.25, when: 7 }],
      stops: [7.5 + STOP_SAFETY_SECOND],
    })
  })

  it('does not resurrect a release tail or reinterpret one-shot Note length', () => {
    const released = createRuntime({ currentTime: 6 })
    const gated = released.schedule(
      createPlan('already-released-note', 60, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 7,
      }),
    )!
    const gatedEvents = [...released.context.gainNodes[0]!.gain.events]
    released.context.currentTime = 7
    gated.rescheduleRelease(parsePlaybackClockSecond(9))
    expect(released.context.gainNodes[0]?.gain.events).toEqual(gatedEvents)
    expect(released.context.bufferSources[0]?.stops).toEqual([7.3 + STOP_SAFETY_SECOND])

    const oneShot = createRuntime({ currentTime: 1 })
    const oneShotVoice = oneShot.schedule(
      createPlan('one-shot-resize', 63, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 2,
      }),
    )!
    const oneShotEvents = [...oneShot.context.gainNodes[0]!.gain.events]
    oneShotVoice.rescheduleRelease(parsePlaybackClockSecond(3))
    expect(oneShot.context.gainNodes[0]?.gain.events).toEqual(oneShotEvents)
    expect(oneShot.context.bufferSources[0]?.stops).toEqual([])
  })

  it('starts normal release now when a resized Note end has already passed', () => {
    const { context, schedule } = createRuntime({ currentTime: 1 })
    const voice = schedule(
      createPlan('shortened-active-note', 60, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 6,
      }),
    )!
    context.currentTime = 3

    voice.rescheduleRelease(parsePlaybackClockSecond(2))
    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'cancel-and-hold',
      time: 3,
    })
    expect(context.bufferSources[0]?.stops).toHaveLength(2)
    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(3.3 + STOP_SAFETY_SECOND)

    // The release has started; a later Note end cannot bring the Voice back.
    voice.rescheduleRelease(parsePlaybackClockSecond(8))
    expect(context.bufferSources[0]?.stops).toHaveLength(2)
  })

  it('applies fast and normal exclusive-group release modes to older voices', () => {
    const { context, schedule } = createRuntime()
    schedule(
      createPlan('fast-old-note', 64, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 10,
      }),
    )
    schedule(
      createPlan('fast-new-note', 65, {
        startPlaybackClockSecond: 2,
        releasePlaybackClockSecond: 10,
      }),
    )
    schedule(
      createPlan('normal-old-note', 66, {
        startPlaybackClockSecond: 3,
        releasePlaybackClockSecond: 10,
      }),
    )
    schedule(
      createPlan('normal-new-note', 67, {
        startPlaybackClockSecond: 4,
        releasePlaybackClockSecond: 10,
      }),
    )

    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'linear-ramp',
      time: 2 + FAST_RELEASE_SECOND,
      value: 0,
    })
    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(
      2 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )
    expect(context.gainNodes[2]?.gain.events).toContainEqual({
      kind: 'linear-ramp',
      time: 4.4,
      value: 0,
    })
    expect(context.bufferSources[2]?.stops.at(-1)).toBeCloseTo(4.4 + STOP_SAFETY_SECOND)
  })

  it('fast-chokes an older one-shot voice when another member of its symmetric group starts', () => {
    const hiHatGroup = Object.freeze({ groupId: 7, offByGroupId: 7, offMode: 'fast' as const })
    const zones = Object.freeze([
      createZone('one-shot-open-hat', 70, {
        exclusiveGroup: hiHatGroup,
        triggerMode: 'one-shot',
      }),
      createZone('one-shot-closed-hat', 71, {
        exclusiveGroup: hiHatGroup,
        triggerMode: 'one-shot',
      }),
    ])
    const { context, schedule } = createRuntime({ instrument: createInstrument(zones) })

    schedule(
      createPlan('open-hat', 70, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 1.05,
      }),
    )
    schedule(
      createPlan('closed-hat', 71, {
        startPlaybackClockSecond: 2,
        releasePlaybackClockSecond: 2.05,
      }),
    )

    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'linear-ramp',
      time: 2 + FAST_RELEASE_SECOND,
      value: 0,
    })
    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(
      2 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )
    expect(context.bufferSources[1]?.stops).toEqual([])
  })

  it('moves a sustain loop into its unlooped tail when normal mutex release starts early', () => {
    const { context, schedule } = createRuntime()
    schedule(
      createPlan('normal-sustain-old-note', 68, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 10,
      }),
    )
    schedule(
      createPlan('normal-sustain-new-note', 69, {
        startPlaybackClockSecond: 4,
        releasePlaybackClockSecond: 10,
      }),
    )

    expect(context.bufferSources).toHaveLength(4)
    expect(context.bufferSources[0]).toMatchObject({ loop: true })
    expect(context.bufferSources[0]?.stops.at(-1)).toBe(4)
    // The tail planned for the old Note's release at 10 is dropped before it can start.
    expect(context.bufferSources[1]).toMatchObject({
      disconnectCallCount: 1,
      loop: false,
      starts: [{ duration: null, offset: 1, when: 10 }],
    })
    expect(context.bufferSources[1]?.stops.at(-1)).toBe(0)
    expect(context.bufferSources[3]).toMatchObject({
      loop: false,
      starts: [{ duration: null, offset: 1, when: 4 }],
    })
    expect(context.bufferSources[3]?.playbackRate.events).toEqual([
      { kind: 'set', time: 4, value: 1 },
    ])
    expect(context.bufferSources[3]?.stops[0]).toBeCloseTo(4.4 + STOP_SAFETY_SECOND)
  })

  it('drops plans that cannot sound and keeps every scheduled Voice independent', () => {
    const { context, runtime, schedule } = createRuntime({ currentTime: 2 })

    expect(
      schedule(
        createPlan('expired-note', 60, {
          startPlaybackClockSecond: 0,
          releasePlaybackClockSecond: 1,
        }),
      ),
    ).toBeNull()
    expect(schedule(createPlan('no-zone-note', 80))).toBeNull()
    expect(context.bufferSources).toHaveLength(0)

    const first = schedule(
      createPlan('shared-occurrence', 60, {
        startPlaybackClockSecond: 2,
        releasePlaybackClockSecond: 8,
      }),
    )!
    const second = schedule(
      createPlan('shared-occurrence', 60, {
        startPlaybackClockSecond: 3,
        releasePlaybackClockSecond: 8,
      }),
    )!
    first.cancel()

    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(
      2 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )
    expect(context.bufferSources[1]?.stops).toEqual([8.3 + STOP_SAFETY_SECOND])
    expect(second.isActive()).toBe(true)
    expect(runtime.statistics.activeVoiceCount).toBe(2)
  })

  it('bounds one Instrument to 64 sounding Voices and 16 fast-release retirement tails', () => {
    const { context, runtime, schedule } = createRuntime()
    const voices = Array.from({ length: 81 }, (_, index) =>
      schedule(
        createPlan(`instrument-polyphony-${String(index).padStart(3, '0')}`, 60, {
          instrumentDeviceId: 'polyphony-instrument-a',
          releasePlaybackClockSecond: 10,
          startPlaybackClockSecond: index < 64 ? 1 : 2,
          trackGain: 1,
          velocity: 127,
        }),
      ),
    )

    expect(voices.slice(0, 80).every((voice) => voice !== null)).toBe(true)
    expect(voices[80]).toBeNull()
    expect(context.bufferSources).toHaveLength(80)
    expect(runtime.statistics.activeVoiceCount).toBe(80)
    expect(runtime.polyphonyStatistics).toEqual({
      polyphonyDropCount: 1,
      retirementVoiceCount: 16,
      soundingVoiceCount: 64,
      voiceStealCount: 16,
    })
    for (let index = 0; index < 16; index += 1) {
      expect(context.bufferSources[index]?.stops.at(-1)).toBeCloseTo(
        2 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
      )
    }

    for (const source of context.bufferSources) source.finish()
    expect(runtime.polyphonyStatistics).toEqual({
      polyphonyDropCount: 1,
      retirementVoiceCount: 0,
      soundingVoiceCount: 0,
      voiceStealCount: 16,
    })
  })

  it('steals a pedal-held Voice before a quieter key-held Voice', () => {
    const { context, runtime, schedule } = createRuntime()
    const initialPlans = Array.from({ length: 64 }, (_, index) =>
      createPlan(`expression-priority-${String(index).padStart(3, '0')}`, 60, {
        keyReleasePlaybackClockSecond: index === 0 ? 2 : 10,
        releasePlaybackClockSecond: 10,
        startPlaybackClockSecond: 1,
        trackGain: 1,
        velocity: index === 0 ? 127 : 1,
      }),
    )
    for (const plan of initialPlans) expect(schedule(plan)).not.toBeNull()

    expect(
      schedule(
        createPlan('expression-priority-new', 60, {
          keyReleasePlaybackClockSecond: 10,
          releasePlaybackClockSecond: 10,
          startPlaybackClockSecond: 4,
          trackGain: 1,
          velocity: 127,
        }),
      ),
    ).not.toBeNull()

    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(
      4 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )
    expect(context.bufferSources[1]?.stops.at(-1)).toBeCloseTo(10.3 + STOP_SAFETY_SECOND)
    expect(runtime.polyphonyStatistics).toEqual({
      polyphonyDropCount: 0,
      retirementVoiceCount: 1,
      soundingVoiceCount: 64,
      voiceStealCount: 1,
    })
  })

  it('applies the 128 Voice budget across distinct Instrument devices', () => {
    const { context, runtime, schedule } = createRuntime()
    const initialPlans = Array.from({ length: 128 }, (_, index) =>
      createPlan(`runtime-polyphony-${String(index).padStart(3, '0')}`, 60, {
        instrumentDeviceId: index < 64 ? 'polyphony-instrument-a' : 'polyphony-instrument-b',
        releasePlaybackClockSecond: 10,
        startPlaybackClockSecond: 1,
        trackGain: 1,
        velocity: 127,
      }),
    )
    for (const plan of initialPlans) expect(schedule(plan)).not.toBeNull()

    expect(
      schedule(
        createPlan('runtime-polyphony-new', 60, {
          instrumentDeviceId: 'polyphony-instrument-c',
          releasePlaybackClockSecond: 10,
          startPlaybackClockSecond: 2,
          trackGain: 1,
          velocity: 127,
        }),
      ),
    ).not.toBeNull()

    expect(context.bufferSources).toHaveLength(129)
    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(
      2 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )
    expect(runtime.polyphonyStatistics).toEqual({
      polyphonyDropCount: 0,
      retirementVoiceCount: 1,
      soundingVoiceCount: 128,
      voiceStealCount: 1,
    })
  })

  it('fades every Voice on allNotesOff and disposes without residual listeners or nodes', () => {
    const { context, runtime, schedule } = createRuntime()
    schedule(createPlan('first', 60))
    schedule(createPlan('second', 61))

    runtime.allNotesOff(1)
    for (const source of context.bufferSources) {
      expect(source.stops.at(-1)).toBeCloseTo(1 + FAST_RELEASE_SECOND + STOP_SAFETY_SECOND)
    }
    // Voices already fading keep their earlier release.
    runtime.allNotesOff(2)
    expect(context.bufferSources.map(({ stops }) => stops.length)).toEqual([2, 2])

    runtime.dispose()
    runtime.dispose()
    expect(runtime.statistics).toEqual(EMPTY_STATISTICS)
    expect(context.endedListenerCount).toBe(0)
    expect(
      context.bufferSources.every(({ disconnectCallCount }) => disconnectCallCount === 1),
    ).toBe(true)
    expect(() => runtime.allNotesOff()).not.toThrow()
    expect(() => schedule(createPlan('after-dispose', 60))).toThrow('Sample voices are disposed')
  })

  it('fails closed and cleans a partially scheduled graph when master scheduling fails', () => {
    const setMasterGainAtTime = vi.fn<ActiveWebAudioOutput['setMasterGainAtTime']>(() => {
      throw new TypeError('fixture master failure')
    })
    const { context, runtime, schedule } = createRuntime({ setMasterGainAtTime })

    expect(() => schedule(createPlan('failed-voice', 60))).toThrow(
      'Voice failed-voice could not be scheduled: fixture master failure',
    )
    expect(runtime.statistics).toEqual(EMPTY_STATISTICS)
    expect(context.bufferSources[0]?.stops).toEqual([6.3 + STOP_SAFETY_SECOND, 0])
    expect(context.endedListenerCount).toBe(0)
  })

  it('surfaces a browser node creation failure without retaining a Voice', () => {
    const { runtime, schedule } = createRuntime({
      createGain: () => {
        throw new TypeError('fixture node creation failure')
      },
    })

    expect(() => schedule(createPlan('node-failure', 60))).toThrow('fixture node creation failure')
    expect(runtime.statistics.activeVoiceCount).toBe(0)
  })

  it('detaches a Voice whose release automation fails', () => {
    const { context, runtime, schedule } = createRuntime()
    const voice = schedule(createPlan('release-failure', 60))!
    context.gainNodes[0]!.gain.cancelAndHoldFailure = new TypeError('fixture automation failure')

    expect(() => voice.cancel()).toThrow(
      'Voice release-failure release could not be scheduled: fixture automation failure',
    )
    expect(voice.isActive()).toBe(false)
    expect(runtime.statistics).toEqual(EMPTY_STATISTICS)
    expect(context.endedListenerCount).toBe(0)
  })

  it('continues allNotesOff cleanup after one Voice release fails', () => {
    const { context, runtime, schedule } = createRuntime()
    schedule(createPlan('release-failure-first', 60))
    schedule(createPlan('release-failure-second', 61))
    context.gainNodes[0]!.gain.cancelAndHoldFailure = new TypeError('fixture automation failure')

    expect(() => runtime.allNotesOff()).toThrow(
      'Voice release-failure-first release could not be scheduled',
    )
    expect(runtime.statistics.activeVoiceCount).toBe(1)
    expect(context.bufferSources[1]?.stops.at(-1)).toBeCloseTo(
      FAST_RELEASE_SECOND + STOP_SAFETY_SECOND,
    )
    context.bufferSources[1]?.finish()
    expect(runtime.statistics).toEqual(EMPTY_STATISTICS)
  })

  it('rejects a Zone without its loaded resource before retaining a Voice', () => {
    const { runtime } = createRuntime()
    const instrument = Object.freeze({ ...createInstrument(), resources: new Map() })

    expect(() => runtime.schedule(createPlan('missing-resource', 60), instrument)).toThrow(
      'fixture-voice-bank has no loaded resource samples/exact.wav',
    )
    expect(runtime.statistics.activeVoiceCount).toBe(0)
  })
})
