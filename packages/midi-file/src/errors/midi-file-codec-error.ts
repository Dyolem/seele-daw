export type MidiFileCodecOperation = 'decode' | 'encode'

export type MidiFileCodecErrorCode =
  | 'invalid-midi-file'
  | 'unsupported-midi-format'
  | 'unsupported-time-division'
  | 'decode-failed'
  | 'invalid-midi-document'
  | 'encode-failed'

export interface MidiFileCodecErrorDetails {
  readonly operation: MidiFileCodecOperation
  readonly format?: number
  readonly division?: number
}

export class MidiFileCodecError extends Error {
  readonly code: MidiFileCodecErrorCode
  readonly details: MidiFileCodecErrorDetails

  constructor(
    code: MidiFileCodecErrorCode,
    message: string,
    details: MidiFileCodecErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'MidiFileCodecError'
    this.code = code
    this.details = details
  }
}
