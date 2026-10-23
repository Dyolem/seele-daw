import {
  createAddTempoEventCommand,
  createMoveTempoEventCommand,
  createRemoveTempoEventCommand,
  createReplaceTempoEventBpmCommand,
  parseTempoEventId,
  type ModelRevision,
  type ProjectCommit,
  type ProjectSession,
  type TempoBpm,
  type TempoEventId,
  type Tick,
} from '@seele-daw/project-core'

import {
  executeEdit,
  executeRequiredEdit,
  requireEditSession,
  type ProjectEditContext,
} from '@/workbench/edits/edit-session'

/** What a Tempo drag captured; discrete field edits target the current revision instead. */
export interface TempoEditTarget {
  readonly baseRevision: ModelRevision
  readonly expectedSession: ProjectSession
}

export function createTempoEdits(context: Omit<ProjectEditContext, 'random'>) {
  return {
    add(input: { readonly bpm: TempoBpm; readonly tick: Tick }) {
      const session = requireEditSession(context)
      const tempoEventId = parseTempoEventId(context.createId())
      const commit = executeRequiredEdit(
        session,
        createAddTempoEventCommand({
          baseRevision: session.modelRevision,
          bpm: input.bpm,
          tempoEventId,
          tick: input.tick,
        }),
      )
      return { commit, tempoEventId }
    },

    move(input: {
      readonly target?: TempoEditTarget
      readonly tempoEventId: TempoEventId
      readonly tick: Tick
    }): ProjectCommit | null {
      const session = requireEditSession(context, input.target)
      return executeEdit(
        session,
        createMoveTempoEventCommand({
          baseRevision: session.modelRevision,
          tempoEventId: input.tempoEventId,
          tick: input.tick,
        }),
      )
    },

    remove(tempoEventId: TempoEventId): ProjectCommit | null {
      const session = requireEditSession(context)
      return executeEdit(
        session,
        createRemoveTempoEventCommand({ baseRevision: session.modelRevision, tempoEventId }),
      )
    },

    replaceBpm(input: {
      readonly target?: TempoEditTarget
      readonly bpm: TempoBpm
      readonly tempoEventId: TempoEventId
    }): ProjectCommit | null {
      const session = requireEditSession(context, input.target)
      return executeEdit(
        session,
        createReplaceTempoEventBpmCommand({
          baseRevision: session.modelRevision,
          bpm: input.bpm,
          tempoEventId: input.tempoEventId,
        }),
      )
    },
  }
}

export type TempoEdits = ReturnType<typeof createTempoEdits>
