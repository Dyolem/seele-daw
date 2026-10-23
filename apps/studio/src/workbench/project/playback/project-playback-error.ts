export type ProjectPlaybackErrorCode = 'coordinator-disposed'

/** Use of the Studio playback coordinator after it was disposed. */
export class ProjectPlaybackError extends Error {
  readonly code: ProjectPlaybackErrorCode

  constructor(code: ProjectPlaybackErrorCode, message: string) {
    super(message)
    this.name = 'ProjectPlaybackError'
    this.code = code
  }
}
