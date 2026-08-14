import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type ModelRevision,
} from '@seele-daw/project-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import type { AudibleMidiProjectPlan, MidiNoteSpanPlan } from '#internal/compiler/audible-midi-plan'
import {
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  AudibleMidiSchedulerError,
  createAudibleMidiSchedulerPlanner,
  type AudibleMidiScheduleBatch,
  type AudibleMidiSchedulerConfiguration,
  type ScheduledSampleVoicePlan,
} from '#internal/scheduler/audible-midi-scheduler'
import {
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
} from '#internal/time/project-time'
import {
  AUDIBLE_MIDI_TRANSPORT_STATE,
  createAudibleMidiTransport,
} from '#internal/transport/audible-midi-transport'
import {
  createAudibleMidiProjectFixture,
  replaceCompilerFixtureSnapshot,
} from '#internal/__tests__/support/audible-midi-project-fixture'
import { ManualPlaybackClock } from '#internal/__tests__/support/manual-playback-clock'

function createFixturePlan(): AudibleMidiProjectPlan {
  return compileAudibleMidiProject(createAudibleMidiProjectFixture().snapshot)
}

function createConfiguration(
  wakeCadenceSecond = 0.05,
  lookAheadHorizonSecond = 0.25,
): AudibleMidiSchedulerConfiguration {
  return Object.freeze({
    lookAheadHorizonSecond: parsePlaybackClockDurationSecond(lookAheadHorizonSecond),
    wakeCadenceSecond: parsePlaybackClockDurationSecond(wakeCadenceSecond),
  })
}

function replacePlan(
  plan: AudibleMidiProjectPlan,
  overrides: Partial<AudibleMidiProjectPlan>,
): AudibleMidiProjectPlan {
  return Object.freeze({ ...plan, ...overrides })
}

describe('Audible MIDI Scheduler Planner', () => {
  it('plans a frozen first look-ahead batch from the Transport anchor', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration())

    const inactive = planner.planNextWindow(transport.getSnapshot())
    expect(inactive).toEqual({
      diagnostics: {
        duplicateSuppressionCount: 0,
        expiredSpanDropCount: 0,
        lateStartCount: 0,
      },
      engineGeneration: 0,
      modelRevision: plan.modelRevision,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.INACTIVE,
      planningPlaybackClockSecond: null,
      voicePlans: [],
      window: null,
    })

    transport.play()
    const batch = planner.planNextWindow(transport.getSnapshot())
    const firstSpan = plan.midiNoteSpans[0]
    const firstTrack = plan.tracks.find(({ trackId }) => trackId === firstSpan?.trackId)

    expect(batch).toMatchObject({
      diagnostics: {
        duplicateSuppressionCount: 0,
        expiredSpanDropCount: 0,
        lateStartCount: 0,
      },
      engineGeneration: 1,
      modelRevision: plan.modelRevision,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED,
      planningPlaybackClockSecond: 10,
      window: {
        fromPlaybackClockSecond: 10,
        toPlaybackClockSecond: 10.25,
      },
    })
    expect(batch.voicePlans).toEqual([
      {
        channel: firstSpan?.channel,
        engineGeneration: 1,
        instrumentDeviceId: firstTrack?.instrumentDeviceId,
        kind: 'sample-voice',
        masterGain: plan.master.gain,
        occurrenceKey: firstSpan?.occurrenceKey,
        pan: firstTrack?.pan,
        pitch: firstSpan?.pitch,
        releasePlaybackClockSecond: 10.5,
        soundbankId: firstTrack?.instrument.soundbankId,
        startPlaybackClockSecond: 10,
        timing: 'on-time',
        trackGain: firstTrack?.gain,
        trackId: firstSpan?.trackId,
        velocity: firstSpan?.velocity,
      },
    ])
    expect(Object.isFrozen(planner)).toBe(true)
    expect(Object.isFrozen(batch)).toBe(true)
    expect(Object.isFrozen(batch.window)).toBe(true)
    expect(Object.isFrozen(batch.voicePlans)).toBe(true)
    expect(Object.isFrozen(batch.voicePlans[0])).toBe(true)
    expect(Object.isFrozen(batch.diagnostics)).toBe(true)
    expectTypeOf(batch).toEqualTypeOf<AudibleMidiScheduleBatch>()
    expectTypeOf(batch.voicePlans[0]!).toEqualTypeOf<ScheduledSampleVoicePlan>()
  })

  it('advances contiguous half-open windows without scheduling a boundary occurrence twice', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration())

    transport.play()
    const first = planner.planNextWindow(transport.getSnapshot())
    clock.advanceBy(0.25)
    const secondSnapshot = transport.getSnapshot()
    const second = planner.planNextWindow(secondSnapshot)
    const repeated = planner.planNextWindow(secondSnapshot)
    clock.advanceBy(0.01)
    const thirdSnapshot = transport.getSnapshot()
    const third = planner.planNextWindow(thirdSnapshot)
    const thirdRepeated = planner.planNextWindow(thirdSnapshot)

    expect(first.window).toEqual({
      fromPlaybackClockSecond: 10,
      toPlaybackClockSecond: 10.25,
    })
    expect(second.window).toEqual({
      fromPlaybackClockSecond: 10.25,
      toPlaybackClockSecond: 10.5,
    })
    expect(second.voicePlans).toEqual([])
    expect(repeated).toMatchObject({
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.NO_CHANGE,
      voicePlans: [],
      window: null,
    })
    expect(third.window).toEqual({
      fromPlaybackClockSecond: 10.5,
      toPlaybackClockSecond: 10.51,
    })
    expect(third.voicePlans).toHaveLength(1)
    expect(third.voicePlans[0]).toMatchObject({
      occurrenceKey: plan.midiNoteSpans[1]?.occurrenceKey,
      startPlaybackClockSecond: 10.5,
    })
    expect(thirdRepeated.outcome).toBe(AUDIBLE_MIDI_SCHEDULER_OUTCOME.NO_CHANGE)
  })

  it('maps start and release targets through multiple Tempo Segments', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        tempoEvents: [
          createTempoEventRecord({
            bpm: parseTempoBpm(120),
            id: parseTempoEventId('tempo-scheduler-initial'),
            tick: parseTick(0),
          }),
          createTempoEventRecord({
            bpm: parseTempoBpm(60),
            id: parseTempoEventId('tempo-scheduler-later'),
            tick: parseTick(960),
          }),
        ],
      }),
    )
    const clock = new ManualPlaybackClock(20)
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration(0.1, 0.6))

    transport.play()
    const batch = planner.planNextWindow(transport.getSnapshot())

    expect(batch.window).toEqual({
      fromPlaybackClockSecond: 20,
      toPlaybackClockSecond: 20.6,
    })
    expect(batch.voicePlans).toHaveLength(2)
    expect(batch.voicePlans[0]).toMatchObject({
      startPlaybackClockSecond: 20,
      releasePlaybackClockSecond: 20.5,
    })
    expect(batch.voicePlans[1]).toMatchObject({
      startPlaybackClockSecond: 20.5,
      releasePlaybackClockSecond: 21,
    })
  })

  it('starts a late live Span immediately and drops a Span whose release already expired', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration(0.05, 0.2))

    transport.play()
    clock.advanceBy(0.6)
    const batch = planner.planNextWindow(transport.getSnapshot())

    expect(batch.window?.fromPlaybackClockSecond).toBe(10)
    expect(batch.window?.toPlaybackClockSecond).toBeCloseTo(10.8)
    expect(batch.diagnostics).toEqual({
      duplicateSuppressionCount: 0,
      expiredSpanDropCount: 1,
      lateStartCount: 1,
    })
    expect(batch.voicePlans).toEqual([
      expect.objectContaining({
        occurrenceKey: plan.midiNoteSpans[1]?.occurrenceKey,
        releasePlaybackClockSecond: 10.75,
        startPlaybackClockSecond: 10.6,
        timing: 'late-immediate',
      }),
    ])
  })

  it('resets on a new generation, does not chase a pre-anchor Note, and rejects stale snapshots', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(100)
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration(0.05, 0.3))

    transport.play()
    const generationOneSnapshot = transport.getSnapshot()
    planner.planNextWindow(generationOneSnapshot)

    clock.advanceBy(0.25)
    const paused = transport.pause().snapshot
    expect(planner.planNextWindow(paused)).toMatchObject({
      engineGeneration: 2,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.INACTIVE,
    })

    clock.advanceBy(5)
    const resumed = transport.play().snapshot
    const resumedBatch = planner.planNextWindow(resumed)

    expect(resumed).toMatchObject({
      anchorPlaybackClockSecond: 105.25,
      anchorProjectSecond: 0.25,
      engineGeneration: 3,
    })
    expect(resumedBatch.window).toEqual({
      fromPlaybackClockSecond: 105.25,
      toPlaybackClockSecond: 105.55,
    })
    expect(resumedBatch.voicePlans).toHaveLength(1)
    expect(resumedBatch.voicePlans[0]).toMatchObject({
      engineGeneration: 3,
      occurrenceKey: plan.midiNoteSpans[1]?.occurrenceKey,
      startPlaybackClockSecond: 105.5,
      timing: 'on-time',
    })
    expect(() => planner.planNextWindow(generationOneSnapshot)).toThrow(
      expect.objectContaining({ code: 'stale-engine-generation' }) as AudibleMidiSchedulerError,
    )
  })

  it('clamps the final window at Timeline End and becomes inactive after natural end', () => {
    const plan = replacePlan(createFixturePlan(), { timelineEndTick: parseTick(1_920) })
    const clock = new ManualPlaybackClock()
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration(0.1, 0.8))

    transport.play()
    const first = planner.planNextWindow(transport.getSnapshot())
    clock.advanceBy(0.2)
    const secondSnapshot = transport.getSnapshot()
    const second = planner.planNextWindow(secondSnapshot)
    const repeated = planner.planNextWindow(secondSnapshot)

    expect(first.voicePlans).toHaveLength(2)
    expect(second.window).toEqual({
      fromPlaybackClockSecond: 0.8,
      toPlaybackClockSecond: 1,
    })
    expect(second.voicePlans).toHaveLength(1)
    expect(second.voicePlans[0]?.occurrenceKey).toBe(plan.midiNoteSpans[2]?.occurrenceKey)
    expect(repeated.outcome).toBe(AUDIBLE_MIDI_SCHEDULER_OUTCOME.NO_CHANGE)

    clock.advanceBy(0.8)
    const ended = transport.getSnapshot()
    expect(ended.state).toBe(AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED)
    expect(planner.planNextWindow(ended)).toMatchObject({
      engineGeneration: 1,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.INACTIVE,
      voicePlans: [],
    })
  })

  it('keeps planning silent windows after authored content until the shared Timeline End', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock()
    const transport = createAudibleMidiTransport(plan, clock)
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration(0.1, 0.8))

    expect(plan.arrangementEndTick).toBe(1_920)
    expect(plan.timelineEndTick).toBe(576_000)
    transport.play()
    planner.planNextWindow(transport.getSnapshot())
    clock.advanceBy(1)
    const contentEndSnapshot = transport.getSnapshot()
    const silentWindow = planner.planNextWindow(contentEndSnapshot)

    expect(contentEndSnapshot).toMatchObject({
      positionProjectSecond: 1,
      positionTick: 1_920,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
    })
    expect(silentWindow).toMatchObject({
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED,
      voicePlans: [],
      window: {
        fromPlaybackClockSecond: 0.8,
        toPlaybackClockSecond: 1.8,
      },
    })
  })

  it('rejects invalid cadence and horizon relationships', () => {
    const plan = createFixturePlan()

    expect(() => createAudibleMidiSchedulerPlanner(plan, createConfiguration(0, 0.2))).toThrow(
      expect.objectContaining({
        code: 'invalid-scheduler-configuration',
      }) as AudibleMidiSchedulerError,
    )
    expect(() => createAudibleMidiSchedulerPlanner(plan, createConfiguration(0.2, 0.2))).toThrow(
      expect.objectContaining({
        code: 'invalid-scheduler-configuration',
      }) as AudibleMidiSchedulerError,
    )
  })

  it.each([
    [
      'duplicate-note-occurrence-key',
      (plan: AudibleMidiProjectPlan) =>
        replacePlan(plan, {
          midiNoteSpans: Object.freeze([plan.midiNoteSpans[0]!, plan.midiNoteSpans[0]!]),
        }),
    ],
    [
      'invalid-note-span-order',
      (plan: AudibleMidiProjectPlan) =>
        replacePlan(plan, { midiNoteSpans: Object.freeze([...plan.midiNoteSpans].reverse()) }),
    ],
    [
      'invalid-note-span',
      (plan: AudibleMidiProjectPlan) => {
        const firstSpan = plan.midiNoteSpans[0]!
        const invalidSpan: MidiNoteSpanPlan = Object.freeze({
          ...firstSpan,
          endTick: firstSpan.startTick,
        })
        return replacePlan(plan, { midiNoteSpans: Object.freeze([invalidSpan]) })
      },
    ],
    [
      'missing-track-route',
      (plan: AudibleMidiProjectPlan) => replacePlan(plan, { tracks: Object.freeze([]) }),
    ],
    [
      'timeline-end-before-arrangement-end',
      (plan: AudibleMidiProjectPlan) => replacePlan(plan, { timelineEndTick: parseTick(1_919) }),
    ],
  ] as const)('fails closed for malformed compiled plans with code %s', (code, createPlan) => {
    expect(() =>
      createAudibleMidiSchedulerPlanner(createPlan(createFixturePlan()), createConfiguration()),
    ).toThrow(expect.objectContaining({ code }) as AudibleMidiSchedulerError)
  })

  it('rejects Transport snapshots from a different plan or a remapped same generation', () => {
    const plan = createFixturePlan()
    const otherPlan = replacePlan(plan, {
      modelRevision: (plan.modelRevision + 1) as ModelRevision,
    })
    const otherTransport = createAudibleMidiTransport(otherPlan, new ManualPlaybackClock())
    const planner = createAudibleMidiSchedulerPlanner(plan, createConfiguration())

    expect(() => planner.planNextWindow(otherTransport.getSnapshot())).toThrow(
      expect.objectContaining({ code: 'transport-plan-mismatch' }) as AudibleMidiSchedulerError,
    )

    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(plan, clock)
    transport.play()
    const snapshot = transport.getSnapshot()
    planner.planNextWindow(snapshot)
    if (snapshot.state !== 'playing') throw new Error('Expected a Playing Transport snapshot')

    const remappedSnapshot = Object.freeze({
      ...snapshot,
      anchorPlaybackClockSecond: parsePlaybackClockSecond(snapshot.anchorPlaybackClockSecond + 1),
    })
    expect(() => planner.planNextWindow(remappedSnapshot)).toThrow(
      expect.objectContaining({
        code: 'transport-mapping-changed-without-generation',
      }) as AudibleMidiSchedulerError,
    )
  })

  it('copies Track routes and Note Spans instead of retaining mutable Plan records', () => {
    const compiledPlan = createFixturePlan()
    const mutableTracks = compiledPlan.tracks.map((track) => ({
      ...track,
      instrument: { ...track.instrument },
    }))
    const mutableSpans = compiledPlan.midiNoteSpans.map((span) => ({ ...span }))
    const mutablePlan = {
      ...compiledPlan,
      midiNoteSpans: mutableSpans,
      tracks: mutableTracks,
    }
    const planner = createAudibleMidiSchedulerPlanner(mutablePlan, createConfiguration())
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(compiledPlan, clock)

    Object.assign(mutableTracks[0]!, { gain: 0, pan: -1 })
    Object.assign(mutableTracks[0]!.instrument, { soundbankId: 'mutated-soundbank' })
    Object.assign(mutableSpans[0]!, { startTick: parseTick(1_900) })

    transport.play()
    const batch = planner.planNextWindow(transport.getSnapshot())
    expect(batch.voicePlans[0]).toMatchObject({
      occurrenceKey: compiledPlan.midiNoteSpans[0]?.occurrenceKey,
      soundbankId: compiledPlan.tracks[0]?.instrument.soundbankId,
      startPlaybackClockSecond: 10,
      trackGain: compiledPlan.tracks[0]?.gain,
    })
  })
})
