export type ProjectPlaybackErrorCode =
  | 'active-project-not-ready'
  | 'coordinator-disposed'
  | 'missing-context'
  | 'playback-unavailable'

/** Stable caller misuse at the Studio Project Playback boundary. */
export class ProjectPlaybackError extends Error {
  readonly code: ProjectPlaybackErrorCode

  constructor(code: ProjectPlaybackErrorCode, message: string) {
    super(message)
    this.name = 'ProjectPlaybackError'
    this.code = code
  }
}
