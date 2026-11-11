import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROJECT_CHECKPOINT_FORMAT_VERSION,
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectFileError,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createProjectCheckpoint,
  createProjectFile,
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
import { editedCopy, REMOVE, setAt } from './support/json-edit'
import { createFixtureProjectSession } from './support/project-session-test-support'

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

function storedCopy(checkpoint: ProjectCheckpoint): unknown {
  return JSON.parse(JSON.stringify(checkpoint))
}

function createTestCheckpoint(checkpointId = 'checkpoint-test') {
  const { fixture, session } = createFixtureProjectSession()
  const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
    checkpointId: parseProjectCheckpointId(checkpointId),
  })

  return { fixture, session, checkpoint }
}

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }

  throw new Error('Expected operation to reject')
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

describe('Project Checkpoint values', () => {
  it('wraps the file of one Snapshot revision in a frozen envelope', () => {
    const { fixture, session } = createFixtureProjectSession()
    const checkpointId = parseProjectCheckpointId('__proto__')
    const snapshot = session.getSnapshot()
    const checkpoint = createProjectCheckpoint(snapshot, { checkpointId })

    expect(PROJECT_CHECKPOINT_FORMAT_VERSION).toBe(1)
    expectTypeOf(checkpoint).toEqualTypeOf<ProjectCheckpoint>()
    expect(checkpoint).toEqual({
      checkpointFormatVersion: 1,
      checkpointId,
      projectId: fixture.records.project.id,
      sourceModelRevision: snapshot.modelRevision,
      projectFile: createProjectFile(snapshot),
    })
    expect(Object.isFrozen(checkpoint)).toBe(true)
  })

  it('decodes a stored copy into an equal Checkpoint that no longer depends on it', () => {
    const { checkpoint } = createTestCheckpoint()
    const input = storedCopy(checkpoint)
    const decoded = decodeProjectCheckpoint(input)

    setAt(input, ['sourceModelRevision'], 99)
    setAt(input, ['projectFile', 'project', 'name'], 'Changed after decoding')

    expect(decoded).toEqual(checkpoint)
    expect(Object.isFrozen(decoded)).toBe(true)
  })

  it.each<[string, (string | number)[], unknown, string]>([
    ['a missing field', ['checkpointId'], REMOVE, 'Missing field checkpointId at ["checkpointId"]'],
    ['an unknown field', ['futureField'], true, 'Unexpected field futureField at ["futureField"]'],
    [
      'another format version',
      ['checkpointFormatVersion'],
      2,
      `Expected Checkpoint format ${PROJECT_CHECKPOINT_FORMAT_VERSION}, found 2 at ["checkpointFormatVersion"]`,
    ],
    ['an invalid Checkpoint ID', ['checkpointId'], '', ' at ["checkpointId"]'],
    ['an invalid Project ID', ['projectId'], '', ' at ["projectId"]'],
    [
      'a negative revision',
      ['sourceModelRevision'],
      -1,
      'Invalid ModelRevision: expected a non-negative safe integer at ["sourceModelRevision"]',
    ],
    [
      'a file of another project',
      ['projectId'],
      'project-other',
      'not project-other at ["projectFile","project","id"]',
    ],
    [
      'an invalid file',
      ['projectFile', 'project', 'name'],
      REMOVE,
      'Missing field name at ["projectFile","project","name"]',
    ],
  ])('rejects %s', (_, editPath, replacement, message) => {
    const { checkpoint } = createTestCheckpoint()
    const input = editedCopy(checkpoint, editPath, replacement)

    expect(() => decodeProjectCheckpoint(input)).toThrowError(
      expect.objectContaining({
        name: 'ProjectFileError',
        message: expect.stringContaining(message),
      }),
    )
  })

  it('rejects an accessor without calling it', () => {
    const { checkpoint } = createTestCheckpoint()
    const input = storedCopy(checkpoint) as object
    let getterCalls = 0
    Object.defineProperty(input, 'checkpointId', {
      enumerable: true,
      get: () => {
        getterCalls += 1
        return 'checkpoint-accessor'
      },
    })

    expect(() => decodeProjectCheckpoint(input)).toThrowError(
      expect.objectContaining({
        name: 'ProjectFileError',
        message: 'Expected plain JSON data at []',
      }),
    )
    expect(getterCalls).toBe(0)
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

    addCheckpointTestNote(session, fixture.records.verseSource.id)
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
    expect(store.saved[0]?.sourceModelRevision).toBe(0)
    expect('sourceContentStateId' in store.saved[0]!).toBe(false)
    expect(session.modelRevision).toBe(1)
    expect(session.contentStateId).not.toBe(receipt.sourceContentStateId)
  })

  it('passes store write and read failures through without changing the Session', async () => {
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

    expect(writeFailure).toBe(writeCause)
    expect(readFailure).toBe(readCause)
    expect(session.modelRevision).toBe(0)
    expect(session.canUndo).toBe(false)
  })

  it('restores a valid candidate as a fresh queryable and writable Session', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const noteId = addCheckpointTestNote(session, fixture.records.verseSource.id)
    const checkpoint = createProjectCheckpoint(session.getSnapshot(), {
      checkpointId: parseProjectCheckpointId('checkpoint-valid-active'),
    })
    const store = new TestProjectCheckpointStore()
    store.candidates = [storedCopy(checkpoint)]

    const restored = await restoreProjectCheckpoint(store, fixture.records.project.id)

    expect(restored?.checkpoint.sourceModelRevision).toBe(1)
    expect(store.readProjectIds).toEqual([fixture.records.project.id])
    expect(restored?.session.modelRevision).toBe(0)
    expect(restored?.session.contentStateId).not.toBe(session.contentStateId)
    expect(restored?.session.canUndo).toBe(false)
    expect(restored?.rejectedCandidates).toEqual([])
    expect(
      restored?.session.query(
        createMidiNoteByIdQuery({ sourceId: fixture.records.verseSource.id, noteId }),
      ).note,
    ).toMatchObject({ id: noteId, pitch: 72 })

    const execution = restored?.session.execute(
      createAddNoteCommand({
        baseRevision: restored.session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteId: parseNoteId('note-checkpoint-restored-session'),
        startTick: parseTick(1_500),
        durationTick: parseTick(120),
        pitch: parseMidiPitch(74),
        velocity: parseMidiVelocity(96),
        channel: parseMidiChannel(0),
      }),
    )

    expect(execution?.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
  })

  it('falls back across corrupt and wrong-project candidates with ordered diagnostics', async () => {
    const { fixture, checkpoint } = createTestCheckpoint('checkpoint-previous-valid')
    const corruptActive = editedCopy(checkpoint, ['projectFile', 'project', 'name'], REMOVE)
    const invalidValue = editedCopy(
      checkpoint,
      ['projectFile', 'midiNotes', 'source-verse', 0, 'pitch'],
      999,
    )
    const wrongProject = editedCopy(checkpoint, ['projectId'], 'project-other')
    setAt(wrongProject, ['projectFile', 'project', 'id'], 'project-other')
    const store = new TestProjectCheckpointStore()
    store.candidates = [corruptActive, invalidValue, wrongProject, storedCopy(checkpoint)]

    const restored = await restoreProjectCheckpoint(store, fixture.records.project.id)
    const failures = restored?.rejectedCandidates ?? []

    expect(restored?.checkpoint.checkpointId).toBe('checkpoint-previous-valid')
    expect(failures.map(({ candidateIndex }) => candidateIndex)).toEqual([0, 1, 2])
    expect(failures.map(({ failureCause }) => failureCause)).toEqual([
      expect.objectContaining({
        message: 'Missing field name at ["projectFile","project","name"]',
      }),
      expect.objectContaining({
        message: expect.stringContaining('at ["projectFile","midiNotes","source-verse",0]'),
      }),
      expect.objectContaining({
        message: expect.stringContaining('belongs to project project-other'),
      }),
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
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure).toMatchObject({
      message: `No stored Checkpoint could restore ${projectId}`,
      errors: [expect.any(ProjectFileError), expect.any(ProjectFileError)],
    })
  })
})
