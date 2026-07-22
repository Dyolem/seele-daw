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
  createProjectId: () => ProjectId = () => createTestProjectId('generated'),
) {
  const service = createActiveProjectService({
    checkpointStore: store,
    createProjectId,
    createNewSession,
    createCheckpointId: createCheckpointIdFactory(),
  })

  return { createNewSession, service, store }
}

describe('ActiveProjectService creation and opening', () => {
  it('allocates an identity and saves the minimal Checkpoint before Create succeeds', async () => {
    const projectId = createTestProjectId('new')
    const { createNewSession, service, store } = createServiceFixture(
      undefined,
      undefined,
      () => projectId,
    )

    await expect(service.create()).resolves.toBe(projectId)

    const state = requireReady(service.state)
    expect(store.readProjectIds).toEqual([projectId])
    expect(createNewSession).toHaveBeenCalledExactlyOnceWith(projectId)
    expect(state).toMatchObject({
      projectId,
      modelRevision: 0,
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      saveFailure: null,
      recoveryFailures: [],
    })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.recoveryFailures)).toBe(true)
    expect(store.saved).toHaveLength(1)
    expect(store.saved[0]).toMatchObject({ projectId, sourceModelRevision: 0 })
  })

  it('fails Open explicitly when no Checkpoint exists and never creates a Project', async () => {
    const projectId = createTestProjectId('missing')
    const { createNewSession, service } = createServiceFixture()

    await expect(service.open(projectId)).rejects.toMatchObject({
      code: 'project-not-found',
      projectId,
    })

    expect(createNewSession).not.toHaveBeenCalled()
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
      projectId,
      failureCause: expect.objectContaining({ code: 'project-not-found' }),
    })
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

  it('does not Create over invalid Checkpoint candidates', async () => {
    const projectId = createTestProjectId('create-invalid')
    const store = new ControlledProjectCheckpointStore()
    store.candidatesByProject.set(projectId, [{}, { checkpointFormatVersion: 99 }])
    const { createNewSession, service } = createServiceFixture(store, undefined, () => projectId)

    await expect(service.create()).rejects.toMatchObject({
      code: 'no-valid-checkpoint',
    })

    expect(createNewSession).not.toHaveBeenCalled()
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
      projectId,
      failureCause: expect.objectContaining({ code: 'no-valid-checkpoint' }),
    })
  })

  it('does not Create over an existing valid Checkpoint', async () => {
    const projectId = createTestProjectId('create-existing')
    const store = new ControlledProjectCheckpointStore()
    store.candidatesByProject.set(projectId, [
      createTestCheckpoint(projectId, 'checkpoint-create-existing'),
    ])
    const { createNewSession, service } = createServiceFixture(store, undefined, () => projectId)

    await expect(service.create()).rejects.toMatchObject({
      code: 'generated-project-id-conflict',
      projectId,
    })

    expect(createNewSession).not.toHaveBeenCalled()
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
      projectId,
      failureCause: expect.objectContaining({ code: 'generated-project-id-conflict' }),
    })
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

  it('attributes a Checkpoint read failure to Create when Create requested it', async () => {
    const projectId = createTestProjectId('create-read-failure')
    const cause = new Error('IndexedDB unavailable during Create')
    const store = new ControlledProjectCheckpointStore()
    store.readFailure = cause
    const { service } = createServiceFixture(store, undefined, () => projectId)

    await expect(service.create()).rejects.toMatchObject({
      code: 'store-read-failed',
      failureCause: cause,
    })

    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
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
      () => requestedProjectId,
    )

    await expect(service.create()).rejects.toMatchObject({
      code: 'new-session-project-id-mismatch',
      expectedProjectId: requestedProjectId,
      actualProjectId,
    })
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
      projectId: requestedProjectId,
      failureCause: expect.objectContaining({
        code: 'new-session-project-id-mismatch',
      }),
    })
  })

  it('lets only the latest overlapping Create or Open request activate a Session', async () => {
    const firstProjectId = createTestProjectId('overlap-first')
    const secondProjectId = createTestProjectId('overlap-second')
    const firstGate = createDeferred()
    const secondGate = createDeferred()
    const store = new ControlledProjectCheckpointStore()
    store.readGates.set(firstProjectId, firstGate.promise)
    store.readGates.set(secondProjectId, secondGate.promise)
    store.candidatesByProject.set(secondProjectId, [
      createTestCheckpoint(secondProjectId, 'checkpoint-overlap-second'),
    ])
    const { createNewSession, service } = createServiceFixture(
      store,
      undefined,
      () => firstProjectId,
    )

    const firstActivation = service.create()
    const secondOpen = service.open(secondProjectId)
    secondGate.resolve()
    await secondOpen
    firstGate.resolve()
    await firstActivation

    const state = requireReady(service.state)
    expect(state.projectId).toBe(secondProjectId)
    expect(createNewSession).toHaveBeenCalledExactlyOnceWith(firstProjectId)
    expect(store.saved).toEqual([expect.objectContaining({ projectId: firstProjectId })])
  })

  it('keeps Open idempotent and gives each Create request a newly allocated identity', async () => {
    const firstProjectId = createTestProjectId('already-active')
    const secondProjectId = createTestProjectId('next-created')
    const projectIds = [firstProjectId, secondProjectId]
    const { service, store } = createServiceFixture(undefined, undefined, () => projectIds.shift()!)
    await service.create()
    const activeState = service.state

    await service.open(firstProjectId)
    expect(service.state).toBe(activeState)

    await expect(service.create()).resolves.toBe(secondProjectId)

    expect(requireReady(service.state).projectId).toBe(secondProjectId)
    expect(store.readProjectIds).toEqual([firstProjectId, secondProjectId])
    expect(store.saved).toHaveLength(2)
  })

  it('does not report Create success when the initial Checkpoint cannot be saved', async () => {
    const projectId = createTestProjectId('initial-save-failure')
    const cause = new Error('initial transaction aborted')
    const store = new ControlledProjectCheckpointStore()
    store.saveFailure = cause
    const { service } = createServiceFixture(store, undefined, () => projectId)

    await expect(service.create()).rejects.toMatchObject({
      code: 'store-write-failed',
      failureCause: cause,
    })
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
      projectId,
      failureCause: expect.objectContaining({ failureCause: cause }),
    })
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
      () => projectId,
    )
    await service.create()

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

    await service.save()
    expect(requireReady(service.state)).toMatchObject({
      savedRevision: 1,
      isDirty: false,
    })
    expect(store.saved).toHaveLength(2)
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
      () => projectId,
    )
    await service.create()

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
    const { service, store } = createServiceFixture(undefined, undefined, () => projectId)
    await service.create()
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
    const { service } = createServiceFixture(undefined, undefined, () => projectId)
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

    await service.create()

    expect(deliveryFailures).toEqual([
      expect.objectContaining({
        state: expect.objectContaining({ phase: ACTIVE_PROJECT_PHASE.CREATING }),
        cause: expect.any(Error),
      }),
    ])
    expect(healthyPhases).toEqual([ACTIVE_PROJECT_PHASE.CREATING, ACTIVE_PROJECT_PHASE.READY])
  })

  it('reports loss of Session commit observation independently from Create and Open', async () => {
    const projectId = createTestProjectId('session-observation-failure')
    let session!: MutableTestProjectSession
    const { service } = createServiceFixture(
      undefined,
      vi.fn<(projectId: ProjectId) => MutableTestProjectSession>((requestedProjectId) => {
        session = createTestSession(requestedProjectId)
        return session
      }),
      () => projectId,
    )
    await service.create()
    const cause = new Error('Active state refresh failed')

    await session.emitSubscriptionFailure(cause)

    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.SESSION_FAILED,
      projectId,
      failureCause: expect.objectContaining({
        code: 'session-subscription-failed',
        failureCause: expect.objectContaining({ cause }),
      }),
    })
  })
})
