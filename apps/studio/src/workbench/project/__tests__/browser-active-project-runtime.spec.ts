import 'fake-indexeddb/auto'

import { DomainValueError, parseProjectId } from '@seele-daw/project-core'
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
    getCurrentTime: () => 1_000,
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
    const projectId = parseProjectId('first-runtime-1')
    const firstIds = createSequentialUniqueId('first-runtime')
    const firstRuntime = createRuntime(databaseName, firstIds, 'Persisted Runtime Project')

    await expect(firstRuntime.activeProject.create()).resolves.toBe(projectId)

    const initial = requireReady(firstRuntime.activeProject.state)
    const initialSnapshot = initial.session.getSnapshot()
    expect(initial).toMatchObject({
      projectId,
      modelRevision: 0,
      savedRevision: 0,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })
    expect(initialSnapshot.project).toEqual({ id: projectId, name: 'Persisted Runtime Project' })
    expect(initialSnapshot.tempoEvents.map(({ id }) => id)).toEqual(['first-runtime-2'])
    expect(initialSnapshot.timeSignatureEvents.map(({ id }) => id)).toEqual(['first-runtime-3'])
    expect(initialSnapshot.trackOrder).toEqual([])
    expect(initialSnapshot.tracks).toEqual([])
    expect(initialSnapshot.clips).toEqual([])
    expect(initialSnapshot.devices).toEqual([])
    expect(firstIds).toHaveBeenCalledTimes(4)
    await expect(firstRuntime.projectCatalog.listRecentProjects()).resolves.toEqual([
      {
        projectId,
        name: 'Persisted Runtime Project',
        lastCheckpointSavedAt: 1_000,
      },
    ])
    const savedSession = initial.session
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
    await runtime.activeProject.create()

    runtime.dispose()
    runtime.dispose()

    await expect(deleteDatabase(databaseName)).resolves.toBeUndefined()
    databaseNames.delete(databaseName)
  })

  it('reports an invalid injected unique ID through the Active Project failure state', async () => {
    const databaseName = createDatabaseName('invalid-id')
    const createInvalidId = vi.fn<() => string>(() => '')
    const runtime = createRuntime(databaseName, createInvalidId)

    await expect(runtime.activeProject.create()).rejects.toBeInstanceOf(DomainValueError)

    expect(createInvalidId).toHaveBeenCalledTimes(1)
    expect(runtime.activeProject.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
      projectId: null,
      failureCause: expect.any(DomainValueError),
    })
  })

  it('reports an invalid injected Project name without persisting a Checkpoint', async () => {
    const databaseName = createDatabaseName('invalid-name')
    const createUniqueId = createSequentialUniqueId('invalid-name')
    const runtime = createRuntime(databaseName, createUniqueId, '   ')
    const projectId = parseProjectId('invalid-name-1')

    await expect(runtime.activeProject.create()).rejects.toBeInstanceOf(DomainValueError)

    expect(createUniqueId).toHaveBeenCalledTimes(3)
    expect(runtime.activeProject.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
      projectId,
      failureCause: expect.any(DomainValueError),
    })
  })
})
