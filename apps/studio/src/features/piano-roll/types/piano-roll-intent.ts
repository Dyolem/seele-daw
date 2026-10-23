import type {
  PianoRollEditorSession,
  PianoRollInteractionIntent,
  PianoRollInteractionSession,
  PianoRollSustainPedalInteractionIntent,
  PianoRollSustainPedalInteractionSession,
} from '@seele-daw/editor'
import type {
  ModelRevision,
  ProjectSession,
  MidiSustainPedalEventId,
} from '@seele-daw/project-core'
import type { NoteEdits } from '@/workbench/edits/note-edits'
import type { SustainPedalEdits } from '@/workbench/edits/sustain-pedal-edits'

export interface ProjectPianoRollIntentHandlerDependencies {
  readonly getAuthorityRevision: () => ModelRevision | null
  readonly getSession: () => Pick<ProjectSession, 'query'>
  readonly getEditorSession: () => PianoRollEditorSession | null
  readonly interactionSession: Pick<
    PianoRollInteractionSession,
    'claimCompletion' | 'resolveCommit' | 'finish'
  >
  readonly notes: NoteEdits
  readonly reportDanger: (title: string, description: string) => void
  readonly reportWarning: (title: string, description: string) => void
  readonly setFailureMessage: (message: string | null) => void
}

export type ProjectPianoRollIntentHandler = (intent: PianoRollInteractionIntent) => void

export interface ProjectPianoRollSustainPedalIntentHandlerDependencies {
  readonly getAuthorityRevision: () => ModelRevision
  readonly interactionSession: Pick<
    PianoRollSustainPedalInteractionSession,
    'claimCompletion' | 'resolveCommit' | 'finish'
  >
  readonly sustainPedal: SustainPedalEdits
  readonly reportFailure: (cause: unknown, committed?: boolean) => void
  readonly reportSuccess: () => void
  readonly setSelectedEventIds: (eventIds: readonly MidiSustainPedalEventId[]) => void
}

export type ProjectPianoRollSustainPedalIntentHandler = (
  intent: PianoRollSustainPedalInteractionIntent,
) => void
