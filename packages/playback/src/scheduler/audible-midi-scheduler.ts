import type {
  BipolarValue,
  DeviceId,
  LinearGain,
  MidiChannel,
  MidiPitch,
  MidiVelocity,
  ModelRevision,
  TrackId,
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
  type PlaybackClockDurationSecond,
  type PlaybackClockSecond,
} from '#internal/time/project-time'
import { createTempoMapFromSegments } from '#internal/time/tempo-map'
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

/** The horizon, once cadence and horizon are valid durations with the horizon past the cadence. */
function lookAheadHorizon(configuration: AudibleMidiSchedulerConfiguration): number {
  const wakeCadenceSecond = parsePlaybackClockDurationSecond(configuration.wakeCadenceSecond)
  const horizonSecond = parsePlaybackClockDurationSecond(configuration.lookAheadHorizonSecond)
  if (wakeCadenceSecond <= 0 || horizonSecond <= wakeCadenceSecond) {
    throw new RangeError(
      'Scheduler requires a positive cadence and a look-ahead horizon greater than cadence',
    )
  }
  return horizonSecond
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

function findFirstSpanAtOrAfter(spans: readonly MidiNoteSpanPlan[], tickPosition: number): number {
  let lowerIndex = 0
  let upperIndex = spans.length

  while (lowerIndex < upperIndex) {
    const candidateIndex = Math.floor((lowerIndex + upperIndex) / 2)
    if (spans[candidateIndex]!.startTick < tickPosition) lowerIndex = candidateIndex + 1
    else upperIndex = candidateIndex
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
 * Snapshots come from the Transport of the same plan, so the planner follows their mapping
 * without checking it.
 */
export function createAudibleMidiSchedulerPlanner(
  plan: AudibleMidiProjectPlan,
  configuration: AudibleMidiSchedulerConfiguration,
): AudibleMidiSchedulerPlanner {
  const lookAheadHorizonSecond = lookAheadHorizon(configuration)
  const modelRevision = plan.modelRevision
  const masterGain = plan.master.gain
  const tempoMap = createTempoMapFromSegments(plan.tempoSegments)
  const timelineEndProjectSecond = tempoMap.projectSecondAtTick(plan.timelineEndTick)
  const routes = trackRoutes(plan)
  // Each run is one Clip's spans in span order, with the index of the next span to plan.
  const runs = [...plan.clipSpans.values()].filter((spans) => spans.length > 0)
  const cursors = runs.map(() => 0)

  // The mapping of the generation being planned, and how far ahead it is planned.
  let generation: MappingGeneration | null = null
  let anchorPlaybackClockSecond = 0
  let anchorProjectSecond = 0
  let plannedThroughPlaybackClockSecond = 0

  function clockAtProjectSecond(projectSecond: number): PlaybackClockSecond {
    return (anchorPlaybackClockSecond +
      (projectSecond - anchorProjectSecond)) as PlaybackClockSecond
  }

  function clockAtTick(tick: MidiNoteSpanPlan['startTick']): PlaybackClockSecond {
    return clockAtProjectSecond(tempoMap.projectSecondAtTick(tick))
  }

  /** A new generation starts from its Anchor: each Clip at its first span not before it. */
  function startGeneration(snapshot: PlayingAudibleMidiTransportSnapshot): void {
    generation = snapshot.mappingGeneration
    anchorPlaybackClockSecond = snapshot.anchorPlaybackClockSecond
    anchorProjectSecond = snapshot.anchorProjectSecond
    plannedThroughPlaybackClockSecond = snapshot.anchorPlaybackClockSecond
    const anchorTickPosition = tempoMap.tickPositionAtProjectSecond(snapshot.anchorProjectSecond)
    runs.forEach((spans, run) => {
      cursors[run] = findFirstSpanAtOrAfter(spans, anchorTickPosition)
    })
  }

  function createScheduledVoice(
    span: MidiNoteSpanPlan,
    startPlaybackClockSecond: PlaybackClockSecond,
    keyReleasePlaybackClockSecond: PlaybackClockSecond,
    releasePlaybackClockSecond: PlaybackClockSecond,
    timing: ScheduledVoiceTiming,
  ): ScheduledSampleVoicePlan {
    const route = routes.get(span.trackId)!
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
    if (snapshot.state !== 'playing') {
      return createBatch({
        mappingGeneration: snapshot.mappingGeneration,
        modelRevision,
        outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.INACTIVE,
      })
    }
    if (snapshot.mappingGeneration !== generation) startGeneration(snapshot)

    const planningPlaybackClockSecond = clockAtProjectSecond(snapshot.positionProjectSecond)
    const toPlaybackClockSecond = Math.min(
      planningPlaybackClockSecond + lookAheadHorizonSecond,
      clockAtProjectSecond(timelineEndProjectSecond),
    ) as PlaybackClockSecond
    const fromPlaybackClockSecond = plannedThroughPlaybackClockSecond as PlaybackClockSecond

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
    runs.forEach((spans, run) => {
      let index = cursors[run]!
      while (index < spans.length && clockAtTick(spans[index]!.startTick) < toPlaybackClockSecond) {
        windowSpans.push(spans[index]!)
        index += 1
      }
      cursors[run] = index
    })

    const voicePlans: ScheduledSampleVoicePlan[] = []
    for (const span of windowSpans.sort(compareNoteSpans)) {
      const releasePlaybackClockSecond = clockAtTick(span.releaseTick)
      // A span whose release already passed is dropped; one that already started starts now.
      if (releasePlaybackClockSecond <= planningPlaybackClockSecond) continue

      const startPlaybackClockSecond = clockAtTick(span.startTick)
      const isLate = startPlaybackClockSecond < planningPlaybackClockSecond
      voicePlans.push(
        createScheduledVoice(
          span,
          isLate ? planningPlaybackClockSecond : startPlaybackClockSecond,
          clockAtTick(span.endTick),
          releasePlaybackClockSecond,
          isLate ? 'late-immediate' : 'on-time',
        ),
      )
    }
    plannedThroughPlaybackClockSecond = toPlaybackClockSecond

    return createBatch({
      mappingGeneration: snapshot.mappingGeneration,
      modelRevision,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED,
      planningPlaybackClockSecond,
      voicePlans: Object.freeze(voicePlans),
      window: Object.freeze({ fromPlaybackClockSecond, toPlaybackClockSecond }),
    })
  }

  return Object.freeze({ planNextWindow })
}
