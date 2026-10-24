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
  type ProjectFilePathSegment,
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

    expect(PROJECT_FILE_FORMAT_VERSION).toBe(3)
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

    addNote(session, 'source-non-loop', 'note-written-later')

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
    const result = addNote(session, 'source-non-loop', 'note-after-load')

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(
      session.query(
        createMidiNoteByIdQuery({
          sourceId: parseMidiSourceId('source-non-loop'),
          noteId: parseNoteId('note-after-load'),
        }),
      ).note,
    ).toMatchObject({ pitch: 72 })
  })

  it('keeps IDs and Device parameters named __proto__ as ordinary data', () => {
    const data: typeof golden = JSON.parse(
      JSON.stringify(golden)
        .replaceAll('"source-non-loop"', '"__proto__"')
        .replace('"parameters":{}', '"parameters":{"__proto__":{"nested":[1,true,null]}}'),
    )
    const file = createProjectFile(createProjectSessionFromProjectFile(data).getSnapshot())
    const parameters = file.devices[0]?.parameters

    expect(file.midiSources.map(({ id }) => id)).toEqual(['__proto__', 'source-looping'])
    expect(Object.getPrototypeOf(file.midiNotes)).toBeNull()
    expect(asJson(file.midiNotes)).toEqual(data.midiNotes)
    expect(Object.getPrototypeOf(parameters)).toBe(Object.prototype)
    expect(asJson(parameters)).toEqual(data.devices[0]?.parameters)
  })

  it('copies its input, so later edits to the input change nothing', () => {
    const data = goldenCopy()
    const file = decodeProjectFile(data)

    data.project.name = 'Edited after decoding'
    data.midiNotes['source-looping'].pop()

    expect(file.project.name).toBe('Complete Project Fixture')
    expect(file.midiNotes[parseMidiSourceId('source-looping')]).toHaveLength(2)
  })
})

describe('rejecting a project file', () => {
  it.each<[string, ProjectFilePathSegment[], unknown, string, ProjectFilePathSegment[]]>([
    [
      'another format version',
      ['formatVersion'],
      2,
      'unsupported-format-version',
      ['formatVersion'],
    ],
    ['a missing table', ['clips'], REMOVE, 'invalid-structure', ['clips']],
    [
      'an unknown top-level field',
      ['requiredFeatures'],
      [],
      'invalid-structure',
      ['requiredFeatures'],
    ],
    ['a record table that is not an array', ['clips'], {}, 'invalid-structure', ['clips']],
    ['partitions that are not an object', ['midiNotes'], [], 'invalid-structure', ['midiNotes']],
    [
      'a record without one of its fields',
      ['tracks', 0, 'name'],
      REMOVE,
      'invalid-structure',
      ['tracks', 0, 'name'],
    ],
    [
      'a record with an unknown field',
      ['midiNotes', 'source-looping', 0, 'gate'],
      1,
      'invalid-structure',
      ['midiNotes', 'source-looping', 0, 'gate'],
    ],
    [
      'an unknown Track kind',
      ['tracks', 0, 'kind'],
      'bus',
      'invalid-structure',
      ['tracks', 0, 'kind'],
    ],
    [
      'a Channel that is not an object',
      ['tracks', 1, 'channel'],
      null,
      'invalid-structure',
      ['tracks', 1, 'channel'],
    ],
    [
      'effect IDs that are not an array',
      ['master', 'audioEffectIds'],
      'device-master-effect',
      'invalid-structure',
      ['master', 'audioEffectIds'],
    ],
    [
      'a loop that is not an object',
      ['clips', 0, 'loop'],
      7,
      'invalid-structure',
      ['clips', 0, 'loop'],
    ],
    [
      'a value its record does not allow',
      ['midiNotes', 'source-looping', 0, 'pitch'],
      128,
      'invalid-value',
      ['midiNotes', 'source-looping', 0],
    ],
    ['an invalid Track order ID', ['trackOrder', 0], '', 'invalid-value', ['trackOrder', 0]],
  ])('rejects %s', (_, editPath, replacement, code, path) => {
    const error = captureFileError(() =>
      decodeProjectFile(editedCopy(golden, editPath, replacement)),
    )

    expect({ code: error.code, path: error.path }).toEqual({ code, path })
  })

  it('rejects a value that is not an object, and a MIDI Source key that is not an ID', () => {
    const data = goldenCopy()
    Object.defineProperty(data.midiNotes, ' source-looping', {
      enumerable: true,
      value: data.midiNotes['source-looping'],
    })
    setAt(data, ['midiNotes', 'source-looping'], REMOVE)

    expect(captureFileError(() => decodeProjectFile('project'))).toMatchObject({
      code: 'invalid-structure',
      path: [],
    })
    expect(captureFileError(() => decodeProjectFile(data))).toMatchObject({
      code: 'invalid-value',
      path: ['midiNotes', ' source-looping'],
    })
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
      expect(captureFileError(() => decodeProjectFile(input)).code).toBe('not-json')
    }
    expect(getterCalls).toBe(0)
  })

  it('rejects duplicate IDs when loading', () => {
    const duplicateNote = goldenCopy()
    duplicateNote.midiNotes['source-looping'].push(duplicateNote.midiNotes['source-looping'][0]!)
    const duplicateTrack = goldenCopy()
    duplicateTrack.tracks.push(duplicateTrack.tracks[0]!)

    expect(
      captureFileError(() => createProjectSessionFromProjectFile(duplicateNote)),
    ).toMatchObject({ code: 'duplicate-id', path: ['midiNotes', 'source-looping', 2] })
    expect(
      captureFileError(() => createProjectSessionFromProjectFile(duplicateTrack)),
    ).toMatchObject({ code: 'duplicate-id', path: ['tracks', 2] })
  })

  it('rejects records that do not form a valid project', () => {
    const inputs = [
      editedCopy(golden, ['clips', 0, 'trackId'], 'track-missing'),
      editedCopy(golden, ['midiSustainPedalEvents', 'source-looping'], REMOVE),
    ]

    for (const input of inputs) {
      const error = captureFileError(() => createProjectSessionFromProjectFile(input))

      expect(error.code).toBe('invalid-model')
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
