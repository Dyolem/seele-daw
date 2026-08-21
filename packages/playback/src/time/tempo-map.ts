import {
  PROJECT_PPQ,
  createTempoEventRecord,
  parseTempoBpm,
  parseTick,
  type TempoBpm,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'

import {
  parseContinuousTickPosition,
  parseProjectDurationSecond,
  parseProjectSecond,
  type ContinuousTickPosition,
  type ProjectDurationSecond,
  type ProjectSecond,
} from './project-time'

export type TempoMapErrorCode =
  | 'duplicate-tempo-event-tick'
  | 'invalid-initial-tempo-event-count'
  | 'invalid-tempo-event'
  | 'invalid-tempo-event-list'
  | 'invalid-tempo-segment'
  | 'invalid-tempo-segment-list'
  | 'inconsistent-tempo-segment'
  | 'numeric-result-out-of-range'
  | 'reversed-tick-range'

/** Stable failure raised while creating or querying a browser-independent TempoMap. */
export class TempoMapError extends Error {
  readonly code: TempoMapErrorCode

  constructor(code: TempoMapErrorCode, message: string) {
    super(message)
    this.name = 'TempoMapError'
    this.code = code
  }
}

export interface TempoSegmentPlan {
  readonly bpm: TempoBpm
  readonly secondsPerTick: number
  readonly startProjectSecond: ProjectSecond
  readonly startTick: Tick
}

interface LocatedTempoSegment {
  readonly index: number
  readonly segment: TempoSegmentPlan
}

export interface TempoMap {
  readonly segments: readonly TempoSegmentPlan[]
  projectSecondAtTick(tick: Tick): ProjectSecond
  projectSecondAtTickPosition(tickPosition: ContinuousTickPosition): ProjectSecond
  tickPositionAtProjectSecond(projectSecond: ProjectSecond): ContinuousTickPosition
  durationBetweenTicks(startTick: Tick, endTick: Tick): ProjectDurationSecond
}

function describeCause(cause: unknown): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : 'unknown failure'
}

function normalizeTempoEvents(input: readonly TempoEventRecord[]): readonly TempoEventRecord[] {
  // Preserve the static element type because Array.isArray narrows readonly arrays to any[].
  const tempoEventRecords: readonly TempoEventRecord[] = input

  if (!Array.isArray(input)) {
    throw new TempoMapError('invalid-tempo-event-list', 'TempoMap requires a Tempo Event array')
  }

  const tempoEvents = tempoEventRecords.map((tempoEvent, eventIndex) => {
    try {
      return createTempoEventRecord(tempoEvent)
    } catch (cause) {
      throw new TempoMapError(
        'invalid-tempo-event',
        `Tempo Event at input index ${eventIndex} is invalid: ${describeCause(cause)}`,
      )
    }
  })
  tempoEvents.sort((left, right) => {
    if (left.tick !== right.tick) return left.tick - right.tick
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })

  const initialEventCount = tempoEvents.filter(({ tick }) => tick === 0).length
  if (initialEventCount !== 1) {
    throw new TempoMapError(
      'invalid-initial-tempo-event-count',
      `TempoMap requires exactly one Tempo Event at Tick 0, received ${initialEventCount}`,
    )
  }

  for (let index = 1; index < tempoEvents.length; index += 1) {
    const previous = tempoEvents[index - 1]
    const current = tempoEvents[index]
    if (previous !== undefined && current !== undefined && previous.tick === current.tick) {
      throw new TempoMapError(
        'duplicate-tempo-event-tick',
        `Tempo Events ${previous.id} and ${current.id} share Tick ${current.tick}`,
      )
    }
  }

  return Object.freeze(tempoEvents)
}

function parseCalculatedProjectSecond(value: number, context: string): ProjectSecond {
  try {
    return parseProjectSecond(value)
  } catch {
    throw new TempoMapError(
      'numeric-result-out-of-range',
      `${context} produced an out-of-range ProjectSecond`,
    )
  }
}

function parseCalculatedTickPosition(value: number, context: string): ContinuousTickPosition {
  try {
    return parseContinuousTickPosition(value)
  } catch {
    throw new TempoMapError(
      'numeric-result-out-of-range',
      `${context} produced an out-of-range ContinuousTickPosition`,
    )
  }
}

function parseCalculatedDuration(value: number, context: string): ProjectDurationSecond {
  try {
    return parseProjectDurationSecond(value)
  } catch {
    throw new TempoMapError(
      'numeric-result-out-of-range',
      `${context} produced an out-of-range ProjectDurationSecond`,
    )
  }
}

function createTempoSegments(
  tempoEvents: readonly TempoEventRecord[],
): readonly TempoSegmentPlan[] {
  const segments: TempoSegmentPlan[] = []
  let previousSegment: TempoSegmentPlan | null = null

  for (const tempoEvent of tempoEvents) {
    let startProjectSecond = parseProjectSecond(0)

    if (previousSegment !== null) {
      const elapsedTick = tempoEvent.tick - previousSegment.startTick
      const calculatedStart =
        previousSegment.startProjectSecond + elapsedTick * previousSegment.secondsPerTick
      startProjectSecond = parseCalculatedProjectSecond(
        calculatedStart,
        `Tempo Segment at Tick ${tempoEvent.tick}`,
      )

      if (startProjectSecond <= previousSegment.startProjectSecond) {
        throw new TempoMapError(
          'numeric-result-out-of-range',
          `Tempo Segment at Tick ${tempoEvent.tick} cannot be represented with increasing Project time`,
        )
      }
    }

    const segment = Object.freeze<TempoSegmentPlan>({
      bpm: tempoEvent.bpm,
      secondsPerTick: 60 / (tempoEvent.bpm * PROJECT_PPQ),
      startProjectSecond,
      startTick: tempoEvent.tick,
    })
    segments.push(segment)
    previousSegment = segment
  }

  return Object.freeze(segments)
}

function normalizeTempoSegments(input: readonly TempoSegmentPlan[]): readonly TempoSegmentPlan[] {
  // Preserve the static element type because Array.isArray narrows readonly arrays to any[].
  const tempoSegmentRecords: readonly TempoSegmentPlan[] = input

  if (!Array.isArray(input)) {
    throw new TempoMapError('invalid-tempo-segment-list', 'TempoMap requires a Tempo Segment array')
  }
  if (tempoSegmentRecords.length === 0) {
    throw new TempoMapError(
      'invalid-tempo-segment-list',
      'TempoMap requires at least one Tempo Segment',
    )
  }

  const segments = tempoSegmentRecords.map((segment, segmentIndex) => {
    try {
      const bpm = parseTempoBpm(segment.bpm)
      const startTick = parseTick(segment.startTick)
      const startProjectSecond = parseProjectSecond(segment.startProjectSecond)
      const expectedSecondsPerTick = 60 / (bpm * PROJECT_PPQ)

      if (segment.secondsPerTick !== expectedSecondsPerTick) {
        throw new TempoMapError(
          'inconsistent-tempo-segment',
          `Tempo Segment at input index ${segmentIndex} has inconsistent secondsPerTick`,
        )
      }

      return Object.freeze<TempoSegmentPlan>({
        bpm,
        secondsPerTick: expectedSecondsPerTick,
        startProjectSecond,
        startTick,
      })
    } catch (cause) {
      if (cause instanceof TempoMapError) throw cause
      throw new TempoMapError(
        'invalid-tempo-segment',
        `Tempo Segment at input index ${segmentIndex} is invalid: ${describeCause(cause)}`,
      )
    }
  })

  const initialSegment = segments[0]
  if (
    initialSegment === undefined ||
    initialSegment.startTick !== 0 ||
    initialSegment.startProjectSecond !== 0
  ) {
    throw new TempoMapError(
      'inconsistent-tempo-segment',
      'TempoMap requires its first Tempo Segment to start at Tick 0 and ProjectSecond 0',
    )
  }

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]
    const current = segments[index]
    if (previous === undefined || current === undefined) continue
    if (current.startTick <= previous.startTick) {
      throw new TempoMapError(
        'inconsistent-tempo-segment',
        'TempoMap Tempo Segment startTicks must be strictly increasing',
      )
    }

    const elapsedTick = current.startTick - previous.startTick
    const expectedStartProjectSecond = parseCalculatedProjectSecond(
      previous.startProjectSecond + elapsedTick * previous.secondsPerTick,
      `Tempo Segment at Tick ${current.startTick}`,
    )
    if (current.startProjectSecond !== expectedStartProjectSecond) {
      throw new TempoMapError(
        'inconsistent-tempo-segment',
        `Tempo Segment at Tick ${current.startTick} has an inconsistent Project time boundary`,
      )
    }
  }

  return Object.freeze(segments)
}

function findSegmentAtOrBefore(
  segments: readonly TempoSegmentPlan[],
  target: number,
  positionOf: (segment: TempoSegmentPlan) => number,
): LocatedTempoSegment {
  const firstSegment = segments[0]
  if (firstSegment === undefined) {
    throw new TempoMapError(
      'invalid-initial-tempo-event-count',
      'TempoMap has no initial Tempo Segment',
    )
  }

  let selectedSegment = firstSegment
  let selectedIndex = 0
  let lowerIndex = 1
  let upperIndex = segments.length - 1

  while (lowerIndex <= upperIndex) {
    const candidateIndex = Math.floor((lowerIndex + upperIndex) / 2)
    const candidate = segments[candidateIndex]
    if (candidate === undefined) break

    if (positionOf(candidate) <= target) {
      selectedSegment = candidate
      selectedIndex = candidateIndex
      lowerIndex = candidateIndex + 1
    } else {
      upperIndex = candidateIndex - 1
    }
  }

  return { index: selectedIndex, segment: selectedSegment }
}

function createTempoMapFromNormalizedSegments(segments: readonly TempoSegmentPlan[]): TempoMap {
  function projectSecondAtTickPosition(tickPosition: ContinuousTickPosition): ProjectSecond {
    const parsedPosition = parseContinuousTickPosition(tickPosition)
    const { segment } = findSegmentAtOrBefore(
      segments,
      parsedPosition,
      ({ startTick }) => startTick,
    )
    const elapsedTick = parsedPosition - segment.startTick
    const calculatedSecond = segment.startProjectSecond + elapsedTick * segment.secondsPerTick
    const projectSecond = parseCalculatedProjectSecond(
      calculatedSecond,
      `Tick position ${parsedPosition}`,
    )

    if (elapsedTick > 0 && projectSecond <= segment.startProjectSecond) {
      throw new TempoMapError(
        'numeric-result-out-of-range',
        `Tick position ${parsedPosition} cannot be represented after its Tempo Segment boundary`,
      )
    }

    return projectSecond
  }

  function projectSecondAtTick(tick: Tick): ProjectSecond {
    return projectSecondAtTickPosition(parseContinuousTickPosition(parseTick(tick)))
  }

  function tickPositionAtProjectSecond(projectSecond: ProjectSecond): ContinuousTickPosition {
    const parsedProjectSecond = parseProjectSecond(projectSecond)
    const { segment } = findSegmentAtOrBefore(
      segments,
      parsedProjectSecond,
      ({ startProjectSecond }) => startProjectSecond,
    )
    const elapsedSecond = parsedProjectSecond - segment.startProjectSecond
    const calculatedPosition = segment.startTick + elapsedSecond / segment.secondsPerTick
    const tickPosition = parseCalculatedTickPosition(
      calculatedPosition,
      `ProjectSecond ${parsedProjectSecond}`,
    )

    if (elapsedSecond > 0 && tickPosition <= segment.startTick) {
      throw new TempoMapError(
        'numeric-result-out-of-range',
        `ProjectSecond ${parsedProjectSecond} cannot be represented after its Tempo Segment boundary`,
      )
    }

    return tickPosition
  }

  function durationBetweenTicks(startTick: Tick, endTick: Tick): ProjectDurationSecond {
    const parsedStartTick = parseTick(startTick)
    const parsedEndTick = parseTick(endTick)
    if (parsedEndTick < parsedStartTick) {
      throw new TempoMapError(
        'reversed-tick-range',
        `TempoMap Tick range ${parsedStartTick}...${parsedEndTick} is reversed`,
      )
    }

    const located = findSegmentAtOrBefore(segments, parsedStartTick, ({ startTick }) => startTick)
    let currentTick = parsedStartTick
    let currentSegment = located.segment
    let nextSegmentIndex = located.index + 1
    let duration = 0

    // Integrating relative segment durations avoids cancellation between large absolute seconds.
    while (currentTick < parsedEndTick) {
      const nextSegment = segments[nextSegmentIndex]
      const segmentEndTick =
        nextSegment === undefined || nextSegment.startTick > parsedEndTick
          ? parsedEndTick
          : nextSegment.startTick
      const elapsedTick = segmentEndTick - currentTick
      const calculatedDuration = duration + elapsedTick * currentSegment.secondsPerTick
      const parsedDuration = parseCalculatedDuration(
        calculatedDuration,
        `Tick range ${parsedStartTick}...${segmentEndTick}`,
      )

      if (elapsedTick > 0 && parsedDuration <= duration) {
        throw new TempoMapError(
          'numeric-result-out-of-range',
          `Tick range ${parsedStartTick}...${segmentEndTick} cannot be represented with increasing duration`,
        )
      }

      duration = parsedDuration
      currentTick = segmentEndTick
      if (nextSegment !== undefined && currentTick < parsedEndTick) {
        currentSegment = nextSegment
        nextSegmentIndex += 1
      }
    }

    return parseCalculatedDuration(duration, `Tick range ${parsedStartTick}...${parsedEndTick}`)
  }

  return Object.freeze({
    durationBetweenTicks,
    projectSecondAtTick,
    projectSecondAtTickPosition,
    segments,
    tickPositionAtProjectSecond,
  })
}

/** Creates an immutable multi-segment TempoMap without retaining the caller's event array. */
export function createTempoMap(input: readonly TempoEventRecord[]): TempoMap {
  return createTempoMapFromNormalizedSegments(createTempoSegments(normalizeTempoEvents(input)))
}

/** Rehydrates a TempoMap from a compiled, serializable Segment plan. */
export function createTempoMapFromSegments(input: readonly TempoSegmentPlan[]): TempoMap {
  return createTempoMapFromNormalizedSegments(normalizeTempoSegments(input))
}
