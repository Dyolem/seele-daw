import 'fake-indexeddb/auto'

import { DomainValueError, parseProjectId, type ProjectId } from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBrowserActiveProjectRuntime,
  type BrowserActiveProjectRuntime,
} from '@/workbench/project/browser-active-project-runtime'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'

const runtimes: BrowserActiveProjectRuntime[] = []
const databaseNames = new Set<string>()
let databaseSequence = 0

function createDatabaseName(suffix: string): string {
  databaseSequence += 1
  const databaseName = `seele-studio-runtime-${suffix}-${databaseSequence}`
  databaseNames.add(databaseName)
  return databaseName
}

function createProjectId(suffix: string): ProjectId {
  return parseProjectId(`project-browser-runtime-${suffix}`)
}

function createSequentialUniqueId(prefix: string) {
  let sequence = 0

  return vi.fn<() => string>(() => {
    sequence += 1
    return `${prefix}-${sequence}`
  })
}

function createRuntime(
  databaseName: string,
  createUniqueId = createSequentialUniqueId('runtime-id'),
  newProjectName = 'Runtime Test Project',
): BrowserActiveProjectRuntime {
  const runtime = createBrowserActiveProjectRuntime({
    databaseName,
    createUniqueId,
    newProjectName,
  })
  runtimes.push(runtime)
  return runtime
}

function requireReady(state: ActiveProjectState): ReadyActiveProjectState {
  if (state.phase !== ACTIVE_PROJECT_PHASE.READY) {
    throw new Error(`Expected ready Active Project state, received ${state.phase}`)
  }

  return state
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`IndexedDB deletion blocked for ${databaseName}`))
  })
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) runtime.dispose()
  for (const databaseName of databaseNames) await deleteDatabase(databaseName)
  databaseNames.clear()
})

describe('BrowserActiveProjectRuntime', () => {
  it('saves and restores a minimal Project across complete Runtime lifetimes', async () => {
    const databaseName = createDatabaseName('recovery')
    const projectId = createProjectId('recovery')
    const firstIds = createSequentialUniqueId('first-runtime')
    const firstRuntime = createRuntime(databaseName, firstIds, 'Persisted Runtime Project')

    await firstRuntime.activeProject.open(projectId)

    const initial = requireReady(firstRuntime.activeProject.state)
    const initialSnapshot = initial.session.getSnapshot()
    expect(initial).toMatchObject({
      projectId,
      modelRevision: 0,
      savedRevision: null,
      isDirty: true,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })
    expect(initialSnapshot.project).toEqual({ id: projectId, name: 'Persisted Runtime Project' })
    expect(initialSnapshot.tempoEvents.map(({ id }) => id)).toEqual(['first-runtime-1'])
    expect(initialSnapshot.timeSignatureEvents.map(({ id }) => id)).toEqual(['first-runtime-2'])
    expect(initialSnapshot.trackOrder).toEqual([])
    expect(initialSnapshot.tracks).toEqual([])
    expect(initialSnapshot.clips).toEqual([])
    expect(initialSnapshot.devices).toEqual([])
    expect(firstIds).toHaveBeenCalledTimes(2)

    await firstRuntime.activeProject.save()

    const saved = requireReady(firstRuntime.activeProject.state)
    expect(saved).toMatchObject({
      modelRevision: 0,
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })
    expect(firstIds).toHaveBeenCalledTimes(3)
    const savedSession = saved.session
    firstRuntime.dispose()
    firstRuntime.dispose()
    expect(firstRuntime.activeProject.state).toEqual({ phase: ACTIVE_PROJECT_PHASE.DISPOSED })

    const restoredIds = createSequentialUniqueId('restored-runtime')
    const restoredRuntime = createRuntime(databaseName, restoredIds, 'Must Not Be Used')
    await restoredRuntime.activeProject.open(projectId)

    const restored = requireReady(restoredRuntime.activeProject.state)
    expect(restored.session).not.toBe(savedSession)
    expect(restored).toMatchObject({
      projectId,
      modelRevision: 0,
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      recoveryFailures: [],
    })
    expect(restored.session.getSnapshot()).toEqual(initialSnapshot)
    expect(restoredIds).not.toHaveBeenCalled()
  })

  it('closes its IndexedDB connection when disposed', async () => {
    const databaseName = createDatabaseName('dispose')
    const runtime = createRuntime(databaseName)
    await runtime.activeProject.open(createProjectId('dispose'))
    await runtime.activeProject.save()

    runtime.dispose()
    runtime.dispose()

    await expect(deleteDatabase(databaseName)).resolves.toBeUndefined()
    databaseNames.delete(databaseName)
  })

  it('reports an invalid injected unique ID through the Active Project failure state', async () => {
    const databaseName = createDatabaseName('invalid-id')
    const createInvalidId = vi.fn<() => string>(() => '')
    const runtime = createRuntime(databaseName, createInvalidId)
    const projectId = createProjectId('invalid-id')

    await expect(runtime.activeProject.open(projectId)).rejects.toBeInstanceOf(DomainValueError)

    expect(createInvalidId).toHaveBeenCalledTimes(1)
    expect(runtime.activeProject.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
      projectId,
      failureCause: expect.any(DomainValueError),
    })
  })

  it('reports an invalid injected Project name without persisting a Checkpoint', async () => {
    const databaseName = createDatabaseName('invalid-name')
    const createUniqueId = createSequentialUniqueId('invalid-name')
    const runtime = createRuntime(databaseName, createUniqueId, '   ')
    const projectId = createProjectId('invalid-name')

    await expect(runtime.activeProject.open(projectId)).rejects.toBeInstanceOf(DomainValueError)

    expect(createUniqueId).toHaveBeenCalledTimes(2)
    expect(runtime.activeProject.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
      projectId,
      failureCause: expect.any(DomainValueError),
    })
  })
})
