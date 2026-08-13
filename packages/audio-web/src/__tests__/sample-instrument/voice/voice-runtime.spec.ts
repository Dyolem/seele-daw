import { parseSoundbankId, type ScheduledSampleVoicePlan } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'
import {
  SampleInstrumentVoiceRuntime,
  type SampleInstrumentVoiceRuntimeError,
} from '#internal/sample-instrument/voice/voice-runtime'
import {
  FakeAudioContext,
  FakeGainNode,
  createFakeAudioBuffer,
} from '#internal/__tests__/support/fake-web-audio'

const SOUNDBANK_ID = parseSoundbankId('fixture-voice-bank')

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

function createPreparedResources(
  zones: readonly SampleInstrumentZoneV1[] = createVoiceZones(),
  audioBuffer = createFakeAudioBuffer(),
): PreparedAudibleMidiSampleResources {
  const manifest = Object.freeze({
    displayName: 'Fixture Voice Bank',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: SOUNDBANK_ID,
    zones,
  }) as SampleInstrumentManifestV1
  return Object.freeze({
    instruments: Object.freeze([
      Object.freeze({
        manifest,
        resources: Object.freeze(
          zones.map((zone) =>
            Object.freeze({
              audioBuffer,
              encodedByteLength: 1_024,
              key: zone.resource.key,
            }),
          ),
        ),
        soundbankId: SOUNDBANK_ID,
      }),
    ]),
    modelRevision: 1,
  }) as unknown as PreparedAudibleMidiSampleResources
}

type VoicePlanOverrides = Omit<
  Partial<ScheduledSampleVoicePlan>,
  'pan' | 'releasePlaybackClockSecond' | 'startPlaybackClockSecond'
> & {
  readonly pan?: number
  readonly releasePlaybackClockSecond?: number
  readonly startPlaybackClockSecond?: number
}

function createPlan(
  occurrenceKey: string,
  pitch: number,
  overrides: VoicePlanOverrides = {},
): ScheduledSampleVoicePlan {
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: 'fixture-device',
    kind: 'sample-voice',
    masterGain: 0.9,
    occurrenceKey,
    pan: -0.25,
    pitch,
    releasePlaybackClockSecond: 6,
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
    readonly preparedResources?: PreparedAudibleMidiSampleResources
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
    masterInput: master as unknown as AudioNode,
    setMasterGainAtTime,
  })
  const runtime = new SampleInstrumentVoiceRuntime({
    output,
    preparedResources: options.preparedResources ?? createPreparedResources(),
  })
  runtime.activateGeneration(1 as ScheduledSampleVoicePlan['engineGeneration'])
  return { context, master, runtime, setMasterGainAtTime }
}

describe('Sample Instrument Voice Runtime', () => {
  it('selects a range Zone and schedules pitch, offset, velocity, gain, pan, and envelope', () => {
    const { context, runtime, setMasterGainAtTime } = createRuntime({ currentTime: 5 })

    const result = runtime.schedule(createPlan('range-note', 50))

    const expectedRate = 2 ** (2.5 / 12)
    const expectedGain = (64 / 127) * 0.8
    expect(result).toEqual({
      outcome: 'scheduled',
      playbackRate: expectedRate,
      token: { engineGeneration: 1, occurrenceKey: 'range-note' },
      zoneId: 'range',
    })
    expect(context.bufferSources[0]).toMatchObject({
      loop: false,
      starts: [{ duration: null, offset: 0.25, when: 5 }],
    })
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(6.401)
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
    expect(setMasterGainAtTime).toHaveBeenCalledWith(0.9, 5)
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 1,
      connectedNodeCount: 3,
      endedListenerCount: 1,
      sourceNodeCount: 1,
    })

    context.bufferSources[0]?.finish()
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 0,
      connectedNodeCount: 0,
      endedListenerCount: 0,
      sourceNodeCount: 0,
    })
  })

  it('keeps a continuous loop active through release and stops after its release tail', () => {
    const { context, runtime, setMasterGainAtTime } = createRuntime()

    runtime.schedule(
      createPlan('continuous-note', 61, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 3,
      }),
    )

    expect(context.bufferSources[0]).toMatchObject({
      loop: true,
      loopStart: 1,
      loopEnd: 2,
      starts: [{ duration: null, offset: 0, when: 1 }],
    })
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(3.301)
    expect(setMasterGainAtTime).toHaveBeenCalledWith(0.9, 0)
  })

  it('falls back to a centered Gain output only when StereoPanner is unavailable', () => {
    const centered = createRuntime({ stereoPannerAvailable: false })

    expect(centered.runtime.schedule(createPlan('centered-note', 60, { pan: 0 })).outcome).toBe(
      'scheduled',
    )
    expect(centered.context.gainNodes).toHaveLength(2)
    expect(centered.runtime.statistics.connectedNodeCount).toBe(3)

    const panned = createRuntime({ stereoPannerAvailable: false })
    expect(() => panned.runtime.schedule(createPlan('panned-note', 60))).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'audio-context-unavailable',
      }),
    )
    expect(panned.runtime.statistics.activeVoiceCount).toBe(0)
  })

  it('switches a sustain loop to an unlooped tail at Note Off', () => {
    const { context, runtime } = createRuntime()

    runtime.schedule(
      createPlan('sustain-note', 62, {
        startPlaybackClockSecond: 10,
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
      stops: [12.501],
    })
    expect(runtime.statistics.sourceNodeCount).toBe(2)

    context.bufferSources[0]?.finish()
    expect(runtime.statistics.activeVoiceCount).toBe(1)
    context.bufferSources[1]?.finish()
    expect(runtime.statistics.activeVoiceCount).toBe(0)
  })

  it('lets one-shot audio reach its natural end while explicit cancel still uses fast release', () => {
    const { context, runtime } = createRuntime()
    const result = runtime.schedule(
      createPlan('one-shot-note', 63, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 2,
      }),
    )

    expect(context.bufferSources[0]?.stops).toEqual([])
    expect(context.gainNodes[0]?.gain.events).toEqual([
      { kind: 'set', time: 1, value: 0 },
      { kind: 'set', time: 1, value: (64 / 127) * 0.8 },
    ])
    expect(runtime.cancel(result.token!, 2.5)).toBe(true)
    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'cancel-and-hold',
      time: 2.5,
    })
    expect(context.bufferSources[0]?.stops).toHaveLength(1)
    expect(context.bufferSources[0]?.stops[0]).toBeCloseTo(2.507)
    context.bufferSources[0]?.finish()
    expect(runtime.cancel(result.token!)).toBe(false)
  })

  it('applies fast and normal exclusive-group release modes to older voices', () => {
    const { context, runtime } = createRuntime()
    runtime.schedule(
      createPlan('fast-old-note', 64, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 10,
      }),
    )
    runtime.schedule(
      createPlan('fast-new-note', 65, {
        startPlaybackClockSecond: 2,
        releasePlaybackClockSecond: 10,
      }),
    )
    runtime.schedule(
      createPlan('normal-old-note', 66, {
        startPlaybackClockSecond: 3,
        releasePlaybackClockSecond: 10,
      }),
    )
    runtime.schedule(
      createPlan('normal-new-note', 67, {
        startPlaybackClockSecond: 4,
        releasePlaybackClockSecond: 10,
      }),
    )

    expect(context.gainNodes[0]?.gain.events).toContainEqual({
      kind: 'linear-ramp',
      time: 2.006,
      value: 0,
    })
    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(2.007)
    expect(context.gainNodes[2]?.gain.events).toContainEqual({
      kind: 'linear-ramp',
      time: 4.4,
      value: 0,
    })
    expect(context.bufferSources[2]?.stops.at(-1)).toBeCloseTo(4.401)
  })

  it('moves a sustain loop into its unlooped tail when normal mutex release starts early', () => {
    const { context, runtime } = createRuntime()
    runtime.schedule(
      createPlan('normal-sustain-old-note', 68, {
        startPlaybackClockSecond: 1,
        releasePlaybackClockSecond: 10,
      }),
    )
    runtime.schedule(
      createPlan('normal-sustain-new-note', 69, {
        startPlaybackClockSecond: 4,
        releasePlaybackClockSecond: 10,
      }),
    )

    expect(context.bufferSources).toHaveLength(4)
    expect(context.bufferSources[0]).toMatchObject({ loop: true })
    expect(context.bufferSources[0]?.stops.at(-1)).toBe(4)
    expect(context.bufferSources[1]).toMatchObject({ loop: false })
    expect(context.bufferSources[1]?.stops.at(-1)).toBe(4)
    expect(context.bufferSources[3]).toMatchObject({
      loop: false,
      starts: [{ duration: null, offset: 1, when: 4 }],
    })
    expect(context.bufferSources[3]?.playbackRate.events).toEqual([
      { kind: 'set', time: 4, value: 1 },
    ])
    expect(context.bufferSources[3]?.stops[0]).toBeCloseTo(4.401)
  })

  it('isolates generations and occurrence tokens while suppressing stale and expired plans', () => {
    const { context, runtime } = createRuntime({ currentTime: 2 })
    const active = runtime.schedule(
      createPlan('shared-occurrence', 60, {
        startPlaybackClockSecond: 2,
        releasePlaybackClockSecond: 8,
      }),
    )

    expect(() => runtime.schedule(createPlan('shared-occurrence', 60))).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'duplicate-voice-token',
      }),
    )
    expect(
      runtime.schedule(
        createPlan('stale-note', 60, {
          engineGeneration: 0 as ScheduledSampleVoicePlan['engineGeneration'],
        }),
      ),
    ).toEqual({
      outcome: 'stale-generation',
      playbackRate: null,
      token: null,
      zoneId: null,
    })
    expect(() =>
      runtime.schedule(
        createPlan('future-note', 60, {
          engineGeneration: 2 as ScheduledSampleVoicePlan['engineGeneration'],
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'generation-not-active',
      }),
    )
    expect(
      runtime.schedule(
        createPlan('expired-note', 60, {
          startPlaybackClockSecond: 0,
          releasePlaybackClockSecond: 1,
        }),
      ),
    ).toEqual({ outcome: 'expired', playbackRate: null, token: null, zoneId: null })

    expect(runtime.activateGeneration(2 as ScheduledSampleVoicePlan['engineGeneration'])).toBe(true)
    expect(context.bufferSources[0]?.stops.at(-1)).toBeCloseTo(2.007)
    expect(
      runtime.schedule(
        createPlan('shared-occurrence', 60, {
          engineGeneration: 2 as ScheduledSampleVoicePlan['engineGeneration'],
          startPlaybackClockSecond: 3,
          releasePlaybackClockSecond: 8,
        }),
      ).outcome,
    ).toBe('scheduled')
    expect(runtime.cancel(active.token!)).toBe(false)
  })

  it('supports allNotesOff and deterministic disposal without residual listeners or nodes', () => {
    const { context, runtime } = createRuntime()
    runtime.schedule(createPlan('first', 60))
    runtime.schedule(createPlan('second', 61))

    expect(runtime.allNotesOff(1)).toBe(2)
    expect(runtime.allNotesOff(2)).toBe(0)
    runtime.dispose()
    runtime.dispose()

    expect(runtime.statistics).toEqual({
      activeVoiceCount: 0,
      connectedNodeCount: 0,
      endedListenerCount: 0,
      sourceNodeCount: 0,
    })
    expect(context.endedListenerCount).toBe(0)
    expect(
      context.bufferSources.every(({ disconnectCallCount }) => disconnectCallCount === 1),
    ).toBe(true)
    expect(() => runtime.allNotesOff()).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({ code: 'disposed' }),
    )
  })

  it('fails closed and cleans a partially scheduled graph when master scheduling fails', () => {
    const setMasterGainAtTime = vi.fn<ActiveWebAudioOutput['setMasterGainAtTime']>(() => {
      throw new TypeError('fixture master failure')
    })
    const { context, runtime } = createRuntime({ setMasterGainAtTime })

    expect(() => runtime.schedule(createPlan('failed-voice', 60))).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'voice-create-failed',
      }),
    )
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 0,
      connectedNodeCount: 0,
      endedListenerCount: 0,
      sourceNodeCount: 0,
    })
    expect(context.bufferSources[0]?.stops).toEqual([6.301, 0])
    expect(context.endedListenerCount).toBe(0)
  })

  it('normalizes a browser node creation failure without retaining a Voice', () => {
    const { runtime } = createRuntime({
      createGain: () => {
        throw new TypeError('fixture node creation failure')
      },
    })

    expect(() => runtime.schedule(createPlan('node-failure', 60))).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'voice-create-failed',
      }),
    )
    expect(runtime.statistics.activeVoiceCount).toBe(0)
  })

  it('normalizes release automation failure and detaches the affected Voice', () => {
    const { context, runtime } = createRuntime()
    const result = runtime.schedule(createPlan('release-failure', 60))
    context.gainNodes[0]!.gain.cancelAndHoldFailure = new TypeError('fixture automation failure')

    expect(() => runtime.cancel(result.token!)).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'voice-create-failed',
      }),
    )
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 0,
      connectedNodeCount: 0,
      endedListenerCount: 0,
      sourceNodeCount: 0,
    })
    expect(context.endedListenerCount).toBe(0)
  })

  it('continues allNotesOff cleanup after one Voice release fails', () => {
    const { context, runtime } = createRuntime()
    runtime.schedule(createPlan('release-failure-first', 60))
    runtime.schedule(createPlan('release-failure-second', 61))
    context.gainNodes[0]!.gain.cancelAndHoldFailure = new TypeError('fixture automation failure')

    expect(() => runtime.allNotesOff()).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({
        code: 'voice-create-failed',
      }),
    )
    expect(runtime.statistics.activeVoiceCount).toBe(1)
    expect(context.bufferSources[1]?.stops.at(-1)).toBeCloseTo(0.007)
    context.bufferSources[1]?.finish()
    expect(runtime.statistics).toEqual({
      activeVoiceCount: 0,
      connectedNodeCount: 0,
      endedListenerCount: 0,
      sourceNodeCount: 0,
    })
  })

  it.each([
    {
      code: 'unsupported-pitch',
      preparedResources: createPreparedResources(),
      plan: createPlan('unsupported', 80),
    },
    {
      code: 'resource-duration-mismatch',
      preparedResources: createPreparedResources(createVoiceZones(), createFakeAudioBuffer(0.1)),
      plan: createPlan('duration-mismatch', 50),
    },
    {
      code: 'missing-resource',
      preparedResources: Object.freeze({
        ...createPreparedResources(),
        instruments: Object.freeze([
          Object.freeze({
            ...createPreparedResources().instruments[0],
            resources: Object.freeze([]),
          }),
        ]),
      }) as PreparedAudibleMidiSampleResources,
      plan: createPlan('missing-resource', 60),
    },
  ] as const)('rejects $code before retaining a Voice', ({ code, plan, preparedResources }) => {
    const { runtime } = createRuntime({ preparedResources })

    expect(() => runtime.schedule(plan)).toThrowError(
      expect.objectContaining<Partial<SampleInstrumentVoiceRuntimeError>>({ code }),
    )
    expect(runtime.statistics.activeVoiceCount).toBe(0)
  })
})
