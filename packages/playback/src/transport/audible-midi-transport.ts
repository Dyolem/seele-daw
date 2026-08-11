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
  NO_CHANGE: 'no-change',
  PAUSED: 'paused',
  PLAN_BLOCKED: 'plan-blocked',
  PLAN_EMPTY: 'plan-empty',
  PLAYED: 'played',
  RETURNED_TO_START: 'returned-to-start',
} as const)

export type AudibleMidiTransportOutcome =
  (typeof AUDIBLE_MIDI_TRANSPORT_OUTCOME)[keyof typeof AUDIBLE_MIDI_TRANSPORT_OUTCOME]

export type AudibleMidiTransportErrorCode =
  | 'engine-generation-overflow'
  | 'invalid-plan-status'
  | 'playback-clock-before-anchor'
  | 'playback-clock-regressed'
  | 'playback-clock-target-out-of-range'
  | 'target-tick-after-arrangement-end'
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
  readonly arrangementEndProjectSecond: ProjectSecond
  readonly arrangementEndTick: Tick
  readonly engineGeneration: EngineGeneration
  readonly modelRevision: ModelRevision
  readonly planStatus: AudibleMidiPlanStatus
  readonly positionProjectSecond: ProjectSecond
  readonly positionTick: ContinuousTickPosition
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
  pause(): AudibleMidiTransportTransition
  play(): AudibleMidiTransportTransition
  playbackClockSecondAtTick(tick: Tick): PlaybackClockSecond
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
  const planStatus = parsePlanStatus(plan.status)
  const modelRevision = plan.modelRevision
  const arrangementEndTick = parseTick(plan.arrangementEndTick)
  const tempoMap: TempoMap = createTempoMapFromSegments(plan.tempoSegments)
  const arrangementEndProjectSecond = tempoMap.projectSecondAtTick(arrangementEndTick)
  const zeroProjectSecond = parseProjectSecond(0)
  const zeroTickPosition = parseContinuousTickPosition(0)
  const arrangementEndTickPosition = parseContinuousTickPosition(arrangementEndTick)

  let state: AudibleMidiTransportState = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
  let engineGeneration = INITIAL_ENGINE_GENERATION
  let anchorProjectSecond = zeroProjectSecond
  let anchorPlaybackClockSecond: PlaybackClockSecond | null = null
  let lastObservedPlaybackClockSecond: PlaybackClockSecond | null = null

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
    if (positionProjectSecond === arrangementEndProjectSecond) return arrangementEndTickPosition
    return tempoMap.tickPositionAtProjectSecond(positionProjectSecond)
  }

  function createSnapshot(positionProjectSecond: ProjectSecond): AudibleMidiTransportSnapshot {
    const base = {
      arrangementEndProjectSecond,
      arrangementEndTick,
      engineGeneration,
      modelRevision,
      planStatus,
      positionProjectSecond,
      positionTick: positionTickAtProjectSecond(positionProjectSecond),
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
    const remainingProjectSecond = arrangementEndProjectSecond - anchorProjectSecond

    if (elapsedPlaybackSecond >= remainingProjectSecond) {
      // Natural end preserves the logical End position without invalidating the current generation.
      state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
      anchorProjectSecond = arrangementEndProjectSecond
      anchorPlaybackClockSecond = null
      return arrangementEndProjectSecond
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

    const startProjectSecond =
      state === AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED &&
      anchorProjectSecond === arrangementEndProjectSecond
        ? zeroProjectSecond
        : anchorProjectSecond
    const startPlaybackClockSecond = readPlaybackClock()

    engineGeneration = incrementEngineGeneration(engineGeneration)
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

  function returnToStart(): AudibleMidiTransportTransition {
    if (
      state === AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED &&
      anchorProjectSecond === zeroProjectSecond
    ) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, zeroProjectSecond)
    }

    engineGeneration = incrementEngineGeneration(engineGeneration)
    state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
    anchorProjectSecond = zeroProjectSecond
    anchorPlaybackClockSecond = null

    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_START, zeroProjectSecond)
  }

  function playbackClockSecondAtTick(tick: Tick): PlaybackClockSecond {
    const mapping = requireActiveMapping()
    const targetTick = parseTick(tick)
    if (targetTick > arrangementEndTick) {
      throw new AudibleMidiTransportError(
        'target-tick-after-arrangement-end',
        `Target Tick ${targetTick} is after Arrangement End ${arrangementEndTick}`,
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
    const remainingProjectSecond = arrangementEndProjectSecond - mapping.anchorProjectSecond
    if (elapsedPlaybackSecond >= remainingProjectSecond) {
      return arrangementEndTickPosition
    }

    const targetProjectSecond = parseProjectSecond(
      mapping.anchorProjectSecond + elapsedPlaybackSecond,
    )
    return tempoMap.tickPositionAtProjectSecond(targetProjectSecond)
  }

  return Object.freeze({
    getSnapshot,
    pause,
    play,
    playbackClockSecondAtTick,
    returnToStart,
    tickPositionAtPlaybackClockSecond,
  })
}
