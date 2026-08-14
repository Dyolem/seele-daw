import type {
  ProjectPlaybackVisualFrameHandle,
  ProjectPlaybackVisualFramePort,
} from '@/workbench/project/playback/project-playback-visual-position'

/** Adapts browser animation frames without exposing Window to the playback Vue binding. */
export function createBrowserProjectPlaybackVisualFrame(): ProjectPlaybackVisualFramePort {
  return Object.freeze({
    cancel: (handle: ProjectPlaybackVisualFrameHandle) =>
      window.cancelAnimationFrame(handle as number),
    request: (callback: () => void) => window.requestAnimationFrame(callback),
  })
}
