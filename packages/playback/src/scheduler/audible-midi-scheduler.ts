import {
  parseTick,
  type BipolarValue,
  type DeviceId,
  type LinearGain,
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
  type ModelRevision,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import type {
  AudibleMidiProjectPlan,
  MidiNoteSpanPlan,
  NoteOccurrenceKey,
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
  EngineGeneration,
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
  | 'duplicate-note-occurrence-key'
  | 'duplicate-track-route'
  | 'inaudible-track-route'
  | 'invalid-note-span'
  | 'invalid-note-span-order'
  | 'invalid-scheduler-configuration'
  | 'missing-track-route'
  | 'playback-clock-window-out-of-range'
  | 'schedule-cursor-inconsistent'
  | 'stale-engine-generation'
  | 'timeline-end-before-arrangement-end'
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
  readonly engineGeneration: EngineGeneration
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

export interface AudibleMidiSchedulerDiagnostics {
  readonly duplicateSuppressionCount: number
  readonly expiredSpanDropCount: number
  readonly lateStartCount: number
}

export interface AudibleMidiScheduleBatch {
  readonly outcome: AudibleMidiSchedulerOutcome
  readonly engineGeneration: EngineGeneration
  readonly modelRevision: ModelRevision
  readonly planningPlaybackClockSecond: PlaybackClockSecond | null
  readonly window: AudibleMidiScheduleWindow | null
  readonly voicePlans: readonly ScheduledSampleVoicePlan[]
  readonly diagnostics: AudibleMidiSchedulerDiagnostics
}

export interface AudibleMidiSchedulerPlanner {
  planNextWindow(snapshot: AudibleMidiTransportSnapshot): AudibleMidiScheduleBatch
}

interface SchedulerTrackRoute {
  readonly audible: boolean
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

function normalizeTrackRoutes(
  plan: AudibleMidiProjectPlan,
): ReadonlyMap<TrackId, SchedulerTrackRoute> {
  const routes = new Map<TrackId, SchedulerTrackRoute>()

  for (const track of plan.tracks) {
    if (routes.has(track.trackId)) {
      throw new AudibleMidiSchedulerError(
        'duplicate-track-route',
        `Scheduler Plan contains duplicate Track route ${track.trackId}`,
      )
    }

    routes.set(
      track.trackId,
      Object.freeze({
        audible: track.audible,
        instrumentDeviceId: track.instrumentDeviceId,
        pan: track.pan,
        soundbankId: track.instrument.soundbankId,
        trackGain: track.gain,
      }),
    )
  }

  return routes
}

function normalizeNoteSpans(
  plan: AudibleMidiProjectPlan,
  routes: ReadonlyMap<TrackId, SchedulerTrackRoute>,
  arrangementEndTick: Tick,
): readonly MidiNoteSpanPlan[] {
  const occurrenceKeys = new Set<NoteOccurrenceKey>()
  const spans: MidiNoteSpanPlan[] = []
  let previousStartTick: Tick | null = null

  for (const inputSpan of plan.midiNoteSpans) {
    const startTick = parseTick(inputSpan.startTick)
    const endTick = parseTick(inputSpan.endTick)
    const releaseTick = parseTick(inputSpan.releaseTick)
    if (
      endTick <= startTick ||
      endTick > arrangementEndTick ||
      releaseTick < endTick ||
      releaseTick > arrangementEndTick
    ) {
      throw new AudibleMidiSchedulerError(
        'invalid-note-span',
        `Scheduler Note Span ${inputSpan.occurrenceKey} has an invalid Tick range`,
      )
    }
    if (previousStartTick !== null && startTick < previousStartTick) {
      throw new AudibleMidiSchedulerError(
        'invalid-note-span-order',
        'Scheduler Note Spans must remain sorted by startTick',
      )
    }
    if (occurrenceKeys.has(inputSpan.occurrenceKey)) {
      throw new AudibleMidiSchedulerError(
        'duplicate-note-occurrence-key',
        `Scheduler Plan contains duplicate occurrence key ${inputSpan.occurrenceKey}`,
      )
    }

    const route = routes.get(inputSpan.trackId)
    if (route === undefined) {
      throw new AudibleMidiSchedulerError(
        'missing-track-route',
        `Scheduler Note Span ${inputSpan.occurrenceKey} has no Track route`,
      )
    }
    if (!route.audible) {
      throw new AudibleMidiSchedulerError(
        'inaudible-track-route',
        `Scheduler Note Span ${inputSpan.occurrenceKey} targets an inaudible Track`,
      )
    }

    occurrenceKeys.add(inputSpan.occurrenceKey)
    spans.push(Object.freeze({ ...inputSpan, endTick, releaseTick, startTick }))
    previousStartTick = startTick
  }

  return Object.freeze(spans)
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

function createDiagnostics(
  duplicateSuppressionCount = 0,
  expiredSpanDropCount = 0,
  lateStartCount = 0,
): AudibleMidiSchedulerDiagnostics {
  return Object.freeze({ duplicateSuppressionCount, expiredSpanDropCount, lateStartCount })
}

function createBatch(input: {
  readonly outcome: AudibleMidiSchedulerOutcome
  readonly engineGeneration: EngineGeneration
  readonly modelRevision: ModelRevision
  readonly planningPlaybackClockSecond?: PlaybackClockSecond
  readonly window?: AudibleMidiScheduleWindow
  readonly voicePlans?: readonly ScheduledSampleVoicePlan[]
  readonly diagnostics?: AudibleMidiSchedulerDiagnostics
}): AudibleMidiScheduleBatch {
  return Object.freeze({
    diagnostics: input.diagnostics ?? createDiagnostics(),
    engineGeneration: input.engineGeneration,
    modelRevision: input.modelRevision,
    outcome: input.outcome,
    planningPlaybackClockSecond: input.planningPlaybackClockSecond ?? null,
    voicePlans: input.voicePlans ?? Object.freeze([]),
    window: input.window ?? null,
  })
}

/** Creates a browser-independent look-ahead planner without owning a Timer or audio resource. */
export function createAudibleMidiSchedulerPlanner(
  plan: AudibleMidiProjectPlan,
  configurationInput: AudibleMidiSchedulerConfiguration,
): AudibleMidiSchedulerPlanner {
  const configuration = normalizeConfiguration(configurationInput)
  const modelRevision = plan.modelRevision
  const masterGain = plan.master.gain
  const arrangementEndTick = parseTick(plan.arrangementEndTick)
  const timelineEndTick = parseTick(plan.timelineEndTick)
  if (timelineEndTick < arrangementEndTick) {
    throw new AudibleMidiSchedulerError(
      'timeline-end-before-arrangement-end',
      `Timeline End ${timelineEndTick} cannot precede Arrangement End ${arrangementEndTick}`,
    )
  }
  const tempoMap: TempoMap = createTempoMapFromSegments(plan.tempoSegments)
  const timelineEndProjectSecond = tempoMap.projectSecondAtTick(timelineEndTick)
  const routes = normalizeTrackRoutes(plan)
  const spans = normalizeNoteSpans(plan, routes, arrangementEndTick)

  let highestObservedGeneration: EngineGeneration | null = null
  let activeGeneration: EngineGeneration | null = null
  let activeAnchorPlaybackClockSecond: PlaybackClockSecond | null = null
  let activeAnchorProjectSecond: ProjectSecond | null = null
  let plannedThroughPlaybackClockSecond: PlaybackClockSecond | null = null
  let nextSpanIndex = 0
  const handledOccurrenceKeys = new Set<NoteOccurrenceKey>()

  function clearActivePlanningState(): void {
    activeGeneration = null
    activeAnchorPlaybackClockSecond = null
    activeAnchorProjectSecond = null
    plannedThroughPlaybackClockSecond = null
    nextSpanIndex = 0
    handledOccurrenceKeys.clear()
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

  function observeGeneration(generation: EngineGeneration): void {
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      (highestObservedGeneration !== null && generation < highestObservedGeneration)
    ) {
      throw new AudibleMidiSchedulerError(
        'stale-engine-generation',
        `Scheduler cannot return to stale engineGeneration ${generation}`,
      )
    }

    if (highestObservedGeneration === null || generation > highestObservedGeneration) {
      highestObservedGeneration = generation
      clearActivePlanningState()
    }
  }

  function initializeGeneration(snapshot: PlayingAudibleMidiTransportSnapshot): void {
    const anchorTickPosition = tempoMap.tickPositionAtProjectSecond(snapshot.anchorProjectSecond)

    activeGeneration = snapshot.engineGeneration
    activeAnchorPlaybackClockSecond = snapshot.anchorPlaybackClockSecond
    activeAnchorProjectSecond = snapshot.anchorProjectSecond
    plannedThroughPlaybackClockSecond = snapshot.anchorPlaybackClockSecond
    nextSpanIndex = findFirstSpanAtOrAfter(spans, anchorTickPosition)
    handledOccurrenceKeys.clear()
  }

  function assertStableMapping(snapshot: PlayingAudibleMidiTransportSnapshot): void {
    if (
      activeAnchorPlaybackClockSecond !== snapshot.anchorPlaybackClockSecond ||
      activeAnchorProjectSecond !== snapshot.anchorProjectSecond
    ) {
      throw new AudibleMidiSchedulerError(
        'transport-mapping-changed-without-generation',
        'Transport mapping changed without a new engineGeneration',
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
    generation: EngineGeneration,
    startPlaybackClockSecond: PlaybackClockSecond,
    keyReleasePlaybackClockSecond: PlaybackClockSecond,
    releasePlaybackClockSecond: PlaybackClockSecond,
    timing: ScheduledVoiceTiming,
  ): ScheduledSampleVoicePlan {
    return Object.freeze({
      channel: span.channel,
      engineGeneration: generation,
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
    observeGeneration(snapshot.engineGeneration)

    if (snapshot.state !== 'playing') {
      return createBatch({
        engineGeneration: snapshot.engineGeneration,
        modelRevision,
        outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.INACTIVE,
      })
    }

    if (activeGeneration !== snapshot.engineGeneration) {
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
        engineGeneration: snapshot.engineGeneration,
        modelRevision,
        outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.NO_CHANGE,
        planningPlaybackClockSecond,
      })
    }

    const voicePlans: ScheduledSampleVoicePlan[] = []
    const newlyHandledKeys: NoteOccurrenceKey[] = []
    let candidateSpanIndex = nextSpanIndex
    let duplicateSuppressionCount = 0
    let expiredSpanDropCount = 0
    let lateStartCount = 0

    // Windows are half-open; an event exactly at the horizon belongs to the next wake.
    while (candidateSpanIndex < spans.length) {
      const span = spans[candidateSpanIndex]
      if (span === undefined) break

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

      candidateSpanIndex += 1
      if (handledOccurrenceKeys.has(span.occurrenceKey)) {
        duplicateSuppressionCount += 1
        continue
      }

      const targetReleasePlaybackClockSecond = playbackClockSecondAtProjectSecond(
        tempoMap.projectSecondAtTick(span.releaseTick),
      )
      const targetKeyReleasePlaybackClockSecond = playbackClockSecondAtProjectSecond(
        tempoMap.projectSecondAtTick(span.endTick),
      )
      newlyHandledKeys.push(span.occurrenceKey)

      if (targetReleasePlaybackClockSecond <= planningPlaybackClockSecond) {
        expiredSpanDropCount += 1
        continue
      }

      const route = routes.get(span.trackId)
      if (route === undefined) {
        throw new AudibleMidiSchedulerError(
          'missing-track-route',
          `Scheduler Note Span ${span.occurrenceKey} has no Track route`,
        )
      }

      const isLate = targetStartPlaybackClockSecond < planningPlaybackClockSecond
      const startPlaybackClockSecond = isLate
        ? planningPlaybackClockSecond
        : targetStartPlaybackClockSecond
      if (isLate) lateStartCount += 1

      voicePlans.push(
        createScheduledVoice(
          span,
          route,
          snapshot.engineGeneration,
          startPlaybackClockSecond,
          targetKeyReleasePlaybackClockSecond,
          targetReleasePlaybackClockSecond,
          isLate ? 'late-immediate' : 'on-time',
        ),
      )
    }

    // Publish cursor and deduplication state only after the complete batch is valid.
    nextSpanIndex = candidateSpanIndex
    plannedThroughPlaybackClockSecond = toPlaybackClockSecond
    for (const occurrenceKey of newlyHandledKeys) handledOccurrenceKeys.add(occurrenceKey)

    const window = Object.freeze({ fromPlaybackClockSecond, toPlaybackClockSecond })
    return createBatch({
      diagnostics: createDiagnostics(
        duplicateSuppressionCount,
        expiredSpanDropCount,
        lateStartCount,
      ),
      engineGeneration: snapshot.engineGeneration,
      modelRevision,
      outcome: AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED,
      planningPlaybackClockSecond,
      voicePlans: Object.freeze(voicePlans),
      window,
    })
  }

  return Object.freeze({ planNextWindow })
}
