import { type PlaybackTimerPort } from '@seele-daw/playback'

/** Adapts browser interval handles without letting the playback coordinator depend on Window. */
export function createBrowserProjectPlaybackTimer(): PlaybackTimerPort {
  return Object.freeze({
    clear: (handle: unknown) => window.clearInterval(handle as number),
    setRepeating: (callback: () => void, intervalMillisecond: number) =>
      window.setInterval(callback, intervalMillisecond),
  })
}
