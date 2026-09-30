import type {
  PianoRollEditorSession,
  PianoRollEditorSessionState,
  PianoRollInteractionState,
  PianoRollNoteReadModelState,
} from '@seele-daw/editor'
import type { ProjectSession, Tick } from '@seele-daw/project-core'
import type { ShallowRef } from 'vue'
import type { StudioActionCompletion } from '@/workbench/actions/studio-action'
import type { ReadyProjectPianoRollPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import type { PianoRollSustainPedalLaneHandle } from '@/features/piano-roll/types/piano-roll-sustain-pedal'

export interface ProjectPianoRollSurfaceProps {
  readonly barSpanTick: Tick
  readonly presentation: ReadyProjectPianoRollPresentation
  readonly session: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly timeSignatureNumerator: number
}

export type FocusedPianoRollEditingTarget = 'notes' | 'sustain-pedal'

export interface PianoRollSurfaceElements {
  readonly canvasHost: Readonly<ShallowRef<HTMLElement | null>>
  readonly surfaceElement: Readonly<ShallowRef<HTMLElement | null>>
  readonly gridCanvas: Readonly<ShallowRef<HTMLCanvasElement | null>>
  readonly noteHost: Readonly<ShallowRef<HTMLElement | null>>
  readonly sustainPedalLane: Readonly<ShallowRef<PianoRollSustainPedalLaneHandle | null>>
}

/** Owns disposable Clip projections and selection, never Project facts. */
export interface PianoRollClipNoteModel {
  readonly editorSession: PianoRollEditorSession | null
  readonly editorState: Readonly<ShallowRef<PianoRollEditorSessionState | null>>
  readonly noteState: Readonly<ShallowRef<PianoRollNoteReadModelState | null>>
  readonly failureMessage: Readonly<ShallowRef<string | null>>
  observeViewport(checkPointerMapping: () => boolean): void
  recompose(): void
  dispose(): void
}

export interface PianoRollNoteInteraction {
  readonly state: Readonly<ShallowRef<PianoRollInteractionState>>
  cancel(): void
  cancelAction(): StudioActionCompletion
  hasStablePointerMapping(): boolean
  mount(): void
  disposeInput(): void
  dispose(): void
}
