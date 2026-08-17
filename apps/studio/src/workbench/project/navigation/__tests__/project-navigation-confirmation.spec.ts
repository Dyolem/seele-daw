import { describe, expect, it, vi } from 'vitest'

import {
  ControlledProjectCheckpointStore,
  createCheckpointIdFactory,
  createDeferred,
  createTestProjectId,
  createTestSession,
  type MutableTestProjectSession,
} from '@/workbench/project/__tests__/active-project-test-support'
import {
  createActiveProjectService,
  type ActiveProjectService,
} from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  createProjectNavigationConfirmationCoordinator,
  PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION,
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  PROJECT_NAVIGATION_DECISION,
  PROJECT_NAVIGATION_INTENT_KIND,
  PROJECT_NAVIGATION_PROCEED_REASON,
  type ProjectNavigationDecision,
  type ProjectNavigationDecisionRequester,
  type ProjectNavigationIntent,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { ProjectNavigationConfirmationError } from '@/workbench/project/navigation/project-navigation-confirmation-error'

interface ReadyServiceFixture {
  readonly service: ActiveProjectService
  readonly session: MutableTestProjectSession
  readonly store: ControlledProjectCheckpointStore
}

function requireReadyState(service: ActiveProjectService): ReadyActiveProjectState {
  if (service.state.phase !== ACTIVE_PROJECT_PHASE.READY) {
    throw new Error(`Expected a ready Active Project, received ${service.state.phase}`)
  }

  return service.state
}

async function createReadyServiceFixture(): Promise<ReadyServiceFixture> {
  const projectId = createTestProjectId('navigation-current')
  const session = createTestSession(projectId)
  const store = new ControlledProjectCheckpointStore()
  const service = createActiveProjectService({
    checkpointStore: store,
    createProjectId: () => projectId,
    createNewSession: () => session,
    createCheckpointId: createCheckpointIdFactory('checkpoint-navigation'),
  })

  await service.create()
  return { service, session, store }
}

function createCoordinator(
  activeProject: ActiveProjectService,
  requestDecision: ProjectNavigationDecisionRequester,
) {
  return createProjectNavigationConfirmationCoordinator({ activeProject, requestDecision })
}

const LEAVE_PROJECT_INTENT = Object.freeze<ProjectNavigationIntent>({
  kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT,
})

describe('ProjectNavigationConfirmationCoordinator immediate permission', () => {
  it('proceeds without a decision for non-ready, clean, and same-Project navigation', async () => {
    const projectId = createTestProjectId('navigation-immediate')
    const session = createTestSession(projectId)
    const service = createActiveProjectService({
      checkpointStore: new ControlledProjectCheckpointStore(),
      createProjectId: () => projectId,
      createNewSession: () => session,
      createCheckpointId: createCheckpointIdFactory('checkpoint-navigation-immediate'),
    })
    const requestDecision = vi.fn<ProjectNavigationDecisionRequester>()
    const coordinator = createCoordinator(service, requestDecision)

    const idleResult = await coordinator.confirm(LEAVE_PROJECT_INTENT)
    expect(idleResult).toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.NOT_READY,
      activeProjectId: null,
    })

    await service.create()
    const cleanResult = await coordinator.confirm(LEAVE_PROJECT_INTENT)
    expect(cleanResult).toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.CLEAN,
      activeProjectId: projectId,
    })

    await session.emitCommit()
    const sameProjectResult = await coordinator.confirm({
      kind: PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT,
      projectId,
    })
    expect(sameProjectResult).toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.SAME_PROJECT,
      activeProjectId: projectId,
    })
    expect(requestDecision).not.toHaveBeenCalled()
    expect(Object.isFrozen(coordinator)).toBe(true)
    expect(Object.isFrozen(idleResult)).toBe(true)
    expect(Object.isFrozen(cleanResult)).toBe(true)
    expect(Object.isFrozen(sameProjectResult)).toBe(true)
  })
})

describe('ProjectNavigationConfirmationCoordinator decisions', () => {
  it('cancels or authorizes discard without changing the dirty Active Project', async () => {
    const { service, session } = await createReadyServiceFixture()
    await session.emitCommit()
    const inputIntent: ProjectNavigationIntent = {
      kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT,
    }
    const requestDecision = vi
      .fn<ProjectNavigationDecisionRequester>()
      .mockResolvedValueOnce(PROJECT_NAVIGATION_DECISION.CANCEL)
      .mockResolvedValueOnce(PROJECT_NAVIGATION_DECISION.DISCARD)
    const coordinator = createCoordinator(service, requestDecision)

    const cancelled = await coordinator.confirm(inputIntent)
    const discarded = await coordinator.confirm(inputIntent)
    const ready = requireReadyState(service)

    expect(cancelled).toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED,
      activeProjectId: ready.projectId,
    })
    expect(discarded).toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.DISCARDED,
      activeProjectId: ready.projectId,
    })
    expect(service.state).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.READY, isDirty: true })
    expect(Object.isFrozen(cancelled)).toBe(true)
    expect(Object.isFrozen(discarded)).toBe(true)

    const request = requestDecision.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      activeProjectId: ready.projectId,
      contentStateId: session.contentStateId,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      previousSaveFailure: null,
    })
    expect(request?.intent).not.toBe(inputIntent)
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request?.intent)).toBe(true)
  })

  it('saves the current content before granting permission', async () => {
    const { service, session, store } = await createReadyServiceFixture()
    await session.emitCommit()
    const requestDecision = vi
      .fn<ProjectNavigationDecisionRequester>()
      .mockResolvedValue(PROJECT_NAVIGATION_DECISION.SAVE)

    const result = await createCoordinator(service, requestDecision).confirm(LEAVE_PROJECT_INTENT)
    const ready = requireReadyState(service)

    expect(result).toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.SAVED,
      activeProjectId: ready.projectId,
    })
    expect(store.saved).toHaveLength(2)
    expect(service.state).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.READY, isDirty: false })
    expect(requestDecision).toHaveBeenCalledOnce()
  })

  it('returns stable failures when saving or requesting a decision fails', async () => {
    const { service, session, store } = await createReadyServiceFixture()
    await session.emitCommit()
    const saveFailure = new Error('Checkpoint write failed')
    store.saveFailure = saveFailure
    const saveResult = await createCoordinator(
      service,
      vi
        .fn<ProjectNavigationDecisionRequester>()
        .mockResolvedValue(PROJECT_NAVIGATION_DECISION.SAVE),
    ).confirm(LEAVE_PROJECT_INTENT)

    expect(saveResult).toMatchObject({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED,
      operation: PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.SAVE_PROJECT,
      failureCause: expect.objectContaining({ cause: saveFailure }),
    })
    expect(Object.isFrozen(saveResult)).toBe(true)
    expect(service.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.READY,
      isDirty: true,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.FAILED,
      saveFailure: expect.objectContaining({ cause: saveFailure }),
    })

    const promptFailure = new Error('Decision UI failed')
    const decisionResult = await createCoordinator(
      service,
      vi.fn<ProjectNavigationDecisionRequester>().mockRejectedValue(promptFailure),
    ).confirm(LEAVE_PROJECT_INTENT)

    expect(decisionResult).toMatchObject({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED,
      operation: PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.REQUEST_DECISION,
      failureCause: promptFailure,
    })
    expect(Object.isFrozen(decisionResult)).toBe(true)
  })

  it('rejects invalid runtime intents and decisions without allowing navigation', async () => {
    const { service, session } = await createReadyServiceFixture()
    await session.emitCommit()
    const invalidDecisionRequester = vi.fn<ProjectNavigationDecisionRequester>(() =>
      Promise.resolve('unsupported-decision' as ProjectNavigationDecision),
    )
    const coordinator = createCoordinator(service, invalidDecisionRequester)

    const invalidDecisionResult = await coordinator.confirm(LEAVE_PROJECT_INTENT)
    expect(invalidDecisionResult).toMatchObject({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED,
      operation: PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.REQUEST_DECISION,
      failureCause: expect.objectContaining({
        name: 'ProjectNavigationConfirmationError',
        code: 'invalid-decision',
      }),
    })
    expect(invalidDecisionResult.kind).toBe(PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED)
    if (invalidDecisionResult.kind !== PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED) {
      throw new Error('Expected an invalid decision failure')
    }
    expect(invalidDecisionResult.failureCause).toBeInstanceOf(ProjectNavigationConfirmationError)

    await expect(
      coordinator.confirm({ kind: 'unsupported-intent' } as never),
    ).rejects.toMatchObject({
      name: 'ProjectNavigationConfirmationError',
      code: 'invalid-intent',
    })
  })
})

describe('ProjectNavigationConfirmationCoordinator state races', () => {
  it('does not apply a stale discard decision to content edited while the prompt is open', async () => {
    const { service, session } = await createReadyServiceFixture()
    await session.emitCommit()
    let resolveFirstDecision!: (decision: ProjectNavigationDecision) => void
    const firstDecision = new Promise<ProjectNavigationDecision>((resolve) => {
      resolveFirstDecision = resolve
    })
    const requestDecision = vi
      .fn<ProjectNavigationDecisionRequester>()
      .mockImplementationOnce(() => firstDecision)
      .mockResolvedValueOnce(PROJECT_NAVIGATION_DECISION.CANCEL)
    const coordinator = createCoordinator(service, requestDecision)
    const confirmation = coordinator.confirm(LEAVE_PROJECT_INTENT)

    await vi.waitFor(() => expect(requestDecision).toHaveBeenCalledOnce())
    const firstContentStateId = requestDecision.mock.calls[0]?.[0].contentStateId
    await session.emitCommit()
    resolveFirstDecision(PROJECT_NAVIGATION_DECISION.DISCARD)
    const ready = requireReadyState(service)

    await expect(confirmation).resolves.toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED,
      activeProjectId: ready.projectId,
    })
    expect(requestDecision).toHaveBeenCalledTimes(2)
    expect(requestDecision.mock.calls[1]?.[0].contentStateId).not.toBe(firstContentStateId)
    expect(service.state).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.READY, isDirty: true })
  })

  it('keeps a decision valid when History returns to the same content position', async () => {
    const { service, session } = await createReadyServiceFixture()
    await session.emitCommit()
    const promptedContentStateId = session.contentStateId
    let resolveDecision!: (decision: ProjectNavigationDecision) => void
    const pendingDecision = new Promise<ProjectNavigationDecision>((resolve) => {
      resolveDecision = resolve
    })
    const requestDecision = vi
      .fn<ProjectNavigationDecisionRequester>()
      .mockImplementationOnce(() => pendingDecision)
    const confirmation = createCoordinator(service, requestDecision).confirm(LEAVE_PROJECT_INTENT)

    await vi.waitFor(() => expect(requestDecision).toHaveBeenCalledOnce())
    await session.emitCommit()
    await session.emitCommit(promptedContentStateId)
    resolveDecision(PROJECT_NAVIGATION_DECISION.DISCARD)

    await expect(confirmation).resolves.toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.DISCARDED,
      activeProjectId: requireReadyState(service).projectId,
    })
    expect(requestDecision).toHaveBeenCalledOnce()
    expect(service.state).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.READY, isDirty: true })
  })

  it('reconfirms newer content when editing continues during a successful save', async () => {
    const { service, session, store } = await createReadyServiceFixture()
    await session.emitCommit()
    const saveGate = createDeferred()
    store.saveGate = saveGate.promise
    const requestDecision = vi
      .fn<ProjectNavigationDecisionRequester>()
      .mockResolvedValueOnce(PROJECT_NAVIGATION_DECISION.SAVE)
      .mockResolvedValueOnce(PROJECT_NAVIGATION_DECISION.DISCARD)
    const confirmation = createCoordinator(service, requestDecision).confirm(LEAVE_PROJECT_INTENT)

    await vi.waitFor(() => expect(store.saved).toHaveLength(2))
    const savedContentStateId = requestDecision.mock.calls[0]?.[0].contentStateId
    await session.emitCommit()
    saveGate.resolve(undefined)
    const ready = requireReadyState(service)

    await expect(confirmation).resolves.toEqual({
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.DISCARDED,
      activeProjectId: ready.projectId,
    })
    expect(requestDecision).toHaveBeenCalledTimes(2)
    expect(requestDecision.mock.calls[1]?.[0].contentStateId).not.toBe(savedContentStateId)
    expect(service.state).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.READY, isDirty: true })
  })
})
