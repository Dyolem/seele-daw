import type { ProjectPlaybackTimerPort } from '@/workbench/project/playback/project-playback-coordinator'

/** Adapts browser interval handles without letting the playback coordinator depend on Window. */
export function createBrowserProjectPlaybackTimer(): ProjectPlaybackTimerPort {
  return Object.freeze({
    clear: (handle: unknown) => window.clearInterval(handle as number),
    setRepeating: (callback: () => void, intervalMillisecond: number) =>
      window.setInterval(callback, intervalMillisecond),
  })
}
