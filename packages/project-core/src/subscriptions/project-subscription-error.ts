export type ProjectSubscriptionErrorCode =
  | 'empty-note-ids'
  | 'empty-source-ids'
  | 'invalid-note-ids'
  | 'invalid-observer'
  | 'invalid-source-ids'
  | 'invalid-tick-range'
  | 'unknown-subscription-type'

export interface ProjectSubscriptionErrorDetails {
  readonly endTick?: number
  readonly startTick?: number
  readonly subscriptionType?: string
}

/** Raised when a ProjectSubscription cannot be normalized or observed safely. */
export class ProjectSubscriptionError extends Error {
  readonly code: ProjectSubscriptionErrorCode
  readonly endTick: number | null
  readonly startTick: number | null
  readonly subscriptionType: string | null

  constructor(
    code: ProjectSubscriptionErrorCode,
    message: string,
    details: ProjectSubscriptionErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectSubscriptionError'
    this.code = code
    this.endTick = details.endTick ?? null
    this.startTick = details.startTick ?? null
    this.subscriptionType = details.subscriptionType ?? null
  }
}
