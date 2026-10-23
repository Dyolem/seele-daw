import { isProxy, isReadonly, isShallow } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createActiveProjectService,
  type ActiveProjectService,
} from '@/workbench/project/active-project-service'
import { createActiveProjectVueBinding } from '@/workbench/project/vue/active-project-vue-binding'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ActiveProjectStateDeliveryFailure,
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
  createProjectId = () => createTestProjectId('vue-binding-generated'),
) {
  const store = new ControlledProjectCheckpointStore()
  let session: MutableTestProjectSession | null = null
  const activeProject = createActiveProjectService({
    checkpointStore: store,
    createProjectId,
    createCheckpointId: createCheckpointIdFactory('checkpoint-vue-binding'),
    createNewSession: (projectId) => {
      session = createTestSession(projectId)
      return session
    },
  })

  return {
    activeProject,
    requireSession(): MutableTestProjectSession {
      if (session === null) throw new Error('Expected the test Session to exist')
      return session
    },
    store,
  }
}

describe('ActiveProjectVueBinding', () => {
  it('mirrors lifecycle and save state through a shallow readonly ref', async () => {
    const projectId = createTestProjectId('vue-state')
    const { activeProject, requireSession, store } = createServiceFixture(() => projectId)
    const binding = createActiveProjectVueBinding(activeProject)
    const state = binding.context.state

    expect(state.value).toBe(activeProject.state)
    expect(isShallow(state)).toBe(true)
    expect(isReadonly(state)).toBe(true)
    expect(isProxy(state.value)).toBe(false)

    const creating = activeProject.create()
    expect(state.value).toBe(activeProject.state)
    expect(state.value).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.CREATING, projectId })
    await creating

    const ready = requireReady(state.value)
    expect(ready).toBe(activeProject.state)
    expect(ready.isDirty).toBe(false)
    expect(binding.context.activeProject).toBe(activeProject)
    expect(isProxy(binding.context.activeProject)).toBe(false)
    expect(isProxy(ready.session)).toBe(false)
    expect(isProxy(ready.session.getSnapshot())).toBe(false)

    await requireSession().emitCommit()
    expect(requireReady(state.value)).toMatchObject({
      modelRevision: 1,
      savedRevision: 0,
      isDirty: true,
    })

    const gate = createDeferred()
    store.saveGate = gate.promise
    const saving = activeProject.save()
    expect(requireReady(state.value).saveStatus).toBe(ACTIVE_PROJECT_SAVE_STATUS.SAVING)
    gate.resolve()
    await saving
    expect(requireReady(state.value)).toMatchObject({
      modelRevision: 1,
      savedRevision: 1,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })

    const restoredProjectId = createTestProjectId('vue-state-restored')
    store.candidatesByProject.set(restoredProjectId, [
      createTestCheckpoint(restoredProjectId, 'checkpoint-vue-state-restored'),
    ])
    const opening = activeProject.open(restoredProjectId)
    expect(state.value).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPENING,
      projectId: restoredProjectId,
    })
    await opening
    expect(requireReady(state.value)).toMatchObject({
      projectId: restoredProjectId,
      savedRevision: 0,
      isDirty: false,
    })

    binding.dispose()
    activeProject.dispose()
  })

  it('stops observing without disposing the Active Project Service', async () => {
    const firstProjectId = createTestProjectId('vue-dispose-first')
    const secondProjectId = createTestProjectId('vue-dispose-second')
    const projectIds = [firstProjectId, secondProjectId]
    const { activeProject } = createServiceFixture(() => projectIds.shift()!)
    const binding = createActiveProjectVueBinding(activeProject)
    await activeProject.create()
    const lastObservedState = binding.context.state.value

    binding.dispose()
    binding.dispose()
    await activeProject.create()

    expect(binding.context.state.value).toBe(lastObservedState)
    expect(requireReady(activeProject.state).projectId).toBe(secondProjectId)
    activeProject.dispose()
  })

  it('reports a state delivery failure instead of dropping it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const state = Object.freeze<ActiveProjectState>({ phase: ACTIVE_PROJECT_PHASE.IDLE })
    const failure = Object.freeze<ActiveProjectStateDeliveryFailure>({
      state,
      cause: new Error('Vue state delivery failed'),
    })
    const unsubscribe = vi.fn<() => void>()
    const activeProject: ActiveProjectService = {
      state,
      create: () => Promise.resolve(createTestProjectId('vue-stub')),
      createFromSession: (session) => Promise.resolve(session.getSnapshot().project.id),
      open: () => Promise.resolve(),
      save: () => Promise.resolve(),
      subscribe(observer) {
        observer.onError(failure)
        return unsubscribe
      },
      subscribeCommits: () => () => undefined,
      dispose() {},
    }

    const binding = createActiveProjectVueBinding(activeProject)

    expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure)
    binding.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
