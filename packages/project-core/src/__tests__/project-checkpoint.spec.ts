import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_CHECKPOINT_FORMAT_VERSION,
  PROJECT_COMMAND_EXECUTION_STATUS,
  DomainValueError,
  ProjectCheckpointOperationError,
  ProjectCheckpointValidationError,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createProjectCheckpoint,
  decodeProjectCheckpoint,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseProjectCheckpointId,
  parseProjectId,
  parseTick,
  restoreProjectCheckpoint,
  saveProjectCheckpoint,
  type ProjectCheckpoint,
  type ProjectCheckpointStore,
  type ProjectId,
  type ProjectSession,
  type MidiSourceId,
} from '#internal/index'
import { createFixtureProjectSession } from './support/project-session-test-support'

type MutableDataObject = Record<string, unknown>

class TestProjectCheckpointStore implements ProjectCheckpointStore {
  readonly saved: ProjectCheckpoint[] = []
  readonly readProjectIds: ProjectId[] = []
  candidates: readonly unknown[] = []
  saveFailure: unknown
  readFailure: unknown
  saveGate: Promise<void> | null = null

  async save(checkpoint: ProjectCheckpoint): Promise<void> {
    this.saved.push(checkpoint)
    if (this.saveGate !== null) await this.saveGate
    if (this.saveFailure !== undefined) throw this.saveFailure
  }

  async readCandidates(projectId: ProjectId): Promise<readonly unknown[]> {
    this.readProjectIds.push(projectId)
    if (this.readFailure !== undefined) throw this.readFailure
    return this.candidates
  }
}

function createDeferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })

  return { promise, resolve }
}

function cloneMutable(value: unknown): MutableDataObject {
  return JSON.parse(JSON.stringify(value)) as MutableDataObject
}

function requireDataObject(value: unknown): MutableDataObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a test data object')
  }

  return value as MutableDataObject
}

function getEntity(
  input: MutableDataObject,
  tableName: string,
  entityId: string,
): MutableDataObject {
  return requireDataObject(requireDataObject(input[tableName])[entityId])
}

function captureThrown(operation: () => unknown): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }

  throw new Error('Expected operation to throw')
}

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }

  throw new Error('Expected operation to reject')
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return

  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeeplyFrozen(child)
}

function addCheckpointTestNote(session: ProjectSession, sourceId: MidiSourceId) {
  const noteId = parseNoteId('note-checkpoint-added')
  const result = session.execute(
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
  )

  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected checkpoint test Note to commit')
  }

  return noteId
}

describe('Project Checkpoint value protocol', () => {
  it('creates and exports a deeply frozen envelope for one Snapshot revision', () => {
    const { fixture, session } = createFixtureProjectSession()
    const checkpointId = parseProjectCheckpointId('__proto__')
    const snapshot = session.getSnapshot()
    const checkpoint = createProjectCheckpoint(snapshot, { checkpointId })

    expect(PROJECT_CHECKPOINT_FORMAT_VERSION).toBe(1)
    expect(projectCore.createProjectCheckpoint).toBe(createProjectCheckpoint)
    expectTypeOf(checkpoint).toEqualTypeOf<ProjectCheckpoint>()
    expect(checkpoint).toMatchObject({
      checkpointFormatVersion: 1,
      checkpointId,
      projectId: fixture.records.project.id,
      sourceModelRevision: snapshot.modelRevision,
      projectFile: { projectId: fixture.records.project.id },
    })
    expectDeeplyFrozen(checkpoint)
    expect('createProjectSessionFromDecodedProjectFile' in projectCore).toBe(false)
  })

  it('decodes into detached owned containers and rejects invalid checkpoint IDs at the factory', () => {
    const { session } = createFixtureProjectSession()
    const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId('checkpoint-decode'),
    })
    const input = cloneMutable(checkpoint)
    const decoded = decodeProjectCheckpoint(input)
    const inputProjectFile = requireDataObject(input.projectFile)

    inputProjectFile.name = 'Changed after decode'
    input.sourceModelRevision = 99

    expect(decoded).toEqual(checkpoint)
    expect(decoded).not.toBe(input)
    expect(decoded.projectFile).not.toBe(inputProjectFile)
    expect(decoded.projectFile.name).toBe(checkpoint.projectFile.name)
    expect(decoded.sourceModelRevision).toBe(0)
    expectDeeplyFrozen(decoded)
    expect(() => parseProjectCheckpointId(' padded ')).toThrow(DomainValueError)
  })

  it('strictly validates fields, passive properties, versions, revisions, IDs, and nested files', () => {
    const { session } = createFixtureProjectSession()
    const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId('checkpoint-invalid-inputs'),
    })
    const missing = cloneMutable(checkpoint)
    delete missing.checkpointId
    const unexpected = cloneMutable(checkpoint)
    unexpected.futureField = true
    const unsupportedVersion = cloneMutable(checkpoint)
    unsupportedVersion.checkpointFormatVersion = 2
    const invalidCheckpointId = cloneMutable(checkpoint)
    invalidCheckpointId.checkpointId = ''
    const invalidProjectId = cloneMutable(checkpoint)
    invalidProjectId.projectId = ''
    const invalidRevision = cloneMutable(checkpoint)
    invalidRevision.sourceModelRevision = -1
    const mismatchedProject = cloneMutable(checkpoint)
    mismatchedProject.projectId = 'different-project'
    const invalidProjectFile = cloneMutable(checkpoint)
    delete requireDataObject(invalidProjectFile.projectFile).name
    const accessor = cloneMutable(checkpoint)
    let accessorReadCount = 0
    Object.defineProperty(accessor, 'checkpointId', {
      configurable: true,
      enumerable: true,
      get() {
        accessorReadCount += 1
        return 'checkpoint-accessor'
      },
    })

    const failures = [
      missing,
      unexpected,
      unsupportedVersion,
      invalidCheckpointId,
      invalidProjectId,
      invalidRevision,
      mismatchedProject,
      invalidProjectFile,
      accessor,
    ].map((input) => captureThrown(() => decodeProjectCheckpoint(input)))

    expect(failures).toEqual([
      expect.objectContaining({ code: 'missing-property', path: ['checkpointId'] }),
      expect.objectContaining({ code: 'unexpected-property', path: ['futureField'] }),
      expect.objectContaining({
        code: 'unsupported-checkpoint-format-version',
        path: ['checkpointFormatVersion'],
      }),
      expect.objectContaining({ code: 'invalid-checkpoint-id', path: ['checkpointId'] }),
      expect.objectContaining({ code: 'invalid-project-id', path: ['projectId'] }),
      expect.objectContaining({
        code: 'invalid-source-model-revision',
        path: ['sourceModelRevision'],
      }),
      expect.objectContaining({
        code: 'project-id-mismatch',
        path: ['projectFile', 'projectId'],
      }),
      expect.objectContaining({ code: 'invalid-project-file', path: ['projectFile', 'name'] }),
      expect.objectContaining({ code: 'invalid-object-property', path: ['checkpointId'] }),
    ])
    expect(failures.every((error) => error instanceof ProjectCheckpointValidationError)).toBe(true)
    expect(accessorReadCount).toBe(0)
  })
})

describe('Project Checkpoint coordination', () => {
  it('captures once and returns the saved source revision even if editing continues', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const store = new TestProjectCheckpointStore()
    const deferred = createDeferred()
    let snapshotCallCount = 0
    const countingSession = new Proxy(session, {
      get(target, property) {
        if (property === 'getSnapshot') {
          return () => {
            snapshotCallCount += 1
            return target.getSnapshot()
          }
        }

        return Reflect.get(target, property, target)
      },
    })
    store.saveGate = deferred.promise
    const sourceContentStateId = session.contentStateId

    const saving = saveProjectCheckpoint(store, countingSession, {
      checkpointId: parseProjectCheckpointId('checkpoint-stale-completion'),
    })

    addCheckpointTestNote(session, fixture.records.nonLoopSource.id)
    deferred.resolve()
    const receipt = await saving

    expect(snapshotCallCount).toBe(1)
    expect(store.saved).toHaveLength(1)
    expect(receipt).toEqual({
      checkpointId: 'checkpoint-stale-completion',
      projectId: fixture.records.project.id,
      sourceModelRevision: 0,
      sourceContentStateId,
    })
    expect(Object.isFrozen(receipt)).toBe(true)
    expect(typeof receipt.sourceContentStateId).toBe('symbol')
    expect(store.saved[0]?.sourceModelRevision).toBe(0)
    expect('sourceContentStateId' in store.saved[0]!).toBe(false)
    expect('contentStateId' in session.getSnapshot()).toBe(false)
    expect(session.modelRevision).toBe(1)
    expect(session.modelRevision).not.toBe(receipt.sourceModelRevision)
    expect(session.contentStateId).not.toBe(receipt.sourceContentStateId)
  })

  it('wraps store write and read failures without changing the Session', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const writeStore = new TestProjectCheckpointStore()
    const readStore = new TestProjectCheckpointStore()
    const writeCause = new Error('write failed')
    const readCause = new Error('read failed')
    writeStore.saveFailure = writeCause
    readStore.readFailure = readCause

    const writeFailure = await captureRejection(
      saveProjectCheckpoint(writeStore, session, {
        checkpointId: parseProjectCheckpointId('checkpoint-write-failure'),
      }),
    )
    const readFailure = await captureRejection(
      restoreProjectCheckpoint(readStore, fixture.records.project.id),
    )

    expect(writeFailure).toMatchObject({
      code: 'store-write-failed',
      failureCause: writeCause,
    })
    expect(readFailure).toMatchObject({ code: 'store-read-failed', failureCause: readCause })
    expect(writeFailure).toBeInstanceOf(ProjectCheckpointOperationError)
    expect(readFailure).toBeInstanceOf(ProjectCheckpointOperationError)
    expect(session.modelRevision).toBe(0)
    expect(session.canUndo).toBe(false)
  })

  it('restores a valid candidate as a fresh queryable and writable Session', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const noteId = addCheckpointTestNote(session, fixture.records.nonLoopSource.id)
    const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId('checkpoint-valid-active'),
    })
    const store = new TestProjectCheckpointStore()
    store.candidates = [cloneMutable(checkpoint)]

    const restored = await restoreProjectCheckpoint(store, fixture.records.project.id)

    expect(restored).not.toBeNull()
    expect(restored?.checkpoint.sourceModelRevision).toBe(1)
    expect(store.readProjectIds).toEqual([fixture.records.project.id])
    expect(restored?.session.modelRevision).toBe(0)
    expect(restored?.session.contentStateId).not.toBe(session.contentStateId)
    expect(typeof restored?.session.contentStateId).toBe('symbol')
    expect(restored?.session.canUndo).toBe(false)
    expect(restored?.session.canRedo).toBe(false)
    expect(restored?.rejectedCandidates).toEqual([])
    expect(Object.isFrozen(restored?.rejectedCandidates)).toBe(true)
    expect(
      restored?.session.query(
        createMidiNoteByIdQuery({ sourceId: fixture.records.nonLoopSource.id, noteId }),
      ).note,
    ).toMatchObject({ id: noteId, pitch: 72 })

    const nextNoteId = parseNoteId('note-checkpoint-restored-session')
    const execution = restored?.session.execute(
      createAddNoteCommand({
        baseRevision: restored.session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: nextNoteId,
        startTick: parseTick(1_500),
        durationTick: parseTick(120),
        pitch: parseMidiPitch(74),
        velocity: parseMidiVelocity(96),
        channel: parseMidiChannel(0),
      }),
    )

    expect(execution?.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(restored?.session.modelRevision).toBe(1)
  })

  it('falls back across corrupt and wrong-project candidates with ordered diagnostics', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId('checkpoint-previous-valid'),
    })
    const corruptActive = cloneMutable(checkpoint)
    delete requireDataObject(corruptActive.projectFile).name
    const domainInvalid = cloneMutable(checkpoint)
    const domainInvalidFile = requireDataObject(domainInvalid.projectFile)
    const source = getEntity(domainInvalidFile, 'midiSources', 'source-non-loop')
    getEntity(source, 'notes', 'note-non-loop-primary').pitch = 999
    const wrongProject = cloneMutable(checkpoint)
    wrongProject.projectId = 'project-other'
    requireDataObject(wrongProject.projectFile).projectId = 'project-other'
    const store = new TestProjectCheckpointStore()
    store.candidates = [corruptActive, domainInvalid, wrongProject, cloneMutable(checkpoint)]

    const restored = await restoreProjectCheckpoint(store, fixture.records.project.id)
    const failures = restored?.rejectedCandidates ?? []

    expect(restored?.checkpoint.checkpointId).toBe('checkpoint-previous-valid')
    expect(failures).toHaveLength(3)
    expect(failures.map(({ candidateIndex }) => candidateIndex)).toEqual([0, 1, 2])
    expect(failures.map(({ failureCause }) => failureCause)).toEqual([
      expect.objectContaining({ code: 'invalid-project-file' }),
      expect.objectContaining({ code: 'invalid-domain-value' }),
      expect.objectContaining({ code: 'project-id-mismatch', path: ['projectId'] }),
    ])
    expect(Object.isFrozen(failures)).toBe(true)
    expect(failures.every((failure) => Object.isFrozen(failure))).toBe(true)
  })

  it('returns null for no candidates and reports every failure when none are valid', async () => {
    const projectId = parseProjectId('project-checkpoint-missing')
    const emptyStore = new TestProjectCheckpointStore()
    const invalidStore = new TestProjectCheckpointStore()
    invalidStore.candidates = [{}, { checkpointFormatVersion: 99 }]

    const missing = await restoreProjectCheckpoint(emptyStore, projectId)
    const failure = await captureRejection(restoreProjectCheckpoint(invalidStore, projectId))

    expect(missing).toBeNull()
    expect(failure).toBeInstanceOf(ProjectCheckpointOperationError)
    expect(failure).toMatchObject({
      code: 'no-valid-checkpoint',
      candidateFailures: [
        { candidateIndex: 0, failureCause: expect.any(ProjectCheckpointValidationError) },
        { candidateIndex: 1, failureCause: expect.any(ProjectCheckpointValidationError) },
      ],
    })
    expect(
      failure instanceof ProjectCheckpointOperationError &&
        Object.isFrozen(failure.candidateFailures),
    ).toBe(true)
  })
})
