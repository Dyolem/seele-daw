import {
  type BipolarValue,
  type DeviceId,
  type LinearGain,
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
  type ModelRevision,
  type TrackId,
} from '@seele-daw/project-core'

import {
  compareNoteSpans,
  type AudibleMidiProjectPlan,
  type MidiNoteSpanPlan,
  type NoteOccurrenceKey,
} from '#internal/compiler/audible-midi-plan'
import type { SoundbankId } from '#internal/sample-instrument-device'
import {
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
  type PlaybackClockDurationSecond,
  type PlaybackClockSecond,
  type ProjectSecond,
} from '#internal/time/project-time'
import { createTempoMapFromSegments, type TempoMap } from '#internal/time/tempo-map'
import type {
  AudibleMidiTransportSnapshot,
  MappingGeneration,
  PlayingAudibleMidiTransportSnapshot,
} from '#internal/transport/audible-midi-transport'

export const AUDIBLE_MIDI_SCHEDULER_OUTCOME = Object.freeze({
  INACTIVE: 'inactive',
  NO_CHANGE: 'no-change',
  PLANNED: 'planned',
} as const)

export type AudibleMidiSchedulerOutcome =
  (typeof AUDIBLE_MIDI_SCHEDULER_OUTCOME)[keyof typeof AUDIBLE_MIDI_SCHEDULER_OUTCOME]

export type AudibleMidiSchedulerErrorCode =
  | 'invalid-scheduler-configuration'
  | 'playback-clock-window-out-of-range'
  | 'schedule-cursor-inconsistent'
  | 'stale-mapping-generation'
  | 'transport-mapping-changed-without-generation'
  | 'transport-plan-mismatch'

/** Stable failure raised when Scheduler planning cannot preserve its timing invariants. */
export class AudibleMidiSchedulerError extends Error {
  readonly code: AudibleMidiSchedulerErrorCode

  constructor(code: AudibleMidiSchedulerErrorCode, message: string) {
    super(message)
    this.name = 'AudibleMidiSchedulerError'
    this.code = code
  }
}

export interface AudibleMidiSchedulerConfiguration {
  readonly wakeCadenceSecond: PlaybackClockDurationSecond
  readonly lookAheadHorizonSecond: PlaybackClockDurationSecond
}

export type ScheduledVoiceTiming = 'late-immediate' | 'on-time'

export interface ScheduledSampleVoicePlan {
  readonly kind: 'sample-voice'
  readonly occurrenceKey: NoteOccurrenceKey
  readonly trackId: TrackId
  readonly instrumentDeviceId: DeviceId
  readonly soundbankId: SoundbankId
  readonly masterGain: LinearGain
  readonly trackGain: LinearGain
  readonly pan: BipolarValue
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
  readonly startPlaybackClockSecond: PlaybackClockSecond
  /** Authored Note Off target; it can precede a late-immediate Voice start. */
  readonly keyReleasePlaybackClockSecond: PlaybackClockSecond
  /** Final Gate Release after CC64 hold; Audio Runtime releases gated Zones here. */
  readonly releasePlaybackClockSecond: PlaybackClockSecond
  readonly timing: ScheduledVoiceTiming
}

export interface AudibleMidiScheduleWindow {
  readonly fromPlaybackClockSecond: PlaybackClockSecond
  readonly toPlaybackClockSecond: PlaybackClockSecond
}

export interface AudibleMidiScheduleBatch {
  readonly outcome: AudibleMidiSchedulerOutcome
  readonly mappingGeneration: MappingGeneration
  readonly modelRevision: ModelRevision
  readonly planningPlaybackClockSecond: PlaybackClockSecond | null
  readonly window: AudibleMidiScheduleWindow | null
  readonly voicePlans: readonly ScheduledSampleVoicePlan[]
}

export interface AudibleMidiSchedulerPlanner {
  planNextWindow(snapshot: AudibleMidiTransportSnapshot): AudibleMidiScheduleBatch
}

interface SchedulerTrackRoute {
  readonly instrumentDeviceId: DeviceId
  readonly soundbankId: SoundbankId
  readonly trackGain: LinearGain
  readonly pan: BipolarValue
}

interface NormalizedSchedulerConfiguration {
  readonly lookAheadHorizonSecond: PlaybackClockDurationSecond
}

function normalizeConfiguration(
  input: AudibleMidiSchedulerConfiguration,
): NormalizedSchedulerConfiguration {
  let wakeCadenceSecond: PlaybackClockDurationSecond
  let lookAheadHorizonSecond: PlaybackClockDurationSecond

  try {
    wakeCadenceSecond = parsePlaybackClockDurationSecond(input.wakeCadenceSecond)
    lookAheadHorizonSecond = parsePlaybackClockDurationSecond(input.lookAheadHorizonSecond)
  } catch {
    throw new AudibleMidiSchedulerError(
      'invalid-scheduler-configuration',
      'Scheduler cadence and horizon must be finite non-negative Playback Clock durations',
    )
  }

  if (wakeCadenceSecond <= 0 || lookAheadHorizonSecond <= wakeCadenceSecond) {
    throw new AudibleMidiSchedulerError(
      'invalid-scheduler-configuration',
      'Scheduler requires a positive cadence and a look-ahead horizon greater than cadence',
    )
  }

  return Object.freeze({ lookAheadHorizonSecond })
}

function trackRoutes(plan: AudibleMidiProjectPlan): ReadonlyMap<TrackId, SchedulerTrackRoute> {
  return new Map(
    plan.tracks.map((track) => [
      track.trackId,
      Object.freeze({
        instrumentDeviceId: track.instrumentDeviceId,
        pan: track.pan,
        soundbankId: track.instrument.soundbankId,
        trackGain: track.gain,
      }),
    ]),
  )
}

function parseCalculatedPlaybackClockSecond(value: number, context: string): PlaybackClockSecond {
  try {
    return parsePlaybackClockSecond(value)
  } catch {
    throw new AudibleMidiSchedulerError(
      'playback-clock-window-out-of-range',
      `${context} produced an out-of-range PlaybackClockSecond`,
    )
  }
}

function findFirstSpanAtOrAfter(spans: readonly MidiNoteSpanPlan[], tickPosition: number): number {
  let lowerIndex = 0
  let upperIndex = spans.length

  while (lowerIndex < upperIndex) {
    const candidateIndex = Math.floor((lowerIndex + upperIndex) / 2)
    const candidate = spans[candidateIndex]
    if (candidate !== undefined && candidate.startTick < tickPosition) {
      lowerIndex = candidateIndex + 1
    } else {
      upperIndex = candidateIndex
    }
  }

  return lowerIndex
}

function createBatch(input: {
  readonly outcome: AudibleMidiSchedulerOutcome
  readonly mappingGeneration: MappingGeneration
  readonly modelRevision: ModelRevision
  readonly planningPlaybackClockSecond?: PlaybackClockSecond
  readonly window?: AudibleMidiScheduleWindow
  readonly voicePlans?: readonly ScheduledSampleVoicePlan[]
}): AudibleMidiScheduleBatch {
  return Object.freeze({
    mappingGeneration: input.mappingGeneration,
    modelRevision: input.modelRevision,
    outcome: input.outcome,
    planningPlaybackClockSecond: input.planningPlaybackClockSecond ?? null,
    voicePlans: input.voicePlans ?? Object.freeze([]),
    window: input.window ?? null,
  })
}

/**
 * Creates a browser-independent look-ahead planner without owning a Timer or audio resource. It
 * reads the plan's spans in place, one Clip at a time, so creating one costs the number of Clips.
 */
export function createAudibleMidiSchedulerPlanner(
  plan: AudibleMidiProjectPlan,
  configurationInput: AudibleMidiSchedulerConfiguration,
): AudibleMidiSchedulerPlanner {
  const configuration = normalizeConfiguration(configurationInput)
  const modelRevision = plan.modelRevision
  const masterGain = plan.master.gain
  const timelineEndTick = plan.timelineEndTick
  const tempoMap: TempoMap = createTempoMapFromSegments(plan.tempoSegments)
  const timelineEndProjectSecond = tempoMap.projectSecondAtTick(timelineEndTick)
  const routes = trackRoutes(plan)
  // Each run is one Clip's spans in span order, with the index of the next span to plan.
  const runs = [...plan.clipSpans.values()].filter((spans) => spans.length > 0)
  const cursors = runs.map(() => 0)

  let highestObservedGeneration: MappingGeneration | null = null
  let activeGeneration: MappingGeneration | null = null
  let activeAnchorPlaybackClockSecond: PlaybackClockSecond | null = null
  let activeAnchorProjectSecond: ProjectSecond | null = null
  let plannedThroughPlaybackClockSecond: PlaybackClockSecond | null = null

  function clearActivePlanningState(): void {
    activeGeneration = null
    activeAnchorPlaybackClockSecond = null
    activeAnchorProjectSecond = null
    plannedThroughPlaybackClockSecond = null
    cursors.fill(0)
  }

  function assertSnapshotMatchesPlan(snapshot: AudibleMidiTransportSnapshot): void {
    if (
      snapshot.modelRevision !== modelRevision ||
      snapshot.timelineEndTick !== timelineEndTick ||
      snapshot.timelineEndProjectSecond !== timelineEndProjectSecond
    ) {
      throw new AudibleMidiSchedulerError(
        'transport-plan-mismatch',
        'Scheduler received a Transport Snapshot from a different compiled Plan',
      )
    }
  }

  function observeGeneration(generation: MappingGeneration): void {
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      (highestObservedGeneration !== null && generation < highestObservedGeneration)
    ) {
      throw new AudibleMidiSchedulerError(
        'stale-mapping-generation',
        `Scheduler cannot return to stale mappingGeneration ${generation}`,
      )
    }

    if (highestObservedGeneration === null || generation > highestObservedGeneration) {
      highestObservedGeneration = generation
      clearActivePlanningState()
    }
  }

  function initializeGeneration(snapshot: PlayingAudibleMidiTransportSnapshot): void {
    const anchorTickPosition = tempoMap.tickPositionAtProjectSecond(snapshot.anchorProjectSecond)

    activeGeneration = snapshot.mappingGeneration
    activeAnchorPlaybackClockSecond = snapshot.anchorPlaybackClockSecond
    activeAnchorProjectSecond = snapshot.anchorProjectSecond
    plannedThroughPlaybackClockSecond = snapshot.anchorPlaybackClockSecond
    runs.forEach((spans, run) => {
      cursors[run] = findFirstSpanAtOrAfter(spans, anchorTickPosition)
    })
  }

  function assertStableMapping(snapshot: PlayingAudibleMidiTransportSnapshot): void {
    if (
      activeAnchorPlaybackClockSecond !== snapshot.anchorPlaybackClockSecond ||
      activeAnchorProjectSecond !== snapshot.anchorProjectSecond
    ) {
      throw new AudibleMidiSchedulerError(
        'transport-mapping-changed-without-generation',
        'Transport mapping changed without a new mappingGeneration',
      )
    }
  }

  function playbackClockSecondAtProjectSecond(projectSecond: ProjectSecond): PlaybackClockSecond {
    if (activeAnchorPlaybackClockSecond === null || activeAnchorProjectSecond === null) {
      throw new AudibleMidiSchedulerError(
        'transport-plan-mismatch',
        'Scheduler has no active Transport mapping',
      )
    }

    return parseCalculatedPlaybackClockSecond(
      activeAnchorPlaybackClockSecond + (projectSecond - activeAnchorProjectSecond),
      `ProjectSecond ${projectSecond}`,
    )
  }

  function createScheduledVoice(
    span: MidiNoteSpanPlan,
    route: SchedulerTrackRoute,
    startPlaybackClockSecond: PlaybackClockSecond,
    keyReleasePlaybackClockSecond: PlaybackClockSecond,
    releasePlaybackClockSecond: PlaybackClockSecond,
    timing: ScheduledVoiceTiming,
  ): ScheduledSampleVoicePlan {
    return Object.freeze({
      channel: span.channel,
      instrumentDeviceId: route.instrumentDeviceId,
      kind: 'sample-voice',
      keyReleasePlaybackClockSecond,
      masterGain,
      occurrenceKey: span.occurrenceKey,
      pan: route.pan,
      pitch: span.pitch,
      releasePlaybackClockSecond,
      soundbankId: route.soundbankId,
      startPlaybackClockSecond,
      timing,
      trackGain: route.trackGain,
      trackId: span.trackId,
      velocity: span.velocity,
    })
  }

  function planNextWindow(snapshot: AudibleMidiTransportSnapshot): AudibleMidiScheduleBatch {
    assertSnapshotMatchesPlan(snapshot)
    observeGeneration(snapshot.mappingGeneration)

    if (snapshot.state !== 'playing') {
      return createBatch({
        mappingGeneration: snapshot.mappingGeneration,
        modelRevision,
        outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.INACTIVE,
      })
    }

    if (activeGeneration !== snapshot.mappingGeneration) {
      initializeGeneration(snapshot)
    } else {
      assertStableMapping(snapshot)
    }

    if (plannedThroughPlaybackClockSecond === null) {
      throw new AudibleMidiSchedulerError(
        'schedule-cursor-inconsistent',
        'Playing Scheduler generation has no planned-through cursor',
      )
    }
    if (
      snapshot.positionProjectSecond < snapshot.anchorProjectSecond ||
      snapshot.positionProjectSecond > timelineEndProjectSecond
    ) {
      throw new AudibleMidiSchedulerError(
        'transport-plan-mismatch',
        'Transport Snapshot position is outside its active Project range',
      )
    }

    const planningPlaybackClockSecond = playbackClockSecondAtProjectSecond(
      snapshot.positionProjectSecond,
    )
    const timelineEndPlaybackClockSecond =
      playbackClockSecondAtProjectSecond(timelineEndProjectSecond)
    const candidateWindowEnd = Math.min(
      planningPlaybackClockSecond + configuration.lookAheadHorizonSecond,
      timelineEndPlaybackClockSecond,
    )
    const toPlaybackClockSecond = parseCalculatedPlaybackClockSecond(
      candidateWindowEnd,
      'Scheduler look-ahead window end',
    )
    const fromPlaybackClockSecond = plannedThroughPlaybackClockSecond

    if (toPlaybackClockSecond <= fromPlaybackClockSecond) {
      return createBatch({
        mappingGeneration: snapshot.mappingGeneration,
        modelRevision,
        outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.NO_CHANGE,
        planningPlaybackClockSecond,
      })
    }

    // Windows are half-open; an event exactly at the horizon belongs to the next wake.
    const windowSpans: MidiNoteSpanPlan[] = []
    const nextCursors = [...cursors]
    runs.forEach((spans, run) => {
      let index = nextCursors[run]!
      for (; index < spans.length; index += 1) {
        const span = spans[index]!
        const targetStartPlaybackClockSecond = playbackClockSecondAtProjectSecond(
          tempoMap.projectSecondAtTick(span.startTick),
        )
        if (targetStartPlaybackClockSecond >= toPlaybackClockSecond) break
        if (targetStartPlaybackClockSecond < fromPlaybackClockSecond) {
          throw new AudibleMidiSchedulerError(
            'schedule-cursor-inconsistent',
            `Occurrence ${span.occurrenceKey} fell behind the continuous Scheduler cursor`,
          )
        }
        windowSpans.push(span)
      }
      nextCursors[run] = index
    })

    const voicePlans: ScheduledSampleVoicePlan[] = []
    for (const span of windowSpans.sort(compareNoteSpans)) {
      const targetReleasePlaybackClockSecond = playbackClockSecondAtProjectSecond(
        tempoMap.projectSecondAtTick(span.releaseTick),
      )
      // A span whose release already passed is dropped; one that already started starts now.
      if (targetReleasePlaybackClockSecond <= planningPlaybackClockSecond) continue

      const targetStartPlaybackClockSecond = playbackClockSecondAtProjectSecond(
        tempoMap.projectSecondAtTick(span.startTick),
      )
      const targetKeyReleasePlaybackClockSecond = playbackClockSecondAtProjectSecond(
        tempoMap.projectSecondAtTick(span.endTick),
      )
      const isLate = targetStartPlaybackClockSecond < planningPlaybackClockSecond

      voicePlans.push(
        createScheduledVoice(
          span,
          routes.get(span.trackId)!,
          isLate ? planningPlaybackClockSecond : targetStartPlaybackClockSecond,
          targetKeyReleasePlaybackClockSecond,
          targetReleasePlaybackClockSecond,
          isLate ? 'late-immediate' : 'on-time',
        ),
      )
    }

    // Publish the cursors only after the complete batch is valid.
    nextCursors.forEach((index, run) => {
      cursors[run] = index
    })
    plannedThroughPlaybackClockSecond = toPlaybackClockSecond

    const window = Object.freeze({ fromPlaybackClockSecond, toPlaybackClockSecond })
    return createBatch({
      mappingGeneration: snapshot.mappingGeneration,
      modelRevision,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED,
      planningPlaybackClockSecond,
      voicePlans: Object.freeze(voicePlans),
      window,
    })
  }

  return Object.freeze({ planNextWindow })
}
