import type { Brand } from '@seele-daw/type-utils'

export type ProjectSecond = Brand<number, 'ProjectSecond'>
export type ContinuousTickPosition = Brand<number, 'ContinuousTickPosition'>
export type PlaybackClockSecond = Brand<number, 'PlaybackClockSecond'>
export type PlaybackClockDurationSecond = Brand<number, 'PlaybackClockDurationSecond'>

/** Clock values enter Playback only when finite, non-negative and safe. */
function requireNonNegativeSafeNumber(value: unknown, valueName: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(
      `Invalid ${valueName}: expected a finite non-negative number no greater than Number.MAX_SAFE_INTEGER`,
    )
  }

  return value === 0 ? 0 : value
}

/** Parses a monotonic runtime clock value without treating it as Project time. */
export function parsePlaybackClockSecond(value: unknown): PlaybackClockSecond {
  return requireNonNegativeSafeNumber(value, 'PlaybackClockSecond') as PlaybackClockSecond
}

/** Parses a runtime scheduling duration without treating it as Project time. */
export function parsePlaybackClockDurationSecond(value: unknown): PlaybackClockDurationSecond {
  return requireNonNegativeSafeNumber(
    value,
    'PlaybackClockDurationSecond',
  ) as PlaybackClockDurationSecond
}
