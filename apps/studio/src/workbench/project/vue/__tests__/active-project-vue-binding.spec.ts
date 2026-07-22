import { createApp, isProxy, isReadonly, isShallow } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  createActiveProjectService,
  type ActiveProjectService,
} from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_CONTEXT_KEY,
  useActiveProject,
} from '@/workbench/project/vue/active-project-context'
import { createActiveProjectVueBinding } from '@/workbench/project/vue/active-project-vue-binding'
import { ActiveProjectVueError } from '@/workbench/project/vue/active-project-vue-error'
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

function createServiceFixture() {
  const store = new ControlledProjectCheckpointStore()
  let session: MutableTestProjectSession | null = null
  const activeProject = createActiveProjectService({
    checkpointStore: store,
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
    const { activeProject, requireSession, store } = createServiceFixture()
    const binding = createActiveProjectVueBinding(activeProject)
    const state = binding.context.state
    const projectId = createTestProjectId('vue-state')

    expect(state.value).toBe(activeProject.state)
    expect(isShallow(state)).toBe(true)
    expect(isReadonly(state)).toBe(true)
    expect(isProxy(state.value)).toBe(false)
    expect(binding.stateDeliveryFailure.value).toBeNull()

    const opening = activeProject.open(projectId)
    expect(state.value).toBe(activeProject.state)
    expect(state.value).toMatchObject({ phase: ACTIVE_PROJECT_PHASE.OPENING, projectId })
    await opening

    const ready = requireReady(state.value)
    expect(ready).toBe(activeProject.state)
    expect(ready.isDirty).toBe(true)
    expect(binding.context.activeProject).toBe(activeProject)
    expect(isProxy(binding.context.activeProject)).toBe(false)
    expect(isProxy(ready.session)).toBe(false)
    expect(isProxy(ready.session.getSnapshot())).toBe(false)

    await requireSession().emitCommit()
    expect(requireReady(state.value)).toMatchObject({
      modelRevision: 1,
      savedRevision: null,
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

    binding.dispose()
    activeProject.dispose()
  })

  it('provides the same scoped Context and reports a missing Provider explicitly', () => {
    const { activeProject } = createServiceFixture()
    const binding = createActiveProjectVueBinding(activeProject)
    const providedApp = createApp({ render: () => null })
    providedApp.provide(ACTIVE_PROJECT_CONTEXT_KEY, binding.context)
    const missingApp = createApp({ render: () => null })

    expect(providedApp.runWithContext(() => useActiveProject())).toBe(binding.context)
    expect(() => missingApp.runWithContext(() => useActiveProject())).toThrowError(
      expect.objectContaining({
        name: 'ActiveProjectVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useActiveProject())).toThrow(ActiveProjectVueError)

    binding.dispose()
    activeProject.dispose()
  })

  it('stops observing without disposing the Active Project Service', async () => {
    const { activeProject } = createServiceFixture()
    const binding = createActiveProjectVueBinding(activeProject)
    const firstProjectId = createTestProjectId('vue-dispose-first')
    const secondProjectId = createTestProjectId('vue-dispose-second')
    await activeProject.open(firstProjectId)
    const lastObservedState = binding.context.state.value

    binding.dispose()
    binding.dispose()
    await activeProject.open(secondProjectId)

    expect(binding.context.state.value).toBe(lastObservedState)
    expect(requireReady(activeProject.state).projectId).toBe(secondProjectId)
    activeProject.dispose()
  })

  it('exposes an explicit state delivery failure channel', () => {
    const state = Object.freeze<ActiveProjectState>({ phase: ACTIVE_PROJECT_PHASE.IDLE })
    const failure = Object.freeze<ActiveProjectStateDeliveryFailure>({
      state,
      cause: new Error('Vue state delivery failed'),
    })
    const unsubscribe = vi.fn<() => void>()
    const activeProject: ActiveProjectService = {
      state,
      open: () => Promise.resolve(),
      save: () => Promise.resolve(),
      subscribe(observer) {
        observer.onError(failure)
        return unsubscribe
      },
      dispose() {},
    }

    const binding = createActiveProjectVueBinding(activeProject)

    expect(binding.stateDeliveryFailure.value).toBe(failure)
    expect(isShallow(binding.stateDeliveryFailure)).toBe(true)
    expect(isReadonly(binding.stateDeliveryFailure)).toBe(true)
    binding.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
