export type ProjectCommandErrorCode =
  | 'base-revision-mismatch'
  | 'clip-not-found'
  | 'clip-id-already-exists'
  | 'device-id-already-exists'
  | 'device-not-found'
  | 'duplicate-note-id'
  | 'duplicate-sustain-pedal-event-id'
  | 'empty-instrument-track-collection'
  | 'empty-note-id-list'
  | 'empty-sustain-pedal-event-id-list'
  | 'invalid-base-revision'
  | 'invalid-track-order-index'
  | 'instrument-device-id-mismatch'
  | 'midi-note-not-found'
  | 'midi-clip-out-of-source-range'
  | 'midi-clip-source-id-mismatch'
  | 'midi-clip-extension-crosses-next-clip'
  | 'midi-clip-extension-not-required'
  | 'midi-clip-extension-not-rightward'
  | 'midi-clip-extension-out-of-range'
  | 'midi-clip-track-id-mismatch'
  | 'midi-source-id-already-exists'
  | 'midi-source-not-found'
  | 'note-id-already-exists'
  | 'note-out-of-clip-range'
  | 'note-out-of-source-range'
  | 'note-pitch-out-of-range'
  | 'sustain-pedal-event-id-already-exists'
  | 'sustain-pedal-event-not-found'
  | 'sustain-pedal-event-out-of-source-range'
  | 'sustain-pedal-event-tick-channel-already-exists'
  | 'initial-tempo-event-cannot-move'
  | 'initial-tempo-event-cannot-remove'
  | 'tempo-event-id-already-exists'
  | 'tempo-event-not-found'
  | 'tempo-event-tick-already-exists'
  | 'track-id-already-exists'
  | 'track-not-found'
  | 'track-order-index-out-of-bounds'

/** Raised when a command breaks a business rule of the model; `code` names the rule. */
export class ProjectCommandError extends Error {
  readonly code: ProjectCommandErrorCode

  constructor(code: ProjectCommandErrorCode, message: string) {
    super(message)
    this.name = 'ProjectCommandError'
    this.code = code
  }
}
