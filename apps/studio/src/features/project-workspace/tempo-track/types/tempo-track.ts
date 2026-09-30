export interface ProjectTempoTrackScale {
  readonly maximumBpm: number
  readonly minimumBpm: number
}

export interface ProjectTempoEventLocationPresentation {
  readonly barNumber: number
  readonly beatNumber: number
  readonly maximumOffsetWithinBeat: number
  readonly offsetWithinBeat: number
  readonly projectTime: string
  readonly title: string
}

export interface ProjectTempoEventPositionDraft {
  readonly bar: string
  readonly beat: string
  readonly offset: string
}

export type ProjectTempoEventNavigationDirection = 'next' | 'previous'

export type ProjectTempoTrackDragAxis = 'blocked-tick' | 'bpm' | 'tick'
