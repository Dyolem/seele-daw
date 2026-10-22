import type { PianoRollTrackClipProjection, PianoRollVisibleNote } from '@seele-daw/editor'
import type { CSSProperties } from 'vue'

export interface TrackClipRegion {
  readonly clip: PianoRollTrackClipProjection
  readonly headerRow: number
  readonly style: CSSProperties
}

export interface TrackVisibleClipNotes {
  readonly clip: PianoRollTrackClipProjection
  readonly notes: readonly PianoRollVisibleNote[]
}
