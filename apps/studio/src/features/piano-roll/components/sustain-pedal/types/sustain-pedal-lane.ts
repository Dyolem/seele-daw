import type {
  PianoRollClipContext,
  PianoRollGrid,
  PianoRollSustainPedalClipLaneReadModel,
  PianoRollTrackSustainPedalLaneReadModel,
} from '@seele-daw/editor'
import type { Tick, ProjectSession } from '@seele-daw/project-core'

export type SustainPedalLaneReadModel =
  | PianoRollSustainPedalClipLaneReadModel
  | PianoRollTrackSustainPedalLaneReadModel

export interface PianoRollSustainPedalLaneProps {
  readonly session: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly clipContext: PianoRollClipContext | null
  readonly grid: PianoRollGrid
  readonly label: string
  readonly pencilEnabled: boolean
  readonly readModel: SustainPedalLaneReadModel
  readonly snapEnabled: boolean
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
}
