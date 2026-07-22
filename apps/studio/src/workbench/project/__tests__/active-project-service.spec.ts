import { ProjectCheckpointOperationError, type ProjectId } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import { ActiveProjectError } from '@/workbench/project/active-project-error'
import { createActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  ControlledProjectCheckpointStore,
  createCheckpointIdFactory,
  createDeferred,
  createTestCheckpoint,
  createTestProjectId,
  createTestSession,
  type MutableTestProjectSession,
} from '@/workbench/project/__tests__/active-project-test-support'

function requireReady(state: ActiveProjectState): ReadyActiveProjectState {
  if (state.phase !== ACTIVE_PROJECT_PHASE.READY) {
    throw new Error(`Expected ready Active Project state, received ${state.phase}`)
  }

  return state
}

function createServiceFixture(
  store = new ControlledProjectCheckpointStore(),
  createNewSession = vi.fn<(projectId: ProjectId) => MutableTestProjectSession>((projectId) =>
    createTestSession(projectId),
  ),
) {
  const service = createActiveProjectService({
    checkpointStore: store,
    createNewSession,
    createCheckpointId: createCheckpointIdFactory(),
  })

  return { createNewSession, service, store }
}

describe('ActiveProjectService opening', () => {
  it('creates an unsaved dirty Session when no Checkpoint exists', async () => {
    const projectId = createTestProjectId('new')
    const { createNewSession, service, store } = createServiceFixture()

    await service.open(projectId)

    const state = requireReady(service.state)
    expect(store.readProjectIds).toEqual([projectId])
    expect(createNewSession).toHaveBeenCalledExactlyOnceWith(projectId)
    expect(state).toMatchObject({
      projectId,
      modelRevision: 0,
      savedRevision: null,
      isDirty: true,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      saveFailure: null,
      recoveryFailures: [],
    })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.recoveryFailures)).toBe(true)
  })

  it('restores a valid Checkpoint as a clean fresh Session', async () => {
    const projectId = createTestProjectId('restored')
    const checkpoint = createTestCheckpoint(projectId, 'checkpoint-restored')
    const store = new ControlledProjectCheckpointStore()
    store.candidatesByProject.set(projectId, [checkpoint])
    const { createNewSession, service } = createServiceFixture(store)

    await service.open(projectId)

    const state = requireReady(service.state)
    expect(createNewSession).not.toHaveBeenCalled()
    expect(state.session).not.toBeNull()
    expect(state.modelRevision).toBe(0)
    expect(state.savedRevision).toBe(0)
    expect(state.isDirty).toBe(false)
    expect(state.recoveryFailures).toEqual([])
  })

  it('keeps ordered recovery diagnostics when a previous candidate succeeds', async () => {
    const projectId = createTestProjectId('fallback')
    const checkpoint = createTestCheckpoint(projectId, 'checkpoint-fallback')
    const store = new ControlledProjectCheckpointStore()
    store.candidatesByProject.set(projectId, [{}, checkpoint])
    const { service } = createServiceFixture(store)

    await service.open(projectId)

    const state = requireReady(service.state)
    expect(state.isDirty).toBe(false)
    expect(state.recoveryFailures).toEqual([
      { candidateIndex: 0, failureCause: expect.objectContaining({ code: 'missing-property' }) },
    ])
    expect(Object.isFrozen(state.recoveryFailures[0])).toBe(true)
  })

  it('fails explicitly when every candidate is invalid and never creates an empty project', async () => {
    const projectId = createTestProjectId('invalid')
    const store = new ControlledProjectCheckpointStore()
    store.candidatesByProject.set(projectId, [{}, { checkpointFormatVersion: 99 }])
    const { createNewSession, service } = createServiceFixture(store)

    await expect(service.open(projectId)).rejects.toBeInstanceOf(ProjectCheckpointOperationError)

    expect(createNewSession).not.toHaveBeenCalled()
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
      projectId,
      failureCause: expect.objectContaining({ code: 'no-valid-checkpoint' }),
    })
    if (
      service.state.phase !== ACTIVE_PROJECT_PHASE.OPEN_FAILED ||
      !(service.state.failureCause instanceof ProjectCheckpointOperationError)
    ) {
      throw new Error('Expected a Checkpoint operation failure')
    }
    expect(
      service.state.failureCause.candidateFailures.map(({ candidateIndex }) => candidateIndex),
    ).toEqual([0, 1])
  })

  it('preserves the storage failure when reading Checkpoints fails', async () => {
    const projectId = createTestProjectId('read-failure')
    const cause = new Error('IndexedDB unavailable')
    const store = new ControlledProjectCheckpointStore()
    store.readFailure = cause
    const { service } = createServiceFixture(store)

    await expect(service.open(projectId)).rejects.toMatchObject({
      code: 'store-read-failed',
      failureCause: cause,
    })

    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
      projectId,
      failureCause: expect.objectContaining({ failureCause: cause }),
    })
  })

  it('rejects a new-session factory that returns a different Project', async () => {
    const requestedProjectId = createTestProjectId('factory-requested')
    const actualProjectId = createTestProjectId('factory-actual')
    const { service } = createServiceFixture(
      undefined,
      vi.fn<(projectId: ProjectId) => MutableTestProjectSession>(() =>
        createTestSession(actualProjectId),
      ),
    )

    await expect(service.open(requestedProjectId)).rejects.toMatchObject({
      code: 'new-session-project-id-mismatch',
      expectedProjectId: requestedProjectId,
      actualProjectId,
    })
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
      projectId: requestedProjectId,
      failureCause: expect.objectContaining({
        code: 'new-session-project-id-mismatch',
      }),
    })
  })

  it('lets only the latest overlapping open request activate a Session', async () => {
    const firstProjectId = createTestProjectId('overlap-first')
    const secondProjectId = createTestProjectId('overlap-second')
    const firstGate = createDeferred()
    const secondGate = createDeferred()
    const store = new ControlledProjectCheckpointStore()
    store.readGates.set(firstProjectId, firstGate.promise)
    store.readGates.set(secondProjectId, secondGate.promise)
    const { createNewSession, service } = createServiceFixture(store)

    const firstOpen = service.open(firstProjectId)
    const secondOpen = service.open(secondProjectId)
    secondGate.resolve()
    await secondOpen
    firstGate.resolve()
    await firstOpen

    const state = requireReady(service.state)
    expect(state.projectId).toBe(secondProjectId)
    expect(createNewSession).toHaveBeenCalledTimes(1)
    expect(createNewSession).toHaveBeenCalledWith(secondProjectId)
  })
})

describe('ActiveProjectService saving and dirty state', () => {
  it('tracks Session commits and clears dirty only after a successful current save', async () => {
    const projectId = createTestProjectId('dirty')
    let session: MutableTestProjectSession | undefined
    const { service, store } = createServiceFixture(
      undefined,
      vi.fn((requestedProjectId: ProjectId) => {
        session = createTestSession(requestedProjectId)
        return session
      }),
    )
    await service.open(projectId)

    await service.save()
    expect(requireReady(service.state)).toMatchObject({
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })
    expect(store.saved).toHaveLength(1)

    await session?.emitCommit()
    expect(requireReady(service.state)).toMatchObject({
      modelRevision: 1,
      savedRevision: 0,
      isDirty: true,
    })
  })

  it('remains dirty when editing continues during a save and rejects a concurrent save', async () => {
    const projectId = createTestProjectId('save-race')
    let session: MutableTestProjectSession | undefined
    const { service, store } = createServiceFixture(
      undefined,
      vi.fn((requestedProjectId: ProjectId) => {
        session = createTestSession(requestedProjectId)
        return session
      }),
    )
    await service.open(projectId)
    await service.save()

    const gate = createDeferred()
    store.saveGate = gate.promise
    const saving = service.save()
    expect(requireReady(service.state).saveStatus).toBe(ACTIVE_PROJECT_SAVE_STATUS.SAVING)
    await expect(service.save()).rejects.toMatchObject({ code: 'save-in-progress' })

    await session?.emitCommit()
    gate.resolve()
    await saving

    expect(requireReady(service.state)).toMatchObject({
      modelRevision: 1,
      savedRevision: 0,
      isDirty: true,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })
  })

  it('keeps the Session and saved baseline after a failed save, then allows retry', async () => {
    const projectId = createTestProjectId('save-failure')
    const { service, store } = createServiceFixture()
    await service.open(projectId)
    await service.save()
    const session = requireReady(service.state).session
    const cause = new Error('transaction aborted')
    store.saveFailure = cause

    await expect(service.save()).rejects.toMatchObject({
      code: 'store-write-failed',
      failureCause: cause,
    })

    expect(requireReady(service.state)).toMatchObject({
      session,
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.FAILED,
      saveFailure: expect.objectContaining({ failureCause: cause }),
    })

    store.saveFailure = undefined
    await service.save()
    expect(requireReady(service.state)).toMatchObject({
      session,
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      saveFailure: null,
    })
  })
})

describe('ActiveProjectService lifecycle and observers', () => {
  it('ignores an in-flight open completion after disposal', async () => {
    const projectId = createTestProjectId('disposed')
    const gate = createDeferred()
    const store = new ControlledProjectCheckpointStore()
    store.readGates.set(projectId, gate.promise)
    const { createNewSession, service } = createServiceFixture(store)

    const opening = service.open(projectId)
    service.dispose()
    gate.resolve()
    await opening

    expect(service.state).toEqual({ phase: ACTIVE_PROJECT_PHASE.DISPOSED })
    expect(createNewSession).not.toHaveBeenCalled()
    await expect(service.save()).rejects.toBeInstanceOf(ActiveProjectError)
  })

  it('isolates a failed state observer from independent observers', async () => {
    const projectId = createTestProjectId('observer')
    const { service } = createServiceFixture()
    const deliveryFailures: unknown[] = []
    const healthyPhases: string[] = []
    service.subscribe({
      onStateChange() {
        throw new Error('observer render failed')
      },
      onError(failure) {
        deliveryFailures.push(failure)
      },
    })
    service.subscribe({
      onStateChange(state) {
        healthyPhases.push(state.phase)
      },
      onError() {},
    })

    await service.open(projectId)

    expect(deliveryFailures).toEqual([
      expect.objectContaining({
        state: expect.objectContaining({ phase: ACTIVE_PROJECT_PHASE.OPENING }),
        cause: expect.any(Error),
      }),
    ])
    expect(healthyPhases).toEqual([ACTIVE_PROJECT_PHASE.OPENING, ACTIVE_PROJECT_PHASE.READY])
  })
})
