import 'fake-indexeddb/auto'

import * as platformBrowser from '#internal/index'
import {
  createTestDatabaseName,
  deleteTestDatabase,
  putRawProjectCatalogRecord,
} from '#internal/__tests__/support/indexed-db-test-support'
import {
  IndexedDBProjectCatalog,
  IndexedDBProjectCheckpointStore,
  IndexedDBStorageError,
} from '#internal/index'
import {
  createInitialProjectSession,
  createProjectCheckpoint,
  parseProjectCheckpointId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  type ProjectCheckpoint,
  type ProjectId,
} from '@seele-daw/project-core'
import { afterEach, describe, expect, it } from 'vitest'

interface CatalogFixture {
  readonly catalog: IndexedDBProjectCatalog
  readonly store: IndexedDBProjectCheckpointStore
}

const catalogs: IndexedDBProjectCatalog[] = []
const stores: IndexedDBProjectCheckpointStore[] = []
const databaseNames: string[] = []

function createFixture(label: string, getCurrentTime: () => number = Date.now): CatalogFixture {
  const databaseName = createTestDatabaseName(label)
  const catalog = new IndexedDBProjectCatalog({ databaseName })
  const store = new IndexedDBProjectCheckpointStore({ databaseName, getCurrentTime })
  catalogs.push(catalog)
  stores.push(store)
  databaseNames.push(databaseName)
  return { catalog, store }
}

function createCheckpoint(
  projectId: ProjectId,
  projectName: string,
  checkpointSuffix: string,
): ProjectCheckpoint {
  const session = createInitialProjectSession({
    projectId,
    projectName,
    tempoEventId: parseTempoEventId(`tempo-${checkpointSuffix}`),
    timeSignatureEventId: parseTimeSignatureEventId(`meter-${checkpointSuffix}`),
  })

  return createProjectCheckpoint(session.getSnapshot(), {
    checkpointId: parseProjectCheckpointId(`checkpoint-${checkpointSuffix}`),
  })
}

afterEach(async () => {
  for (const catalog of catalogs.splice(0)) catalog.close()
  for (const store of stores.splice(0)) store.close()
  for (const databaseName of databaseNames.splice(0)) await deleteTestDatabase(databaseName)
})

describe('IndexedDBProjectCatalog', () => {
  it('is a public read-only browser adapter while its physical schema remains private', async () => {
    const { catalog } = createFixture('catalog-public')

    expect(IndexedDBProjectCatalog).toBeTypeOf('function')
    expect('PROJECT_CATALOG_STORE' in platformBrowser).toBe(false)
    const projects = await catalog.listRecentProjects()
    expect(projects).toEqual([])
    expect(Object.isFrozen(projects)).toBe(true)
  })

  it('lists one summary per saved Project by most recent successful Checkpoint', async () => {
    const savedTimes = [100, 300, 400]
    const { catalog, store } = createFixture('catalog-order', () => savedTimes.shift()!)
    const firstProjectId = parseProjectId('project-catalog-first')
    const secondProjectId = parseProjectId('project-catalog-second')

    await store.save(createCheckpoint(firstProjectId, 'First draft', 'first-1'))
    await store.save(createCheckpoint(secondProjectId, 'Second', 'second-1'))
    await store.save(createCheckpoint(firstProjectId, 'First renamed', 'first-2'))

    const projects = await catalog.listRecentProjects()
    expect(projects).toEqual([
      {
        projectId: firstProjectId,
        name: 'First renamed',
        lastCheckpointSavedAt: 400,
      },
      {
        projectId: secondProjectId,
        name: 'Second',
        lastCheckpointSavedAt: 300,
      },
    ])
    expect(Object.isFrozen(projects)).toBe(true)
    expect(projects.every(Object.isFrozen)).toBe(true)
  })

  it('does not advance catalog metadata when the Checkpoint transaction aborts', async () => {
    const savedTimes = [100, 200]
    const { catalog, store } = createFixture('catalog-atomic', () => savedTimes.shift()!)
    const projectId = parseProjectId('project-catalog-atomic')
    await store.save(createCheckpoint(projectId, 'Stable name', 'atomic-valid'))
    const nextCheckpoint = createCheckpoint(projectId, 'Must not appear', 'atomic-broken')
    const brokenCheckpoint = {
      ...nextCheckpoint,
      projectFile: {
        ...nextCheckpoint.projectFile,
        uncloneableTestValue: () => undefined,
      },
    } as unknown as ProjectCheckpoint

    await expect(store.save(brokenCheckpoint)).rejects.toMatchObject({
      code: 'transaction-failed',
      operation: 'save-checkpoint',
    })
    await expect(catalog.listRecentProjects()).resolves.toEqual([
      { projectId, name: 'Stable name', lastCheckpointSavedAt: 100 },
    ])
  })

  it('rejects invalid physical Catalog records instead of trusting IndexedDB values', async () => {
    const { catalog } = createFixture('catalog-invalid-record')
    await catalog.listRecentProjects()
    await putRawProjectCatalogRecord(catalog.databaseName, {
      catalogRecordVersion: 99,
      projectId: 'project-catalog-invalid',
      name: 'Invalid',
      lastCheckpointSavedAt: 1,
    })

    const failure = catalog.listRecentProjects()
    await expect(failure).rejects.toBeInstanceOf(IndexedDBStorageError)
    await expect(failure).rejects.toMatchObject({
      code: 'invalid-record',
      operation: 'list-recent-projects',
    })
  })

  it('rejects an invalid clock value before writing a Checkpoint or Catalog entry', async () => {
    const { catalog, store } = createFixture('catalog-invalid-time', () => Number.NaN)
    const projectId = parseProjectId('project-catalog-invalid-time')

    await expect(
      store.save(createCheckpoint(projectId, 'Invalid time', 'invalid-time')),
    ).rejects.toMatchObject({ code: 'invalid-input', operation: 'save-checkpoint' })
    await expect(catalog.listRecentProjects()).resolves.toEqual([])
  })
})
