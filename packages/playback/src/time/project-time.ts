import type { Brand } from '@seele-daw/type-utils'

export type ProjectSecond = Brand<number, 'ProjectSecond'>
export type ProjectDurationSecond = Brand<number, 'ProjectDurationSecond'>
export type ContinuousTickPosition = Brand<number, 'ContinuousTickPosition'>
export type PlaybackClockSecond = Brand<number, 'PlaybackClockSecond'>
export type PlaybackClockDurationSecond = Brand<number, 'PlaybackClockDurationSecond'>

export type ProjectTimeErrorCode =
  | 'invalid-continuous-tick-position'
  | 'invalid-playback-clock-duration-second'
  | 'invalid-playback-clock-second'
  | 'invalid-project-duration-second'
  | 'invalid-project-second'

/** Stable failure raised when a number cannot enter a Playback time domain. */
export class ProjectTimeError extends RangeError {
  readonly code: ProjectTimeErrorCode
  readonly valueName: string

  constructor(code: ProjectTimeErrorCode, valueName: string) {
    super(
      `Invalid ${valueName}: expected a finite non-negative number no greater than Number.MAX_SAFE_INTEGER`,
    )
    this.name = 'ProjectTimeError'
    this.code = code
    this.valueName = valueName
  }
}

function requireNonNegativeSafeNumber(
  value: unknown,
  code: ProjectTimeErrorCode,
  valueName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new ProjectTimeError(code, valueName)
  }

  return value === 0 ? 0 : value
}

export function parseProjectSecond(value: unknown): ProjectSecond {
  return requireNonNegativeSafeNumber(
    value,
    'invalid-project-second',
    'ProjectSecond',
  ) as ProjectSecond
}

export function parseProjectDurationSecond(value: unknown): ProjectDurationSecond {
  return requireNonNegativeSafeNumber(
    value,
    'invalid-project-duration-second',
    'ProjectDurationSecond',
  ) as ProjectDurationSecond
}

/** Parses a monotonic runtime clock value without treating it as Project time. */
export function parsePlaybackClockSecond(value: unknown): PlaybackClockSecond {
  return requireNonNegativeSafeNumber(
    value,
    'invalid-playback-clock-second',
    'PlaybackClockSecond',
  ) as PlaybackClockSecond
}

/** Parses a runtime scheduling duration without treating it as Project time. */
export function parsePlaybackClockDurationSecond(value: unknown): PlaybackClockDurationSecond {
  return requireNonNegativeSafeNumber(
    value,
    'invalid-playback-clock-duration-second',
    'PlaybackClockDurationSecond',
  ) as PlaybackClockDurationSecond
}

/** Parses a non-integer musical position without promoting it to a Project Tick fact. */
export function parseContinuousTickPosition(value: unknown): ContinuousTickPosition {
  return requireNonNegativeSafeNumber(
    value,
    'invalid-continuous-tick-position',
    'ContinuousTickPosition',
  ) as ContinuousTickPosition
}
