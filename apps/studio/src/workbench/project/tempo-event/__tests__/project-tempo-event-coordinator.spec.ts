import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  createInitialProjectSession,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
} from '@/workbench/project/active-project-state'
import {
  createProjectTempoEventCoordinator,
  type ProjectTempoEventCoordinatorDependencies,
} from '@/workbench/project/tempo-event/project-tempo-event-coordinator'
import { ProjectTempoEventError } from '@/workbench/project/tempo-event/project-tempo-event-error'

function createSession(suffix: string): ProjectSession {
  return createInitialProjectSession({
    projectId: parseProjectId(`project-tempo-event-${suffix}`),
    projectName: `Tempo Event ${suffix}`,
    tempoEventId: parseTempoEventId(`tempo-event-initial-${suffix}`),
    timeSignatureEventId: parseTimeSignatureEventId(`meter-tempo-event-${suffix}`),
  })
}

function createDependencies(
  session: ProjectSession,
  createUniqueId: () => string = () => 'tempo-event-created',
): ProjectTempoEventCoordinatorDependencies {
  const snapshot = session.getSnapshot()
  const activeProject: Pick<ActiveProjectService, 'state'> = {
    state: Object.freeze({
      phase: ACTIVE_PROJECT_PHASE.READY,
      projectId: snapshot.project.id,
      session,
      modelRevision: session.modelRevision,
      contentStateId: session.contentStateId,
      savedRevision: session.modelRevision,
      savedContentStateId: session.contentStateId,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      saveFailure: null,
      recoveryFailures: Object.freeze([]),
    }),
  }
  return { activeProject, createUniqueId }
}

describe('ProjectTempoEventCoordinator', () => {
  it('owns identity creation and coordinates the complete Tempo Event lifecycle', () => {
    const session = createSession('lifecycle')
    const coordinator = createProjectTempoEventCoordinator(createDependencies(session))

    const added = coordinator.addTempoEvent({
      bpm: parseTempoBpm(96.25),
      tick: parseTick(960),
    })
    expect(Object.isFrozen(coordinator)).toBe(true)
    expect(Object.isFrozen(added)).toBe(true)
    expect(added.tempoEventId).toBe('tempo-event-created')
    expect(added.commit.delta.changes).toMatchObject([
      { type: PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED },
    ])

    const moved = coordinator.moveTempoEvent({
      tempoEventId: added.tempoEventId,
      tick: parseTick(1_920),
    })
    expect(moved.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)

    const replaced = coordinator.replaceTempoEventBpm({
      bpm: parseTempoBpm(101.5),
      tempoEventId: added.tempoEventId,
    })
    expect(replaced.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(session.getSnapshot().tempoEvents).toContainEqual({
      bpm: 101.5,
      id: 'tempo-event-created',
      tick: 1_920,
    })

    const removed = coordinator.removeTempoEvent(added.tempoEventId)
    expect(removed.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(session.getSnapshot().tempoEvents).toHaveLength(1)
  })

  it('preserves Project Core no-change results for same-value point edits', () => {
    const session = createSession('no-change')
    const coordinator = createProjectTempoEventCoordinator(createDependencies(session))
    const initial = session.getSnapshot().tempoEvents[0]!

    expect(
      coordinator.replaceTempoEventBpm({ bpm: initial.bpm, tempoEventId: initial.id }),
    ).toMatchObject({ status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE })
  })

  it('does not consume an identity while the Active Project is unavailable', () => {
    const createUniqueId = vi.fn<() => string>(() => 'unused-tempo-event-id')
    const coordinator = createProjectTempoEventCoordinator({
      activeProject: { state: Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }) },
      createUniqueId,
    })

    expect(() =>
      coordinator.addTempoEvent({ bpm: parseTempoBpm(120), tick: parseTick(960) }),
    ).toThrowError(ProjectTempoEventError)
    expect(createUniqueId).not.toHaveBeenCalled()
  })
})
