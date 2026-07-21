import 'fake-indexeddb/auto'

import * as platformBrowser from '~/index'
import {
  createProjectCheckpointKey,
  PROJECT_CHECKPOINTS_STORE,
  PROJECT_CHECKPOINT_HEADS_STORE,
  SEELE_PROJECT_DATABASE_STORES,
  SEELE_PROJECT_DATABASE_VERSION,
  type SeeleProjectDatabaseSchema,
} from '~/storage/indexed-db/indexed-db-schema'
import {
  createTestDatabaseName,
  deleteRawCheckpoint,
  deleteTestDatabase,
  putRawCheckpoint,
  putRawCheckpointHead,
  readRawCheckpoint,
} from '~/__tests__/support/indexed-db-test-support'
import {
  ProjectCheckpointOperationError,
  createInitialProjectSession,
  createProjectCheckpoint,
  parseProjectCheckpointId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  restoreProjectCheckpoint,
  type ProjectCheckpoint,
  type ProjectCheckpointStore,
  type ProjectId,
} from '@seele-daw/project-core'
import { openDB } from 'idb'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import { IndexedDBProjectCheckpointStore, IndexedDBStorageError } from '~/index'

interface CheckpointFixture {
  readonly checkpoints: readonly ProjectCheckpoint[]
  readonly projectId: ProjectId
}

const stores: IndexedDBProjectCheckpointStore[] = []
const databaseNames: string[] = []

function createStore(label: string): IndexedDBProjectCheckpointStore {
  const databaseName = createTestDatabaseName(label)
  const store = new IndexedDBProjectCheckpointStore({ databaseName })
  stores.push(store)
  databaseNames.push(databaseName)
  return store
}

function createCheckpointFixture(
  projectLabel: string,
  checkpointLabels: readonly string[],
): CheckpointFixture {
  const projectId = parseProjectId(`project-${projectLabel}`)
  const session = createInitialProjectSession({
    projectId,
    projectName: `Project ${projectLabel}`,
    tempoEventId: parseTempoEventId(`tempo-${projectLabel}`),
    timeSignatureEventId: parseTimeSignatureEventId(`time-signature-${projectLabel}`),
  })
  const checkpoints = checkpointLabels.map((checkpointLabel) =>
    createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId(`checkpoint-${checkpointLabel}`),
    }),
  )

  return { checkpoints, projectId }
}

function checkpointIds(candidates: readonly unknown[]): readonly unknown[] {
  return candidates.map((candidate) =>
    candidate === undefined
      ? undefined
      : (candidate as { readonly checkpointId?: unknown }).checkpointId,
  )
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  for (const databaseName of databaseNames.splice(0)) await deleteTestDatabase(databaseName)
})

describe('IndexedDBProjectCheckpointStore public boundary', () => {
  it('implements the Project Core port without exporting its private schema or idb types', () => {
    const store = createStore('public-boundary')

    expectTypeOf(store).toMatchTypeOf<ProjectCheckpointStore>()
    expect(store.databaseName).toContain('public-boundary')
    expect(IndexedDBProjectCheckpointStore).toBeTypeOf('function')
    expect(IndexedDBStorageError).toBeTypeOf('function')
    expect('SEELE_PROJECT_DATABASE_VERSION' in platformBrowser).toBe(false)
    expect('SeeleProjectDatabase' in platformBrowser).toBe(false)
  })

  it('rejects an empty database name before opening IndexedDB', () => {
    expect(() => new IndexedDBProjectCheckpointStore({ databaseName: '' })).toThrow(
      expect.objectContaining({ code: 'invalid-input', operation: 'open-database' }),
    )
  })
})

describe('IndexedDB Physical Schema V1', () => {
  it('creates the documented object stores, key paths, and no indexes', async () => {
    const store = createStore('physical-schema')
    const { projectId } = createCheckpointFixture('physical-schema', [])
    await store.readCandidates(projectId)

    const database = await openDB<SeeleProjectDatabaseSchema>(
      store.databaseName,
      SEELE_PROJECT_DATABASE_VERSION,
    )
    const transaction = database.transaction(SEELE_PROJECT_DATABASE_STORES, 'readonly')
    const checkpoints = transaction.objectStore(PROJECT_CHECKPOINTS_STORE)
    const heads = transaction.objectStore(PROJECT_CHECKPOINT_HEADS_STORE)

    expect([...database.objectStoreNames].sort()).toEqual([...SEELE_PROJECT_DATABASE_STORES].sort())
    expect(checkpoints.keyPath).toEqual(['projectId', 'checkpointId'])
    expect([...checkpoints.indexNames]).toEqual([])
    expect(heads.keyPath).toBe('projectId')
    expect([...heads.indexNames]).toEqual([])

    await transaction.done
    database.close()
  })

  it('rejects an existing database whose version number hides a different layout', async () => {
    const store = createStore('invalid-schema')
    const database = await openDB(store.databaseName, SEELE_PROJECT_DATABASE_VERSION, {
      upgrade(databaseToUpgrade) {
        databaseToUpgrade.createObjectStore('foreignStore')
      },
    })
    database.close()
    const { projectId } = createCheckpointFixture('invalid-schema', [])

    await expect(store.readCandidates(projectId)).rejects.toMatchObject({
      code: 'invalid-database-schema',
      operation: 'open-database',
    })
  })
})

describe('Project Checkpoint persistence', () => {
  it('returns no candidates for a project without a Head and can reopen after close', async () => {
    const store = createStore('empty-reopen')
    const { checkpoints, projectId } = createCheckpointFixture('empty-reopen', ['first'])

    const emptyCandidates = await store.readCandidates(projectId)
    expect(emptyCandidates).toEqual([])
    expect(Object.isFrozen(emptyCandidates)).toBe(true)

    store.close()
    await store.save(checkpoints[0]!)
    expect(checkpointIds(await store.readCandidates(projectId))).toEqual(['checkpoint-first'])
  })

  it('rotates active and previous atomically and removes the third-oldest record', async () => {
    const store = createStore('rotation')
    const { checkpoints, projectId } = createCheckpointFixture('rotation', [
      'first',
      'second',
      'third',
    ])

    await store.save(checkpoints[0]!)
    expect(checkpointIds(await store.readCandidates(projectId))).toEqual(['checkpoint-first'])

    await store.save(checkpoints[1]!)
    expect(checkpointIds(await store.readCandidates(projectId))).toEqual([
      'checkpoint-second',
      'checkpoint-first',
    ])

    await store.save(checkpoints[2]!)
    expect(checkpointIds(await store.readCandidates(projectId))).toEqual([
      'checkpoint-third',
      'checkpoint-second',
    ])
    expect(
      await readRawCheckpoint(
        store.databaseName,
        createProjectCheckpointKey(projectId, checkpoints[0]!.checkpointId),
      ),
    ).toBeUndefined()
  })

  it('isolates Heads and retained records by Project ID', async () => {
    const store = createStore('project-isolation')
    const firstProject = createCheckpointFixture('isolation-a', ['a1', 'a2'])
    const secondProject = createCheckpointFixture('isolation-b', ['b1'])

    await store.save(firstProject.checkpoints[0]!)
    await store.save(secondProject.checkpoints[0]!)
    await store.save(firstProject.checkpoints[1]!)

    expect(checkpointIds(await store.readCandidates(firstProject.projectId))).toEqual([
      'checkpoint-a2',
      'checkpoint-a1',
    ])
    expect(checkpointIds(await store.readCandidates(secondProject.projectId))).toEqual([
      'checkpoint-b1',
    ])
  })

  it('serializes overlapping concurrent saves without losing either retained record', async () => {
    const store = createStore('concurrent')
    const { checkpoints, projectId } = createCheckpointFixture('concurrent', ['first', 'second'])

    await Promise.all([store.save(checkpoints[0]!), store.save(checkpoints[1]!)])

    expect(checkpointIds(await store.readCandidates(projectId))).toEqual([
      'checkpoint-second',
      'checkpoint-first',
    ])
  })

  it('rejects a duplicate immutable ID and leaves the current Head unchanged', async () => {
    const store = createStore('duplicate')
    const { checkpoints, projectId } = createCheckpointFixture('duplicate', ['only'])
    await store.save(checkpoints[0]!)

    await expect(store.save(checkpoints[0]!)).rejects.toMatchObject({
      checkpointId: 'checkpoint-only',
      code: 'record-conflict',
      operation: 'save-checkpoint',
      projectId,
    })
    expect(checkpointIds(await store.readCandidates(projectId))).toEqual(['checkpoint-only'])
  })

  it('aborts an uncloneable write without replacing the previous active candidate', async () => {
    const store = createStore('clone-failure')
    const { checkpoints, projectId } = createCheckpointFixture('clone-failure', ['valid', 'broken'])
    await store.save(checkpoints[0]!)

    const uncloneableCheckpoint = {
      ...checkpoints[1]!,
      projectFile: {
        ...checkpoints[1]!.projectFile,
        uncloneableTestValue: () => undefined,
      },
    } as unknown as ProjectCheckpoint

    await expect(store.save(uncloneableCheckpoint)).rejects.toMatchObject({
      code: 'transaction-failed',
      operation: 'save-checkpoint',
    })
    expect(checkpointIds(await store.readCandidates(projectId))).toEqual(['checkpoint-valid'])
  })
})

describe('Checkpoint recovery candidates', () => {
  it('preserves a missing active slot so Project Core diagnoses it and restores previous', async () => {
    const store = createStore('missing-active')
    const { checkpoints, projectId } = createCheckpointFixture('missing-active', [
      'previous',
      'active',
    ])
    await store.save(checkpoints[0]!)
    await store.save(checkpoints[1]!)
    await deleteRawCheckpoint(
      store.databaseName,
      createProjectCheckpointKey(projectId, checkpoints[1]!.checkpointId),
    )

    expect(checkpointIds(await store.readCandidates(projectId))).toEqual([
      undefined,
      'checkpoint-previous',
    ])

    const restored = await restoreProjectCheckpoint(store, projectId)
    expect(restored?.checkpoint.checkpointId).toBe('checkpoint-previous')
    expect(restored?.rejectedCandidates).toHaveLength(1)
  })

  it('returns corrupt Checkpoint data untouched so the Core decoder can fall back', async () => {
    const store = createStore('corrupt-active')
    const { checkpoints, projectId } = createCheckpointFixture('corrupt-active', [
      'previous',
      'active',
    ])
    await store.save(checkpoints[0]!)
    await store.save(checkpoints[1]!)
    await putRawCheckpoint(store.databaseName, {
      ...checkpoints[1]!,
      sourceModelRevision: -1,
    })

    const restored = await restoreProjectCheckpoint(store, projectId)

    expect(restored?.checkpoint.checkpointId).toBe('checkpoint-previous')
    expect(restored?.rejectedCandidates).toHaveLength(1)
    expect(restored?.rejectedCandidates[0]).toMatchObject({ candidateIndex: 0 })
  })

  it('reports corrupt Head metadata as an adapter error preserved by the Core boundary', async () => {
    const store = createStore('corrupt-head')
    const { projectId } = createCheckpointFixture('corrupt-head', [])
    await store.readCandidates(projectId)
    await putRawCheckpointHead(store.databaseName, {
      projectId,
      activeCheckpointId: '',
      previousCheckpointId: null,
    })

    const directFailure = store.readCandidates(projectId)
    await expect(directFailure).rejects.toBeInstanceOf(IndexedDBStorageError)
    await expect(directFailure).rejects.toMatchObject({
      code: 'invalid-record',
      operation: 'read-checkpoint-candidates',
    })

    const coreFailure = restoreProjectCheckpoint(store, projectId)
    await expect(coreFailure).rejects.toBeInstanceOf(ProjectCheckpointOperationError)
    await expect(coreFailure).rejects.toMatchObject({
      code: 'store-read-failed',
      failureCause: expect.objectContaining({ code: 'invalid-record' }),
    })
  })
})
