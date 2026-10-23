import { createClipEdits } from '@/workbench/edits/clip-edits'
import type { ProjectEditContext } from '@/workbench/edits/edit-session'
import { createNoteEdits } from '@/workbench/edits/note-edits'
import { createSustainPedalEdits } from '@/workbench/edits/sustain-pedal-edits'
import { createTempoEdits } from '@/workbench/edits/tempo-edits'
import { createTrackEdits } from '@/workbench/edits/track-edits'

/** Every Studio write to the Active Project goes through one of these stateless use cases. */
export function createProjectEdits(context: ProjectEditContext) {
  return {
    clips: createClipEdits(context),
    notes: createNoteEdits(context),
    sustainPedal: createSustainPedalEdits(context),
    tempo: createTempoEdits(context),
    tracks: createTrackEdits(context),
  }
}

export type ProjectEdits = ReturnType<typeof createProjectEdits>
