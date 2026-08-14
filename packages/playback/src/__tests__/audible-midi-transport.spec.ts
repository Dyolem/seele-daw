import {
  createMidiClipRecord,
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type ModelRevision,
} from '@seele-daw/project-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import {
  AUDIBLE_MIDI_PLAN_STATUS,
  type AudibleMidiProjectPlan,
} from '#internal/compiler/audible-midi-plan'
import {
  ProjectTimeError,
  parsePlaybackClockSecond,
  type PlaybackClockSecond,
} from '#internal/time/project-time'
import {
  AUDIBLE_MIDI_TRANSPORT_OUTCOME,
  AUDIBLE_MIDI_TRANSPORT_STATE,
  AudibleMidiTransportError,
  INITIAL_ENGINE_GENERATION,
  createAudibleMidiTransport,
  type AudibleMidiTransportSnapshot,
  type EngineGeneration,
  type PlaybackClock,
} from '#internal/transport/audible-midi-transport'
import {
  createAudibleMidiProjectFixture,
  replaceCompilerFixtureSnapshot,
} from '#internal/__tests__/support/audible-midi-project-fixture'
import { ManualPlaybackClock } from '#internal/__tests__/support/manual-playback-clock'

function createFixturePlan(): AudibleMidiProjectPlan {
  return compileAudibleMidiProject(createAudibleMidiProjectFixture().snapshot)
}

function replacePlan(
  plan: AudibleMidiProjectPlan,
  overrides: Partial<AudibleMidiProjectPlan>,
): AudibleMidiProjectPlan {
  return Object.freeze({ ...plan, ...overrides })
}

function nextModelRevision(plan: AudibleMidiProjectPlan): ModelRevision {
  return (plan.modelRevision + 1) as ModelRevision
}

function captureError(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected action to throw')
}

describe('Audible MIDI Transport', () => {
  it('starts as a frozen Stopped snapshot at the beginning of the compiled Timeline', () => {
    const plan = createFixturePlan()
    const transport = createAudibleMidiTransport(plan, new ManualPlaybackClock(10))
    const snapshot = transport.getSnapshot()

    expect(snapshot).toEqual({
      anchorPlaybackClockSecond: null,
      anchorProjectSecond: null,
      engineGeneration: INITIAL_ENGINE_GENERATION,
      modelRevision: plan.modelRevision,
      planStatus: AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE,
      positionProjectSecond: 0,
      positionTick: 0,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
      timelineEndProjectSecond: 300,
      timelineEndTick: 576_000,
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(transport)).toBe(true)
    expectTypeOf(snapshot).toEqualTypeOf<AudibleMidiTransportSnapshot>()
    expectTypeOf(snapshot.engineGeneration).toEqualTypeOf<EngineGeneration>()
  })

  it('maps Project position and Playback Clock across multiple Tempo Segments', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        tempoEvents: [
          createTempoEventRecord({
            bpm: parseTempoBpm(120),
            id: parseTempoEventId('tempo-transport-initial'),
            tick: parseTick(0),
          }),
          createTempoEventRecord({
            bpm: parseTempoBpm(60),
            id: parseTempoEventId('tempo-transport-later'),
            tick: parseTick(960),
          }),
        ],
      }),
    )
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(plan, clock)
    const played = transport.play()

    expect(played.outcome).toBe(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED)
    expect(played.snapshot).toMatchObject({
      anchorPlaybackClockSecond: 10,
      anchorProjectSecond: 0,
      engineGeneration: 1,
      positionProjectSecond: 0,
      positionTick: 0,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
      timelineEndProjectSecond: 599.5,
    })
    expect(transport.playbackClockSecondAtTick(parseTick(960))).toBe(10.5)
    expect(transport.playbackClockSecondAtTick(parseTick(1_920))).toBe(11.5)
    expect(transport.tickPositionAtPlaybackClockSecond(parsePlaybackClockSecond(10.75))).toBe(1_200)
    expect(transport.tickPositionAtPlaybackClockSecond(parsePlaybackClockSecond(12))).toBe(2_400)

    clock.advanceBy(0.25)
    expect(transport.getSnapshot()).toMatchObject({
      positionProjectSecond: 0.25,
      positionTick: 480,
    })
    clock.advanceBy(0.25)
    expect(transport.getSnapshot()).toMatchObject({
      positionProjectSecond: 0.5,
      positionTick: 960,
    })
    clock.advanceBy(0.5)
    expect(transport.getSnapshot()).toMatchObject({
      positionProjectSecond: 1,
      positionTick: 1_440,
    })
  })

  it('pauses at a continuous position and resumes with a fresh generation', () => {
    const clock = new ManualPlaybackClock(100)
    const transport = createAudibleMidiTransport(createFixturePlan(), clock)

    expect(transport.play().snapshot.engineGeneration).toBe(1)
    clock.advanceBy(0.25)
    const paused = transport.pause()

    expect(paused.outcome).toBe(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PAUSED)
    expect(paused.snapshot).toMatchObject({
      anchorPlaybackClockSecond: null,
      anchorProjectSecond: null,
      engineGeneration: 2,
      positionProjectSecond: 0.25,
      positionTick: 480,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PAUSED,
    })

    clock.advanceBy(10)
    expect(transport.getSnapshot()).toEqual(paused.snapshot)
    expect(transport.pause()).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE,
      snapshot: { engineGeneration: 2 },
    })

    const resumed = transport.play()
    expect(resumed).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED,
      snapshot: {
        anchorPlaybackClockSecond: 110.25,
        anchorProjectSecond: 0.25,
        engineGeneration: 3,
        positionProjectSecond: 0.25,
        state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
      },
    })
    expect(transport.play()).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE,
      snapshot: { engineGeneration: 3 },
    })

    clock.advanceBy(0.25)
    expect(transport.getSnapshot()).toMatchObject({
      positionProjectSecond: 0.5,
      positionTick: 960,
    })
  })

  it('hands a Playing transport to a newer Plan without losing its clock position', () => {
    const plan = createFixturePlan()
    const nextPlan = replacePlan(plan, { modelRevision: nextModelRevision(plan) })
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(plan, clock)

    transport.play()
    clock.advanceBy(0.25)
    const handedOff = transport.handoffPlan(nextPlan)

    expect(handedOff).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.HANDED_OFF,
      snapshot: {
        anchorPlaybackClockSecond: 10.25,
        anchorProjectSecond: 0.25,
        engineGeneration: 2,
        modelRevision: 1,
        positionProjectSecond: 0.25,
        positionTick: 480,
        state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
      },
    })

    clock.advanceBy(0.25)
    expect(transport.getSnapshot()).toMatchObject({
      engineGeneration: 2,
      modelRevision: 1,
      positionProjectSecond: 0.5,
      positionTick: 960,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
    })
  })

  it('hands off Paused state without consuming Playback Clock time', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(30)
    const transport = createAudibleMidiTransport(plan, clock)
    transport.play()
    clock.advanceBy(0.25)
    transport.pause()
    clock.advanceBy(5)

    const handedOff = transport.handoffPlan(
      replacePlan(plan, { modelRevision: nextModelRevision(plan) }),
    )

    expect(handedOff).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.HANDED_OFF,
      snapshot: {
        anchorPlaybackClockSecond: null,
        anchorProjectSecond: null,
        engineGeneration: 3,
        modelRevision: 1,
        positionProjectSecond: 0.25,
        state: AUDIBLE_MIDI_TRANSPORT_STATE.PAUSED,
      },
    })
  })

  it('stops a handoff whose new Timeline ends before the current position', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(40)
    const transport = createAudibleMidiTransport(plan, clock)
    transport.play()
    clock.advanceBy(0.5)

    const handedOff = transport.handoffPlan(
      replacePlan(plan, {
        arrangementEndTick: parseTick(240),
        modelRevision: nextModelRevision(plan),
        timelineEndTick: parseTick(240),
      }),
    )

    expect(handedOff.snapshot).toMatchObject({
      engineGeneration: 2,
      positionProjectSecond: 0.125,
      positionTick: 240,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
      timelineEndProjectSecond: 0.125,
      timelineEndTick: 240,
    })
  })

  it('installs an unplayable handoff as Stopped while preserving its current position', () => {
    const plan = createFixturePlan()
    const clock = new ManualPlaybackClock(50)
    const transport = createAudibleMidiTransport(plan, clock)
    transport.play()
    clock.advanceBy(0.25)

    const handedOff = transport.handoffPlan(
      replacePlan(plan, {
        midiNoteSpans: Object.freeze([]),
        modelRevision: nextModelRevision(plan),
        status: AUDIBLE_MIDI_PLAN_STATUS.EMPTY,
      }),
    )

    expect(handedOff.snapshot).toMatchObject({
      engineGeneration: 2,
      modelRevision: 1,
      planStatus: AUDIBLE_MIDI_PLAN_STATUS.EMPTY,
      positionProjectSecond: 0.25,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
    })
    expect(transport.play()).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAN_EMPTY,
      snapshot: { engineGeneration: 2 },
    })
  })

  it('rejects a stale handoff without changing the installed Plan', () => {
    const plan = createFixturePlan()
    const transport = createAudibleMidiTransport(plan, new ManualPlaybackClock())

    expect(() => transport.handoffPlan(plan)).toThrow(
      expect.objectContaining({ code: 'handoff-plan-not-forward' }) as AudibleMidiTransportError,
    )
    expect(transport.getSnapshot()).toMatchObject({
      engineGeneration: INITIAL_ENGINE_GENERATION,
      modelRevision: plan.modelRevision,
    })
  })

  it('returns to start once and keeps repeated commands generation-neutral', () => {
    const clock = new ManualPlaybackClock(5)
    const transport = createAudibleMidiTransport(createFixturePlan(), clock)

    transport.play()
    clock.advanceBy(0.25)
    const returned = transport.returnToStart()

    expect(returned).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_START,
      snapshot: {
        engineGeneration: 2,
        positionProjectSecond: 0,
        positionTick: 0,
        state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
      },
    })
    expect(transport.returnToStart()).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE,
      snapshot: { engineGeneration: 2 },
    })
  })

  it('stops at Timeline End without changing generation and restarts from zero', () => {
    const clock = new ManualPlaybackClock(20)
    const plan = createFixturePlan()
    const transport = createAudibleMidiTransport(
      replacePlan(plan, { timelineEndTick: parseTick(1_920) }),
      clock,
    )

    transport.play()
    clock.advanceBy(1)
    const ended = transport.getSnapshot()

    expect(ended).toMatchObject({
      anchorPlaybackClockSecond: null,
      anchorProjectSecond: null,
      engineGeneration: 1,
      positionProjectSecond: 1,
      positionTick: 1_920,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
    })

    clock.advanceBy(2)
    expect(transport.getSnapshot()).toEqual(ended)
    expect(transport.play()).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED,
      snapshot: {
        anchorPlaybackClockSecond: 23,
        anchorProjectSecond: 0,
        engineGeneration: 2,
        positionProjectSecond: 0,
        state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
      },
    })
  })

  it('continues silently after authored content and stops at the shared Timeline End', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const extendedMutedClip = createMidiClipRecord({
      ...records.pianoClip,
      muted: true,
      startTick: parseTick(2_880),
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [records.alternateClip, extendedMutedClip],
      }),
    )
    const clock = new ManualPlaybackClock()
    const transport = createAudibleMidiTransport(plan, clock)

    expect(plan.arrangementEndTick).toBe(3_840)
    expect(plan.timelineEndTick).toBe(576_000)
    transport.play()
    clock.advanceBy(1)
    expect(transport.getSnapshot()).toMatchObject({
      positionTick: 1_920,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
    })
    clock.advanceBy(1)
    expect(transport.getSnapshot()).toMatchObject({
      positionTick: 3_840,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
    })
    clock.advanceBy(298)
    expect(transport.getSnapshot()).toMatchObject({
      positionProjectSecond: 300,
      positionTick: 576_000,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
    })
  })

  it.each([
    [AUDIBLE_MIDI_PLAN_STATUS.BLOCKED, AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAN_BLOCKED],
    [AUDIBLE_MIDI_PLAN_STATUS.EMPTY, AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAN_EMPTY],
  ] as const)('rejects %s Plans without changing state or generation', (status, outcome) => {
    const plan = createFixturePlan()
    const transport = createAudibleMidiTransport(
      replacePlan(plan, { midiNoteSpans: Object.freeze([]), status }),
      new ManualPlaybackClock(),
    )

    expect(transport.play()).toMatchObject({
      outcome,
      snapshot: {
        engineGeneration: INITIAL_ENGINE_GENERATION,
        positionTick: 0,
        state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
      },
    })
  })

  it('allows a Partial Plan to enter Playing', () => {
    const plan = createFixturePlan()
    const transport = createAudibleMidiTransport(
      replacePlan(plan, { status: AUDIBLE_MIDI_PLAN_STATUS.PARTIAL }),
      new ManualPlaybackClock(),
    )

    expect(transport.play()).toMatchObject({
      outcome: AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED,
      snapshot: { engineGeneration: 1, state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING },
    })
  })

  it('fails closed when a future Compiler emits an unknown Plan status', () => {
    const plan = createFixturePlan()

    expect(() =>
      createAudibleMidiTransport(
        replacePlan(plan, { status: 'future-status' as AudibleMidiProjectPlan['status'] }),
        new ManualPlaybackClock(),
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-plan-status' }) as AudibleMidiTransportError)
  })

  it('fails closed for inactive mappings and targets outside the active mapping', () => {
    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(createFixturePlan(), clock)

    expect(() => transport.playbackClockSecondAtTick(parseTick(0))).toThrow(
      expect.objectContaining({ code: 'transport-not-playing' }) as AudibleMidiTransportError,
    )

    transport.play()
    expect(() => transport.playbackClockSecondAtTick(parseTick(576_001))).toThrow(
      expect.objectContaining({
        code: 'target-tick-after-timeline-end',
      }) as AudibleMidiTransportError,
    )
    expect(() =>
      transport.tickPositionAtPlaybackClockSecond(parsePlaybackClockSecond(9.5)),
    ).toThrow(
      expect.objectContaining({
        code: 'playback-clock-before-anchor',
      }) as AudibleMidiTransportError,
    )

    transport.pause()
    expect(() =>
      transport.tickPositionAtPlaybackClockSecond(parsePlaybackClockSecond(10.5)),
    ).toThrow(
      expect.objectContaining({ code: 'transport-not-playing' }) as AudibleMidiTransportError,
    )
  })

  it('rejects invalid and regressing Playback Clock values without corrupting state', () => {
    const invalidClock: PlaybackClock = {
      now: () => Number.NaN as PlaybackClockSecond,
    }
    const invalidTransport = createAudibleMidiTransport(createFixturePlan(), invalidClock)
    const invalidError = captureError(() => invalidTransport.play())

    expect(invalidError).toBeInstanceOf(ProjectTimeError)
    expect(invalidError).toMatchObject({ code: 'invalid-playback-clock-second' })
    expect(invalidTransport.getSnapshot()).toMatchObject({
      engineGeneration: INITIAL_ENGINE_GENERATION,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED,
    })

    const clock = new ManualPlaybackClock(10)
    const transport = createAudibleMidiTransport(createFixturePlan(), clock)
    transport.play()
    clock.setTo(9)
    expect(() => transport.getSnapshot()).toThrow(
      expect.objectContaining({ code: 'playback-clock-regressed' }) as AudibleMidiTransportError,
    )
    clock.setTo(10)
    expect(transport.getSnapshot()).toMatchObject({
      engineGeneration: 1,
      positionProjectSecond: 0,
      state: AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING,
    })
  })

  it('copies Plan identity and Tempo Segments instead of retaining mutable input records', () => {
    const compiledPlan = createFixturePlan()
    const mutableTempoSegments = compiledPlan.tempoSegments.map((segment) => ({ ...segment }))
    const mutablePlan = {
      ...compiledPlan,
      tempoSegments: mutableTempoSegments,
    }
    const transport = createAudibleMidiTransport(mutablePlan, new ManualPlaybackClock())

    Object.assign(mutablePlan, { modelRevision: 999 as ModelRevision })
    Object.assign(mutableTempoSegments[0]!, {
      bpm: parseTempoBpm(60),
      secondsPerTick: 60 / (60 * 960),
    })

    expect(transport.getSnapshot()).toMatchObject({
      modelRevision: compiledPlan.modelRevision,
      timelineEndProjectSecond: 300,
    })
  })
})
