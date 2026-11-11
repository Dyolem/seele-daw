import type { Brand } from '@seele-daw/type-utils'
import type { ModelRevision, Tick } from '@seele-daw/project-core'

import {
  AUDIBLE_MIDI_PLAN_STATUS,
  type AudibleMidiPlanStatus,
  type AudibleMidiProjectPlan,
} from '#internal/compiler/audible-midi-plan'
import type {
  ContinuousTickPosition,
  PlaybackClockSecond,
  ProjectSecond,
} from '#internal/time/project-time'
import { createTempoMapFromSegments, type TempoMap } from '#internal/time/tempo-map'

export type MappingGeneration = Brand<number, 'MappingGeneration'>

export const INITIAL_MAPPING_GENERATION = 0 as MappingGeneration

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
  PLAN_EMPTY: 'plan-empty',
  PLAYED: 'played',
  RETURNED_TO_LAST_START_POSITION: 'returned-to-last-start-position',
} as const)

export type AudibleMidiTransportOutcome =
  (typeof AUDIBLE_MIDI_TRANSPORT_OUTCOME)[keyof typeof AUDIBLE_MIDI_TRANSPORT_OUTCOME]

export interface PlaybackClock {
  now(): PlaybackClockSecond
}

interface AudibleMidiTransportSnapshotBase {
  readonly mappingGeneration: MappingGeneration
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
}

function nextGeneration(generation: MappingGeneration): MappingGeneration {
  return (generation + 1) as MappingGeneration
}

const ZERO_PROJECT_SECOND = 0 as ProjectSecond
const ZERO_TICK = 0 as Tick

/**
 * Creates one browser-independent Transport lifetime for a compiled Project plan. The plan comes
 * from the compiler and the clock is the output's, so neither is checked again here.
 */
export function createAudibleMidiTransport(
  plan: AudibleMidiProjectPlan,
  clock: PlaybackClock,
): AudibleMidiTransport {
  let planStatus: AudibleMidiPlanStatus = plan.status
  let modelRevision = plan.modelRevision
  let timelineEndTick = plan.timelineEndTick
  let tempoMap: TempoMap = createTempoMapFromSegments(plan.tempoSegments)
  let timelineEndProjectSecond = tempoMap.projectSecondAtTick(timelineEndTick)
  const zeroProjectSecond = ZERO_PROJECT_SECOND
  const zeroTick = ZERO_TICK
  const zeroTickPosition = zeroTick as number as ContinuousTickPosition
  let timelineEndTickPosition = timelineEndTick as number as ContinuousTickPosition

  let state: AudibleMidiTransportState = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
  let mappingGeneration = INITIAL_MAPPING_GENERATION
  let anchorProjectSecond = zeroProjectSecond
  let anchorPlaybackClockSecond: PlaybackClockSecond | null = null
  let lastObservedPlaybackClockSecond: PlaybackClockSecond | null = null
  let returnAnchorTick = zeroTick

  function readPlaybackClock(): PlaybackClockSecond {
    lastObservedPlaybackClockSecond = clock.now()
    return lastObservedPlaybackClockSecond
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
      mappingGeneration,
      modelRevision,
      planStatus,
      positionProjectSecond,
      positionTick: positionTickAtProjectSecond(positionProjectSecond),
      returnAnchorTick,
      timelineEndProjectSecond,
      timelineEndTick,
    }

    // Playing always has an anchor; every other state has none.
    if (state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING) {
      return Object.freeze({
        ...base,
        anchorPlaybackClockSecond: anchorPlaybackClockSecond!,
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

    const currentPlaybackClockSecond = readPlaybackClock()
    const elapsedPlaybackSecond = currentPlaybackClockSecond - anchorPlaybackClockSecond!
    const remainingProjectSecond = timelineEndProjectSecond - anchorProjectSecond

    if (elapsedPlaybackSecond >= remainingProjectSecond) {
      // Natural end preserves the logical End position without invalidating the current generation.
      state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
      anchorProjectSecond = timelineEndProjectSecond
      anchorPlaybackClockSecond = null
      return timelineEndProjectSecond
    }

    return (anchorProjectSecond + elapsedPlaybackSecond) as ProjectSecond
  }

  function requireActiveMapping(): {
    readonly anchorPlaybackClockSecond: PlaybackClockSecond
    readonly anchorProjectSecond: ProjectSecond
  } {
    synchronizePlayingPosition()
    // Playback may have reached its natural end since the caller last looked.
    if (state !== AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING || anchorPlaybackClockSecond === null) {
      throw new Error('Transport time mapping requires the Playing state')
    }

    return { anchorPlaybackClockSecond, anchorProjectSecond }
  }

  function getSnapshot(): AudibleMidiTransportSnapshot {
    return createSnapshot(synchronizePlayingPosition())
  }

  function play(): AudibleMidiTransportTransition {
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

    mappingGeneration = nextGeneration(mappingGeneration)
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

    mappingGeneration = nextGeneration(mappingGeneration)
    state = AUDIBLE_MIDI_TRANSPORT_STATE.PAUSED
    anchorProjectSecond = pausedProjectSecond
    anchorPlaybackClockSecond = null

    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PAUSED, pausedProjectSecond)
  }

  function handoffPlan(nextPlan: AudibleMidiProjectPlan): AudibleMidiTransportTransition {
    const nextTimelineEndTick = nextPlan.timelineEndTick
    const nextTempoMap = createTempoMapFromSegments(nextPlan.tempoSegments)
    const nextTimelineEndProjectSecond = nextTempoMap.projectSecondAtTick(nextTimelineEndTick)
    const nextTimelineEndTickPosition = nextTimelineEndTick as number as ContinuousTickPosition
    const wasPlaying = state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    const currentProjectSecond = synchronizePlayingPosition()
    const currentTickPosition = positionTickAtProjectSecond(currentProjectSecond)
    const continuesPlaying = wasPlaying && state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    const handoffPlaybackClockSecond = continuesPlaying ? lastObservedPlaybackClockSecond : null

    planStatus = nextPlan.status
    modelRevision = nextPlan.modelRevision
    timelineEndTick = nextTimelineEndTick
    tempoMap = nextTempoMap
    timelineEndProjectSecond = nextTimelineEndProjectSecond
    timelineEndTickPosition = nextTimelineEndTickPosition
    returnAnchorTick = Math.min(returnAnchorTick, nextTimelineEndTick) as Tick
    mappingGeneration = nextGeneration(mappingGeneration)

    // Musical position owns the handoff. A Tempo Map replacement may change the
    // corresponding ProjectSecond, but it must not move the Playhead to another Tick.
    const handoffTickPosition = Math.min(
      currentTickPosition,
      nextTimelineEndTickPosition,
    ) as ContinuousTickPosition
    const handoffProjectSecond = tempoMap.projectSecondAtTickPosition(handoffTickPosition)
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

    // Still playing means the clock was just read.
    state = AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    anchorProjectSecond = handoffProjectSecond
    anchorPlaybackClockSecond = handoffPlaybackClockSecond!
    return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.HANDED_OFF, handoffProjectSecond)
  }

  function locateAtTick(targetTick: Tick): AudibleMidiTransportTransition {
    if (targetTick > timelineEndTick) {
      throw new RangeError(`Target Tick ${targetTick} is after Timeline End ${timelineEndTick}`)
    }

    const wasPlaying = state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING
    const currentProjectSecond = synchronizePlayingPosition()
    const currentTick = positionTickAtProjectSecond(currentProjectSecond)
    if ((currentTick as number) === targetTick && returnAnchorTick === targetTick) {
      return createTransition(AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE, currentProjectSecond)
    }

    const targetProjectSecond = tempoMap.projectSecondAtTick(targetTick)
    const continuesPlaying =
      wasPlaying && state === AUDIBLE_MIDI_TRANSPORT_STATE.PLAYING && targetTick < timelineEndTick
    const locatePlaybackClockSecond = continuesPlaying ? lastObservedPlaybackClockSecond : null

    mappingGeneration = nextGeneration(mappingGeneration)
    returnAnchorTick = targetTick
    anchorProjectSecond = targetProjectSecond
    if (continuesPlaying) {
      // Still playing means the clock was just read.
      anchorPlaybackClockSecond = locatePlaybackClockSecond!
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

    mappingGeneration = nextGeneration(mappingGeneration)
    state = AUDIBLE_MIDI_TRANSPORT_STATE.STOPPED
    anchorProjectSecond = returnProjectSecond
    anchorPlaybackClockSecond = null

    return createTransition(
      AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_LAST_START_POSITION,
      returnProjectSecond,
    )
  }

  function playbackClockSecondAtTick(tick: Tick): PlaybackClockSecond {
    const mapping = requireActiveMapping()
    const targetProjectSecond = tempoMap.projectSecondAtTick(tick)
    return (mapping.anchorPlaybackClockSecond +
      (targetProjectSecond - mapping.anchorProjectSecond)) as PlaybackClockSecond
  }

  return Object.freeze({
    getSnapshot,
    handoffPlan,
    locateAtTick,
    pause,
    play,
    playbackClockSecondAtTick,
    returnToLastStartPosition,
  })
}
