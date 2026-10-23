import {
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  type ProjectSession,
} from '@seele-daw/project-core'

import type { ProjectEditContext } from '@/workbench/edits/edit-session'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'

export function createEditTestSession(name: string): ProjectSession {
  return createInitialProjectSession({
    projectId: parseProjectId(`project-${name}`),
    projectName: `Edits ${name}`,
    tempoEventId: parseTempoEventId(`tempo-${name}`),
    timeSignatureEventId: parseTimeSignatureEventId(`meter-${name}`),
  })
}

export function readyStateOf(session: ProjectSession): ReadyActiveProjectState {
  return Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: session.getSnapshot().project.id,
    session,
    modelRevision: session.modelRevision,
    contentStateId: session.contentStateId,
    savedRevision: session.modelRevision,
    savedContentStateId: session.contentStateId,
    isDirty: false,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    saveFailure: null,
    recoveryFailures: Object.freeze([]),
  })
}

/** Hands out exactly the declared identities, so a test notices any unexpected consumption. */
export function identitySource(...identities: string[]): () => string {
  const remaining = [...identities]
  return () => {
    const identity = remaining.shift()
    if (identity === undefined) throw new Error('Test identity source exhausted')
    return identity
  }
}

/** An edit context over a ready Session; `random` is fixed so Track colors are deterministic. */
export function editContextFor(
  session: ProjectSession,
  ...identities: string[]
): ProjectEditContext {
  return {
    activeProject: { state: readyStateOf(session) },
    createId: identitySource(...identities),
    random: () => 0,
  }
}

export const IDLE_PROJECT: { readonly state: ActiveProjectState } = Object.freeze({
  state: Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
})
