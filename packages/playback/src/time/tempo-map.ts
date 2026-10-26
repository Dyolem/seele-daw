import {
  PROJECT_PPQ,
  type TempoBpm,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'

import type { ContinuousTickPosition, ProjectSecond } from './project-time'

export interface TempoSegmentPlan {
  readonly bpm: TempoBpm
  readonly secondsPerTick: number
  readonly startProjectSecond: ProjectSecond
  readonly startTick: Tick
}

export interface TempoMap {
  readonly segments: readonly TempoSegmentPlan[]
  projectSecondAtTick(tick: Tick): ProjectSecond
  projectSecondAtTickPosition(tickPosition: ContinuousTickPosition): ProjectSecond
  tickPositionAtProjectSecond(projectSecond: ProjectSecond): ContinuousTickPosition
}

function compareTempoEvents(left: TempoEventRecord, right: TempoEventRecord): number {
  if (left.tick !== right.tick) return left.tick - right.tick
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

/** One segment per Tempo Event, each starting where the previous one's time ran out. */
function createTempoSegments(
  tempoEvents: readonly TempoEventRecord[],
): readonly TempoSegmentPlan[] {
  const segments: TempoSegmentPlan[] = []

  for (const tempoEvent of [...tempoEvents].sort(compareTempoEvents)) {
    const previous = segments.at(-1)
    const startProjectSecond =
      previous === undefined
        ? 0
        : previous.startProjectSecond +
          (tempoEvent.tick - previous.startTick) * previous.secondsPerTick

    segments.push(
      Object.freeze({
        bpm: tempoEvent.bpm,
        secondsPerTick: 60 / (tempoEvent.bpm * PROJECT_PPQ),
        startProjectSecond: startProjectSecond as ProjectSecond,
        startTick: tempoEvent.tick,
      }),
    )
  }

  return Object.freeze(segments)
}

/** The last segment that starts at or before the target. */
function segmentAt(
  segments: readonly TempoSegmentPlan[],
  target: number,
  positionOf: (segment: TempoSegmentPlan) => number,
): TempoSegmentPlan {
  let lower = 1
  let upper = segments.length - 1
  let selected = segments[0]!

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2)
    const candidate = segments[middle]!

    if (positionOf(candidate) <= target) {
      selected = candidate
      lower = middle + 1
    } else {
      upper = middle - 1
    }
  }

  return selected
}

function createTempoMapFromValidSegments(segments: readonly TempoSegmentPlan[]): TempoMap {
  function projectSecondAtTickPosition(tickPosition: ContinuousTickPosition): ProjectSecond {
    const segment = segmentAt(segments, tickPosition, ({ startTick }) => startTick)
    return (segment.startProjectSecond +
      (tickPosition - segment.startTick) * segment.secondsPerTick) as ProjectSecond
  }

  function tickPositionAtProjectSecond(projectSecond: ProjectSecond): ContinuousTickPosition {
    const segment = segmentAt(
      segments,
      projectSecond,
      ({ startProjectSecond }) => startProjectSecond,
    )
    return (segment.startTick +
      (projectSecond - segment.startProjectSecond) /
        segment.secondsPerTick) as ContinuousTickPosition
  }

  return Object.freeze({
    projectSecondAtTick: (tick: Tick) =>
      projectSecondAtTickPosition(tick as number as ContinuousTickPosition),
    projectSecondAtTickPosition,
    segments,
    tickPositionAtProjectSecond,
  })
}

/**
 * A TempoMap from Tempo Events in any order. Project facts hold exactly one event at Tick 0 and
 * at most one per Tick; a caller that previews other events checks that itself.
 */
export function createTempoMap(tempoEvents: readonly TempoEventRecord[]): TempoMap {
  return createTempoMapFromValidSegments(createTempoSegments(tempoEvents))
}

/** Resolves one Project Tick for presentation without exposing TempoMap internals. */
export function resolveProjectSecondAtTick(
  tempoEvents: readonly TempoEventRecord[],
  tick: Tick,
): ProjectSecond {
  return createTempoMap(tempoEvents).projectSecondAtTick(tick)
}

/** Rehydrates the TempoMap of a compiled plan from its segments. */
export function createTempoMapFromSegments(segments: readonly TempoSegmentPlan[]): TempoMap {
  return createTempoMapFromValidSegments(segments)
}
