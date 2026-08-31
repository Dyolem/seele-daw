import type { MidiSustainPedalEventId } from '@seele-daw/project-core'

/** Renderer-neutral semantic target for one CC64 event marker. */
export interface PianoRollSustainPedalLaneHit {
  readonly sustainPedalEventId: MidiSustainPedalEventId
}
