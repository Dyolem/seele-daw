import type { Brand } from '@seele-daw/type-utils'
import { parseTick, type ModelRevision, type Tick } from '@seele-daw/project-core'

import {
  AUDIBLE_MIDI_PLAN_STATUS,
  type AudibleMidiPlanStatus,
  type AudibleMidiProjectPlan,
} from '#internal/compiler/audible-midi-plan'
import {
  parseContinuousTickPosition,
  parsePlaybackClockSecond,
  parseProjectSecond,
  type ContinuousTickPosition,
  type PlaybackClockSecond,
  type ProjectSecond,
} from '#internal/time/project-time'
import { createTempoMapFromSegments, type TempoMap } from '#internal/time/tempo-map'

export type EngineGeneration = Brand<number, 'EngineGeneration'>

export const INITIAL_ENGINE_GENERATION = 0 as EngineGeneration

export const AUDIBLE_MIDI_TRANSPORT_STATE = Object.freeze({
  PAUSED: 'paused',
  PLAYING: 'playing',
  STOPPED: 'stopped',
} as const)

export type AudibleMidiTransportState =
  (typeof AUDIBLE_MIDI_TRANSPORT_STATE)[keyof typeof AUDIBLE_MIDI_TRANSPORT_STATE]

export const AUDIBLE_MIDI_TRANSPORT_OUTCOME = Object.freeze({
  HANDED_OFF: 'handed-off',
  LOCATED: 'located',
  NO_CHANGE: 'no-change',
  PAUSED: 'paused',
  PLAN_BLOCKED: 'plan-blocked',
  PLAN_EMPTY: 'plan-empty',
  PLAYED: 'played',
  RETURNED_TO_LAST_START_POSITION: 'returned-to-last-start-position',
  /** @deprecated Use RETURNED_TO_LAST_START_POSITION. */
  RETURNED_TO_START: 'returned-to-last-start-position',
} as const)

export type AudibleMidiTransportOutcome =
  (typeof AUDIBLE_MIDI_TRANSPORT_OUTCOME)[keyof typeof AUDIBLE_MIDI_TRANSPORT_OUTCOME]

export type AudibleMidiTransportErrorCode =
  | 'engine-generation-overflow'
  | 'handoff-plan-not-forward'
  | 'invalid-plan-status'
  | 'playback-clock-before-anchor'
  | 'playback-clock-regressed'
  | 'playback-clock-target-out-of-range'
  | 'target-tick-after-timeline-end'
  | 'transport-not-playing'

/** Stable failure raised when a Transport mapping cannot preserve its runtime invariants. */
export class AudibleMidiTransportError extends Error {
  readonly code: AudibleMidiTransportErrorCode

  constructor(code: AudibleMidiTransportErrorCode, message: string) {
    super(message)
    this.name = 'AudibleMidiTransportError'
    this.code = code
  }
}

export interface PlaybackClock {
  now(): PlaybackClockSecond
}

interface AudibleMidiTransportSnapshotBase {
  readonly engineGeneration: EngineGeneration
  readonly modelRevision: ModelRevision
  readonly planStatus: AudibleMidiPlanStatus
  readonly positionProjectSecond: ProjectSecond
  readonly positionTick: ContinuousTickPosition
  readonly returnAnchorTick: Tick
  readonly timelineEndProjectSecond: ProjectSecond
  readonly timelineEndTick: Tick
}

export interface PlayingAudibleMidiTransportSnapshot extends AudibleMidiTransportSnapshotBase {
  readonly state: 'playing'
  readonly anchorPlaybackClockSecond: PlaybackClockSecond
  readonly anchorProjectSecond: ProjectSecond
}

export interface InactiveAudibleMidiTransportSnapshot extends AudibleMidiTransportSnapshotBase {
  readonly state: 'paused' | 'stopped'
  readonly anchorPlaybackClockSecond: null
  readonly anchorProjectSecond: null
}

export type AudibleMidiTransportSnapshot =
  | PlayingAudibleMidiTransportSnapshot
  | InactiveAudibleMidiTransportSnapshot

export interface AudibleMidiTransportTransition {
  readonly outcome: AudibleMidiTransportOutcome
  readonly snapshot: AudibleMidiTransportSnapshot
}

export interface AudibleMidiTransport {
  getSnapshot(): AudibleMidiTransportSnapshot
  handoffPlan(plan: AudibleMidiProjectPlan): AudibleMidiTransportTransition
  locateAtTick(tick: Tick): AudibleMidiTransportTransition
  pause(): AudibleMidiTransportTransition
  play(): AudibleMidiTransportTransition
  playbackClockSecondAtTick(tick: Tick): PlaybackClockSecond
  returnToLastStartPosition(): AudibleMidiTransportTransition
  /** @deprecated Use returnToLastStartPosition. */
  returnToStart(): AudibleMidiTransportTransition
  tickPositionAtPlaybackClockSecond(
    playbackClockSecond: PlaybackClockSecond,
  ): ContinuousTickPosition
}

function parsePlanStatus(value: unknown): AudibleMidiPlanStatus {
  switch (value) {
    case AUDIBLE_MIDI_PLAN_STATUS.BLOCKED:
    case AUDIBLE_MIDI_PLAN_STATUS.EMPTY:
    case AUDIBLE_MIDI_PLAN_STATUS.PARTIAL:
    case AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE:
      return value
    default:
      throw new AudibleMidiTransportError(
        'invalid-plan-status',
        `Transport cannot consume unknown Plan status ${String(value)}`,
      )
  }
}

function incrementEngineGeneration(generation: EngineGeneration): EngineGeneration {
  if (generation >= Number.MAX_SAFE_INTEGER) {
    throw new AudibleMidiTransportError(
      'engine-generation-overflow',
      'Transport engineGeneration exceeded Number.MAX_SAFE_INTEGER',
    )
  }

  return (generation + 1) as EngineGeneration
}

function parseCalculatedPlaybackClockSecond(value: number, context: string): PlaybackClockSecond {
  try {
    return parsePlaybackClockSecond(value)
  } catch {
    throw new AudibleMidiTransportError(
      'playback-clock-target-out-of-range',
      `${context} produced an out-of-range PlaybackClockSecond`,
    )
  }
}

/** Creates one browser-independent Transport lifetime for a compiled Project plan. */
export function createAudibleMidiTransport(
  plan: AudibleMidiProjectPlan,
  clock: PlaybackClock,
): AudibleMidiTransport {
  let planStatus = parsePlanStatus(plan.status)
  let modelRevision = plan.modelRevision
  let timelineEndTick = parseTick(plan.timelineEndTick)
  let tempoMap: TempoMap = createTempoMapFromSegments(plan.tempoSegments)
  let timelineEndProjectSecond = tempoMap.projectSecondAtTick(timelineEndTick)
  const zeroProjectSecond = parseProjectSecond(0)
  const zeroTick = parseTick(0)
  const zeroTickPosition = parseContinuousTickPosition(zeroTick)
  let timelineEndTickPosition = parseContinuousTickPosition(timelineEndTick)

  let state: AudibleMidiTransportState = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
  let engineGeneration = INITIAL_ENGINE_GENERATION
  let anchorProjectSecond = zeroProjectSecond
  let anchorPlaybackClockSecond: PlaybackClockSecond | null = null
  let lastObservedPlaybackClockSecond: PlaybackClockSecond | null = null
  let returnAnchorTick = zeroTick

  function readPlaybackClock(): PlaybackClockSecond {
    const current = parsePlaybackClockSecond(clock.now())
    if (lastObservedPlaybackClockSecond !== null && current < lastObservedPlaybackClockSecond) {
      throw new AudibleMidiTransportError(
        'playback-clock-regressed',
        `Playback Clock regressed from ${lastObservedPlaybackClockSecond} to ${current}`,
      )
    }
    lastObservedPlaybackClockSecond = current
    return current
  }

  function positionTickAtProjectSecond(
    positionProjectSecond: ProjectSecond,
  ): ContinuousTickPosition {
    if (positionProjectSecond === zeroProjectSecond) return zeroTickPosition
    if (positionProjectSecond === timelineEndProjectSecond) return timelineEndTickPosition
    return tempoMap.tickPositionAtProjectSecond(positionProjectSecond)
  }

  function createSnapshot(positionProjectSecond: ProjectSecond): AudibleMidiTransportSnapshot {
    const base = {
      engineGeneration,
      modelRevision,
      planStatus,
      positionProjectSecond,
      positionTick: positionTickAtProjectSecond(positionProjectSecond),
      returnAnchorTick,
      timelineEndProjectSecond,
      timelineEndTick,
    }

    if (state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
      if (anchorPlaybackClockSecond === null) {
        throw new AudibleMidiTransportError(
          'transport-not-playing',
          'Playing Transport has no Playback Clock anchor',
        )
      }
      return Object.freeze({
        ...base,
        anchorPlaybackClockSecond,
        anchorProjectSecond,
        state,
      })
    }

    return Object.freeze({
      ...base,
      anchorPlaybackClockSecond: null,
      anchorProjectSecond: null,
      state,
    })
  }

  function createTransition(
    outcome: AudibleMidiTransportOutcome,
    positionProjectSecond: ProjectSecond,
  ): AudibleMidiTransportTransition {
    return Object.freeze({
      outcome,
      snapshot: createSnapshot(positionProjectSecond),
    })
  }

  function synchronizePlayingPosition(): ProjectSecond {
    if (state !== AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) return anchorProjectSecond
    if (anchorPlaybackClockSecond === null) {
      throw new AudibleMidiTransportError(
        'transport-not-playing',
        'Playing Transport has no Playback Clock anchor',
      )
    }

    const currentPlaybackClockSecond = readPlaybackClock()
    const elapsedPlaybackSecond = currentPlaybackClockSecond - anchorPlaybackClockSecond
    const remainingProjectSecond = timelineEndProjectSecond - anchorProjectSecond

    if (elapsedPlaybackSecond >= remainingProjectSecond) {
      // Natural end preserves the logical End position without invalidating the current generation.
      state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
      anchorProjectSecond = timelineEndProjectSecond
      anchorPlaybackClockSecond = null
      return timelineEndProjectSecond
    }

    return parseProjectSecond(anchorProjectSecond + elapsedPlaybackSecond)
  }

  function requireActiveMapping(): {
    readonly anchorPlaybackClockSecond: PlaybackClockSecond
    readonly anchorProjectSecond: ProjectSecond
  } {
    synchronizePlayingPosition()
    if (state !== AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING || anchorPlaybackClockSecond === null) {
      throw new AudibleMidiTransportError(
        'transport-not-playing',
        'Transport time mapping requires the Playing state',
      )
    }

    return { anchorPlaybackClockSecond, anchorProjectSecond }
  }

  function getSnapshot(): AudibleMidiTransportSnapshot {
    return createSnapshot(synchronizePlayingPosition())
  }

  function play(): AudibleMidiTransportTransition {
    if (planStatus === AUDIBLE_MIDI_PLAN_STATUS.BLOCKED) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAN_BLOCKED, anchorProjectSecond)
    }
    if (planStatus === AUDIBLE_MIDI_PLAN_STATUS.EMPTY) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAN_EMPTY, anchorProjectSecond)
    }

    if (state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
      const currentProjectSecond = synchronizePlayingPosition()
      if (state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
        return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, currentProjectSecond)
      }
    }

    const restartsFromTimelineStart =
      state === AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED &&
      anchorProjectSecond === timelineEndProjectSecond
    const startProjectSecond = restartsFromTimelineStart ? zeroProjectSecond : anchorProjectSecond
    const startPlaybackClockSecond = readPlaybackClock()

    engineGeneration = incrementEngineGeneration(engineGeneration)
    if (restartsFromTimelineStart) returnAnchorTick = zeroTick
    state = AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    anchorProjectSecond = startProjectSecond
    anchorPlaybackClockSecond = startPlaybackClockSecond

    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED, startProjectSecond)
  }

  function pause(): AudibleMidiTransportTransition {
    if (state !== AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, anchorProjectSecond)
    }

    const pausedProjectSecond = synchronizePlayingPosition()
    if (state !== AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, pausedProjectSecond)
    }

    engineGeneration = incrementEngineGeneration(engineGeneration)
    state = AUDIBLE_MIDI_TRANSPORT_STATE.PAUSED
    anchorProjectSecond = pausedProjectSecond
    anchorPlaybackClockSecond = null

    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PAUSED, pausedProjectSecond)
  }

  function handoffPlan(nextPlan: AudibleMidiProjectPlan): AudibleMidiTransportTransition {
    if (!Number.isSafeInteger(nextPlan.modelRevision) || nextPlan.modelRevision <= modelRevision) {
      throw new AudibleMidiTransportError(
        'handoff-plan-not-forward',
        `Transport handoff requires a modelRevision after ${modelRevision}`,
      )
    }

    // Normalize every replacement value before observing the clock or mutating active state.
    const nextPlanStatus = parsePlanStatus(nextPlan.status)
    const nextTimelineEndTick = parseTick(nextPlan.timelineEndTick)
    const nextTempoMap = createTempoMapFromSegments(nextPlan.tempoSegments)
    const nextTimelineEndProjectSecond = nextTempoMap.projectSecondAtTick(nextTimelineEndTick)
    const nextTimelineEndTickPosition = parseContinuousTickPosition(nextTimelineEndTick)
    const nextGeneration = incrementEngineGeneration(engineGeneration)
    const wasPlaying = state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    const currentProjectSecond = synchronizePlayingPosition()
    const continuesPlaying = wasPlaying && state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    const handoffPlaybackClockSecond = continuesPlaying ? lastObservedPlaybackClockSecond : null

    planStatus = nextPlanStatus
    modelRevision = nextPlan.modelRevision
    timelineEndTick = nextTimelineEndTick
    tempoMap = nextTempoMap
    timelineEndProjectSecond = nextTimelineEndProjectSecond
    timelineEndTickPosition = nextTimelineEndTickPosition
    returnAnchorTick = parseTick(Math.min(returnAnchorTick, nextTimelineEndTick))
    engineGeneration = nextGeneration

    const handoffProjectSecond = parseProjectSecond(
      Math.min(currentProjectSecond, timelineEndProjectSecond),
    )
    const nextPlanIsPlayable =
      planStatus === AUDIBLE_MIDI_PLAN_STATUS.PARTIAL ||
      planStatus === AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE

    if (
      !nextPlanIsPlayable ||
      handoffProjectSecond >= timelineEndProjectSecond ||
      !continuesPlaying
    ) {
      if (!nextPlanIsPlayable || handoffProjectSecond >= timelineEndProjectSecond) {
        state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
      }
      anchorProjectSecond = handoffProjectSecond
      anchorPlaybackClockSecond = null
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.HANDED_OFF, handoffProjectSecond)
    }

    if (handoffPlaybackClockSecond === null) {
      throw new AudibleMidiTransportError(
        'transport-not-playing',
        'Playing Transport handoff has no observed Playback Clock position',
      )
    }
    state = AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    anchorProjectSecond = handoffProjectSecond
    anchorPlaybackClockSecond = handoffPlaybackClockSecond
    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.HANDED_OFF, handoffProjectSecond)
  }

  function locateAtTick(tick: Tick): AudibleMidiTransportTransition {
    const targetTick = parseTick(tick)
    if (targetTick > timelineEndTick) {
      throw new AudibleMidiTransportError(
        'target-tick-after-timeline-end',
        `Target Tick ${targetTick} is after Timeline End ${timelineEndTick}`,
      )
    }

    const wasPlaying = state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    const currentProjectSecond = synchronizePlayingPosition()
    const currentTick = positionTickAtProjectSecond(currentProjectSecond)
    if (
      currentTick === parseContinuousTickPosition(targetTick) &&
      returnAnchorTick === targetTick
    ) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, currentProjectSecond)
    }

    const targetProjectSecond = tempoMap.projectSecondAtTick(targetTick)
    const continuesPlaying =
      wasPlaying && state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING && targetTick < timelineEndTick
    const locatePlaybackClockSecond = continuesPlaying ? lastObservedPlaybackClockSecond : null

    engineGeneration = incrementEngineGeneration(engineGeneration)
    returnAnchorTick = targetTick
    anchorProjectSecond = targetProjectSecond
    if (continuesPlaying) {
      if (locatePlaybackClockSecond === null) {
        throw new AudibleMidiTransportError(
          'transport-not-playing',
          'Playing Transport locate has no observed Playback Clock position',
        )
      }
      anchorPlaybackClockSecond = locatePlaybackClockSecond
    } else {
      if (state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
        state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
      }
      anchorPlaybackClockSecond = null
    }

    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.LOCATED, targetProjectSecond)
  }

  function returnToLastStartPosition(): AudibleMidiTransportTransition {
    const currentProjectSecond = synchronizePlayingPosition()
    const returnProjectSecond = tempoMap.projectSecondAtTick(returnAnchorTick)
    if (
      state === AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED &&
      currentProjectSecond === returnProjectSecond
    ) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, returnProjectSecond)
    }

    engineGeneration = incrementEngineGeneration(engineGeneration)
    state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
    anchorProjectSecond = returnProjectSecond
    anchorPlaybackClockSecond = null

    return createTransition(
      AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_LAST_START_POSITION,
      returnProjectSecond,
    )
  }

  /** @deprecated Compatibility alias until Studio adopts the new product command. */
  function returnToStart(): AudibleMidiTransportTransition {
    return returnToLastStartPosition()
  }

  function playbackClockSecondAtTick(tick: Tick): PlaybackClockSecond {
    const mapping = requireActiveMapping()
    const targetTick = parseTick(tick)
    if (targetTick > timelineEndTick) {
      throw new AudibleMidiTransportError(
        'target-tick-after-timeline-end',
        `Target Tick ${targetTick} is after Timeline End ${timelineEndTick}`,
      )
    }

    const targetProjectSecond = tempoMap.projectSecondAtTick(targetTick)
    return parseCalculatedPlaybackClockSecond(
      mapping.anchorPlaybackClockSecond + (targetProjectSecond - mapping.anchorProjectSecond),
      `Target Tick ${targetTick}`,
    )
  }

  function tickPositionAtPlaybackClockSecond(
    playbackClockSecond: PlaybackClockSecond,
  ): ContinuousTickPosition {
    const mapping = requireActiveMapping()
    const targetPlaybackClockSecond = parsePlaybackClockSecond(playbackClockSecond)
    if (targetPlaybackClockSecond < mapping.anchorPlaybackClockSecond) {
      throw new AudibleMidiTransportError(
        'playback-clock-before-anchor',
        `Target PlaybackClockSecond ${targetPlaybackClockSecond} is before anchor ${mapping.anchorPlaybackClockSecond}`,
      )
    }

    const elapsedPlaybackSecond = targetPlaybackClockSecond - mapping.anchorPlaybackClockSecond
    const remainingProjectSecond = timelineEndProjectSecond - mapping.anchorProjectSecond
    if (elapsedPlaybackSecond >= remainingProjectSecond) {
      return timelineEndTickPosition
    }

    const targetProjectSecond = parseProjectSecond(
      mapping.anchorProjectSecond + elapsedPlaybackSecond,
    )
    return tempoMap.tickPositionAtProjectSecond(targetProjectSecond)
  }

  return Object.freeze({
    getSnapshot,
    handoffPlan,
    locateAtTick,
    pause,
    play,
    playbackClockSecondAtTick,
    returnToLastStartPosition,
    returnToStart,
    tickPositionAtPlaybackClockSecond,
  })
}
