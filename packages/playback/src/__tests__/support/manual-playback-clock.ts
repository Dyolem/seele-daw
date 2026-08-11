import { parsePlaybackClockSecond, type PlaybackClockSecond } from '#internal/time/project-time'
import type { PlaybackClock } from '#internal/transport/audible-midi-transport'

export class ManualPlaybackClock implements PlaybackClock {
  #current: PlaybackClockSecond

  constructor(initialSecond = 0) {
    this.#current = parsePlaybackClockSecond(initialSecond)
  }

  now(): PlaybackClockSecond {
    return this.#current
  }

  advanceBy(durationSecond: number): void {
    this.#current = parsePlaybackClockSecond(this.#current + durationSecond)
  }

  setTo(playbackClockSecond: number): void {
    this.#current = parsePlaybackClockSecond(playbackClockSecond)
  }
}
