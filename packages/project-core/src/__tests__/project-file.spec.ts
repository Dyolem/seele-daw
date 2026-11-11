import { describe, expect, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_FILE_FORMAT_VERSION,
  ProjectFileError,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createProjectFile,
  createProjectSessionFromProjectFile,
  decodeProjectFile,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type ProjectSession,
} from '#internal/index'
import { DomainValueError } from '#internal/model/domain-value-error'
import { ModelInvariantError } from '#internal/model/invariant-validator'
import golden from './fixtures/project-file.json'
import { editedCopy, REMOVE, setAt } from './support/json-edit'
import { createFixtureProjectSession } from './support/project-session-test-support'

function goldenCopy(): typeof golden {
  return JSON.parse(JSON.stringify(golden))
}

function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

function captureFileError(operation: () => unknown): ProjectFileError {
  let caught: unknown

  try {
    operation()
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(ProjectFileError)
  return caught as ProjectFileError
}

function addNote(session: ProjectSession, sourceId: string, noteId: string) {
  return session.execute(
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId: parseMidiSourceId(sourceId),
      noteId: parseNoteId(noteId),
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
  )
}

describe('writing a project file', () => {
  it('writes the complete project exactly as the golden file', () => {
    const { session } = createFixtureProjectSession()

    expect(PROJECT_FILE_FORMAT_VERSION).toBe(4)
    expect(asJson(createProjectFile(session.getSnapshot()))).toEqual(golden)
  })

  it('is the Snapshot without its revision, sharing every table', () => {
    const { session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const { modelRevision, ...tables } = snapshot
    const file = createProjectFile(snapshot)

    expect(modelRevision).toBe(0)
    expect(file).toEqual({ formatVersion: PROJECT_FILE_FORMAT_VERSION, ...tables })
    expect(file.tracks).toBe(snapshot.tracks)
    expect(file.midiNotes).toBe(snapshot.midiNotes)
    expect(Object.isFrozen(file)).toBe(true)
  })

  it('stays as written while the Session keeps changing', () => {
    const { session } = createFixtureProjectSession()
    const file = createProjectFile(session.getSnapshot())
    const written = JSON.stringify(file)

    addNote(session, 'source-verse', 'note-written-later')

    expect(JSON.stringify(file)).toBe(written)
  })
})

describe('loading a project file', () => {
  it('loads into a fresh Session that writes the same file back', () => {
    const session = createProjectSessionFromProjectFile(goldenCopy())

    expect(session.modelRevision).toBe(0)
    expect(session.canUndo).toBe(false)
    expect(asJson(createProjectFile(session.getSnapshot()))).toEqual(golden)
  })

  it('loads a Session that queries and accepts Commands', () => {
    const session = createProjectSessionFromProjectFile(goldenCopy())
    const result = addNote(session, 'source-verse', 'note-after-load')

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(
      session.query(
        createMidiNoteByIdQuery({
          sourceId: parseMidiSourceId('source-verse'),
          noteId: parseNoteId('note-after-load'),
        }),
      ).note,
    ).toMatchObject({ pitch: 72 })
  })

  it('keeps IDs and Device parameters named __proto__ as ordinary data', () => {
    const data: typeof golden = JSON.parse(
      JSON.stringify(golden)
        .replaceAll('"source-verse"', '"__proto__"')
        .replace('"parameters":{}', '"parameters":{"__proto__":{"nested":[1,true,null]}}'),
    )
    const file = createProjectFile(createProjectSessionFromProjectFile(data).getSnapshot())
    const parameters = file.devices[0]?.parameters

    expect(file.midiSources.map(({ id }) => id)).toEqual(['__proto__', 'source-chorus'])
    expect(Object.getPrototypeOf(file.midiNotes)).toBeNull()
    expect(asJson(file.midiNotes)).toEqual(data.midiNotes)
    expect(Object.getPrototypeOf(parameters)).toBe(Object.prototype)
    expect(asJson(parameters)).toEqual(data.devices[0]?.parameters)
  })

  it('copies its input, so later edits to the input change nothing', () => {
    const data = goldenCopy()
    const file = decodeProjectFile(data)

    data.project.name = 'Edited after decoding'
    data.midiNotes['source-chorus'].pop()

    expect(file.project.name).toBe('Complete Project Fixture')
    expect(file.midiNotes[parseMidiSourceId('source-chorus')]).toHaveLength(2)
  })
})

describe('rejecting a project file', () => {
  it.each<[string, (string | number)[], unknown, string, (string | number)[]]>([
    [
      'another format version',
      ['formatVersion'],
      3,
      `Expected project file format ${PROJECT_FILE_FORMAT_VERSION}, found 3`,
      ['formatVersion'],
    ],
    ['a missing table', ['clips'], REMOVE, 'Missing field clips', ['clips']],
    [
      'an unknown top-level field',
      ['requiredFeatures'],
      [],
      'Unexpected field requiredFeatures',
      ['requiredFeatures'],
    ],
    ['a record table that is not an array', ['clips'], {}, 'Expected an array', ['clips']],
    ['partitions that are not an object', ['midiNotes'], [], 'Expected an object', ['midiNotes']],
    [
      'a record without one of its fields',
      ['tracks', 0, 'name'],
      REMOVE,
      'Missing field name',
      ['tracks', 0, 'name'],
    ],
    [
      'a record with an unknown field',
      ['midiNotes', 'source-chorus', 0, 'gate'],
      1,
      'Unexpected field gate',
      ['midiNotes', 'source-chorus', 0, 'gate'],
    ],
    [
      'a Channel that is not an object',
      ['tracks', 1, 'channel'],
      null,
      'Expected an object',
      ['tracks', 1, 'channel'],
    ],
    [
      'a value its record does not allow',
      ['midiNotes', 'source-chorus', 0, 'pitch'],
      128,
      'Invalid ',
      ['midiNotes', 'source-chorus', 0],
    ],
    ['an invalid Track order ID', ['trackOrder', 0], '', 'Invalid ', ['trackOrder', 0]],
  ])('rejects %s', (_, editPath, replacement, detail, path) => {
    const error = captureFileError(() =>
      decodeProjectFile(editedCopy(golden, editPath, replacement)),
    )

    expect(error.message.startsWith(detail)).toBe(true)
    expect(error.message.endsWith(` at ${JSON.stringify(path)}`)).toBe(true)
  })

  it('rejects a value that is not an object, and a MIDI Source key that is not an ID', () => {
    const data = goldenCopy()
    Object.defineProperty(data.midiNotes, ' source-chorus', {
      enumerable: true,
      value: data.midiNotes['source-chorus'],
    })
    setAt(data, ['midiNotes', 'source-chorus'], REMOVE)

    expect(captureFileError(() => decodeProjectFile('project')).message).toBe(
      'Expected an object at []',
    )
    expect(captureFileError(() => decodeProjectFile(data)).message).toMatch(
      /^Invalid .+ at \["midiNotes"," source-chorus"\]$/,
    )
  })

  it('reports the record factory that rejected a value as the cause', () => {
    const error = captureFileError(() =>
      decodeProjectFile(editedCopy(golden, ['tempoEvents', 1, 'bpm'], 0)),
    )

    expect(error.cause).toBeInstanceOf(DomainValueError)
    expect(error.message).toContain('TempoBpm')
  })

  it('rejects input that is not plain JSON data, without running its code', () => {
    let getterCalls = 0
    const withGetter = goldenCopy()
    Object.defineProperty(withGetter.project, 'name', {
      enumerable: true,
      get: () => {
        getterCalls += 1
        return 'Getter'
      },
    })
    const cyclic = goldenCopy()
    setAt(cyclic, ['master', 'self'], cyclic)
    const inputs: unknown[] = [withGetter, cyclic]

    for (const value of [new Map(), new Date(0), Number.NaN]) {
      inputs.push(editedCopy(golden, ['project', 'name'], value))
    }

    for (const input of inputs) {
      expect(captureFileError(() => decodeProjectFile(input)).message).toBe(
        'Expected plain JSON data at []',
      )
    }
    expect(getterCalls).toBe(0)
  })

  it('rejects duplicate IDs when loading', () => {
    const duplicateNote = goldenCopy()
    duplicateNote.midiNotes['source-chorus'].push(duplicateNote.midiNotes['source-chorus'][0]!)
    const duplicateTrack = goldenCopy()
    duplicateTrack.tracks.push(duplicateTrack.tracks[0]!)

    expect(
      captureFileError(() => createProjectSessionFromProjectFile(duplicateNote)).message,
    ).toMatch(/^Duplicate ID .+ at \["midiNotes","source-chorus",2\]$/)
    expect(
      captureFileError(() => createProjectSessionFromProjectFile(duplicateTrack)).message,
    ).toMatch(/^Duplicate ID .+ at \["tracks",2\]$/)
  })

  it('rejects records that do not form a valid project', () => {
    const inputs = [
      editedCopy(golden, ['clips', 0, 'trackId'], 'track-missing'),
      editedCopy(golden, ['midiSustainPedalEvents', 'source-chorus'], REMOVE),
    ]

    for (const input of inputs) {
      const error = captureFileError(() => createProjectSessionFromProjectFile(input))

      expect(error.message).toBe('The file does not form a valid project at []')
      expect(error.cause).toBeInstanceOf(ModelInvariantError)
    }
  })
})

describe('project file boundary', () => {
  it('exports reading and writing, not the decoders behind them', () => {
    for (const name of ['readProjectFile', 'createSessionFromProjectFile', 'RECORD_DECODERS']) {
      expect(projectCore).not.toHaveProperty(name)
    }
  })
})
