export type BrowserLocalFileReadErrorCode =
  | 'byte-length-mismatch'
  | 'invalid-file'
  | 'invalid-read-result'
  | 'read-failed'

export interface BrowserLocalFileReadErrorDetails {
  readonly actualByteLength?: number
  readonly cause?: unknown
  readonly expectedByteLength?: number
  readonly fileName?: string
}

/** Stable browser-infrastructure failure raised while copying one local File or Blob. */
export class BrowserLocalFileReadError extends Error {
  readonly code: BrowserLocalFileReadErrorCode
  readonly actualByteLength: number | null
  readonly expectedByteLength: number | null
  readonly fileName: string | null
  readonly failureCause: unknown

  constructor(
    code: BrowserLocalFileReadErrorCode,
    message: string,
    details: BrowserLocalFileReadErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'BrowserLocalFileReadError'
    this.code = code
    this.actualByteLength = details.actualByteLength ?? null
    this.expectedByteLength = details.expectedByteLength ?? null
    this.fileName = details.fileName ?? null
    this.failureCause = details.cause
  }
}
