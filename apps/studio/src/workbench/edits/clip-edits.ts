import {
  ZERO_TICK,
  createAddMidiClipCommand,
  parseClipId,
  parseMidiSourceId,
  type ClipId,
  type ProjectCommit,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import { resolveInitialBarRange } from '@/workbench/edits/bar-range'
import {
  executeRequiredEdit,
  requireEditSession,
  staleEdit,
  type ProjectEditContext,
} from '@/workbench/edits/edit-session'

export interface AddEmptyClipInput {
  readonly trackId: TrackId
  /** Any Tick inside the bar that the new one-bar Clip should occupy. */
  readonly targetTick: Tick
}

export interface AddedClip {
  readonly clipId: ClipId
  readonly commit: ProjectCommit
  readonly trackId: TrackId
}

export function createClipEdits(context: Omit<ProjectEditContext, 'random'>) {
  return {
    addEmpty(input: AddEmptyClipInput): AddedClip {
      const session = requireEditSession(context)
      const snapshot = session.getSnapshot()
      const track = snapshot.tracks.find(({ id }) => id === input.trackId)
      if (track === undefined) throw staleEdit()

      const bar = resolveInitialBarRange(snapshot, input.targetTick)
      const clipId = parseClipId(context.createId())
      const commit = executeRequiredEdit(
        session,
        createAddMidiClipCommand({
          baseRevision: session.modelRevision,
          clipId,
          trackId: track.id,
          name: track.name,
          color: null,
          muted: false,
          startTick: bar.startTick,
          spanTick: bar.spanTick,
          sourceId: parseMidiSourceId(context.createId()),
          sourceLengthTick: bar.spanTick,
          sourceOffsetTick: ZERO_TICK,
        }),
      )
      return { clipId, commit, trackId: track.id }
    },
  }
}

export type ClipEdits = ReturnType<typeof createClipEdits>
