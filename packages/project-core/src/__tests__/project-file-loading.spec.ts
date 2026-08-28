import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectFileLoadError,
  ProjectFileValidationError,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createProjectFileDTO,
  createProjectSessionFromProjectFile,
  decodeProjectFileDTO,
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
import projectFileV1Golden from './fixtures/project-files/v1/complete-project.json'
import projectFileV2Golden from './fixtures/project-files/v2/complete-project.json'

type MutableDataObject = Record<string, unknown>

function createMutableGolden(): MutableDataObject {
  return JSON.parse(JSON.stringify(projectFileV1Golden)) as MutableDataObject
}

function createMutableV2Golden(): MutableDataObject {
  return JSON.parse(JSON.stringify(projectFileV2Golden)) as MutableDataObject
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

function captureLoadFailure(input: unknown): unknown {
  try {
    createProjectSessionFromProjectFile(input)
  } catch (error) {
    return error
  }

  throw new Error('Expected project-file loading to fail')
}

describe('Project File V1 Session loading', () => {
  it('loads the static golden into a fresh queryable Session and round-trips it losslessly', () => {
    const session = createProjectSessionFromProjectFile(projectFileV1Golden as unknown)
    const sourceId = parseMidiSourceId('source-non-loop')
    const noteId = parseNoteId('note-non-loop-primary')
    const result = session.query(createMidiNoteByIdQuery({ sourceId, noteId }))

    expect(projectCore.createProjectSessionFromProjectFile).toBe(
      createProjectSessionFromProjectFile,
    )
    expectTypeOf(session).toEqualTypeOf<ProjectSession>()
    expect(session.modelRevision).toBe(0)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(false)
    expect(result).toMatchObject({ modelRevision: 0, note: { id: noteId, pitch: 60 } })
    expect(createProjectFileDTO(session.getSnapshot())).toEqual(
      decodeProjectFileDTO(projectFileV1Golden as unknown),
    )
    expect('normalizeProjectFileDTO' in projectCore).toBe(false)
    expect('ModelStore' in projectCore).toBe(false)
  })

  it('owns loaded state independently and can execute Commands from the fresh revision', () => {
    const input = createMutableGolden()
    const session = createProjectSessionFromProjectFile(input)
    const sourceId = parseMidiSourceId('source-non-loop')
    const existingNoteId = parseNoteId('note-non-loop-primary')
    const addedNoteId = parseNoteId('note-loaded-session-added')
    const inputSource = getEntity(input, 'midiSources', sourceId)
    const inputNote = getEntity(requireDataObject(inputSource), 'notes', existingNoteId)

    inputNote.pitch = 1
    inputSource.lengthTick = 1
    input.trackOrder = []

    expect(
      session.query(createMidiNoteByIdQuery({ sourceId, noteId: existingNoteId })).note?.pitch,
    ).toBe(60)
    expect(session.getSnapshot().trackOrder).toEqual(['track-instrument', 'track-audio'])

    const execution = session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId: addedNoteId,
        startTick: parseTick(1_200),
        durationTick: parseTick(240),
        pitch: parseMidiPitch(72),
        velocity: parseMidiVelocity(100),
        channel: parseMidiChannel(0),
      }),
    )

    expect(execution.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(session.modelRevision).toBe(1)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
    expect(
      session.query(createMidiNoteByIdQuery({ sourceId, noteId: addedNoteId })).note,
    ).toMatchObject({ id: addedNoteId, pitch: 72 })
  })

  it('preserves structural decoder failures instead of relabeling them as load errors', () => {
    const input = createMutableGolden()
    delete input.name

    expect(() => createProjectSessionFromProjectFile(input)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'missing-property',
        path: ['name'],
      }),
    )
  })

  it('reports structurally valid domain failures at their stable V1 paths', () => {
    const emptyProjectId = createMutableGolden()
    emptyProjectId.projectId = ''

    const invalidTrackColor = createMutableGolden()
    getEntity(invalidTrackColor, 'tracks', 'track-instrument').color = 'red'

    const invalidPitch = createMutableGolden()
    const source = getEntity(invalidPitch, 'midiSources', 'source-non-loop')
    getEntity(source, 'notes', 'note-non-loop-primary').pitch = 999

    const invalidGain = createMutableGolden()
    requireDataObject(invalidGain.master).gain = 5

    const failures = [emptyProjectId, invalidTrackColor, invalidPitch, invalidGain].map(
      captureLoadFailure,
    ) as ProjectFileLoadError[]

    expect(failures).toEqual([
      expect.objectContaining({
        code: 'invalid-domain-value',
        path: ['projectId'],
        failureCause: expect.any(DomainValueError),
      }),
      expect.objectContaining({
        code: 'invalid-domain-value',
        path: ['tracks', 'track-instrument', 'color'],
        failureCause: expect.any(DomainValueError),
      }),
      expect.objectContaining({
        code: 'invalid-domain-value',
        path: ['midiSources', 'source-non-loop', 'notes', 'note-non-loop-primary', 'pitch'],
        failureCause: expect.any(DomainValueError),
      }),
      expect.objectContaining({
        code: 'invalid-domain-value',
        path: ['master', 'gain'],
        failureCause: expect.any(DomainValueError),
      }),
    ])
    expect(failures.every((error) => error instanceof ProjectFileLoadError)).toBe(true)
    expect(failures.every((error) => Object.isFrozen(error.path))).toBe(true)
  })

  it('rejects complete models with invalid cross-entity relationships', () => {
    const missingTrackOrder = createMutableGolden()
    missingTrackOrder.trackOrder = []

    const danglingClipTrack = createMutableGolden()
    getEntity(danglingClipTrack, 'clips', 'clip-non-loop').trackId = 'track-missing'

    const noteOutsideSource = createMutableGolden()
    const source = getEntity(noteOutsideSource, 'midiSources', 'source-non-loop')
    getEntity(source, 'notes', 'note-non-loop-primary').startTick = 1_800

    const missingInitialTempo = createMutableGolden()
    delete requireDataObject(missingInitialTempo.tempoEvents)['tempo-initial']

    const failures = [
      missingTrackOrder,
      danglingClipTrack,
      noteOutsideSource,
      missingInitialTempo,
    ].map(captureLoadFailure) as ProjectFileLoadError[]
    const violationCodes = failures.map((error) =>
      error.failureCause instanceof ModelInvariantError
        ? error.failureCause.violations.map(({ code }) => code)
        : [],
    )

    expect(failures).toEqual(
      Array.from({ length: 4 }, () =>
        expect.objectContaining({
          code: 'model-invariants-violated',
          path: [],
          failureCause: expect.any(ModelInvariantError),
        }),
      ),
    )
    expect(violationCodes).toEqual([
      expect.arrayContaining(['track-missing-from-order']),
      expect.arrayContaining(['clip-missing-track']),
      expect.arrayContaining(['note-outside-midi-source']),
      expect.arrayContaining(['tempo-initial-event-count']),
    ])
  })

  it('loads opaque __proto__ IDs and JsonObject keys without prototype semantics', () => {
    const input = createMutableGolden()
    const source = getEntity(input, 'midiSources', 'source-non-loop')
    const notes = requireDataObject(source.notes)
    const existing = getEntity(source, 'notes', 'note-non-loop-primary')
    const parameters = requireDataObject(
      getEntity(input, 'devices', 'device-instrument').parameters,
    )

    Object.defineProperty(notes, '__proto__', {
      configurable: true,
      enumerable: true,
      value: { ...existing, id: '__proto__', startTick: 1_200, durationTick: 240 },
      writable: true,
    })
    Object.defineProperty(parameters, '__proto__', {
      configurable: true,
      enumerable: true,
      value: { constructor: true },
      writable: true,
    })

    const session = createProjectSessionFromProjectFile(input)
    const specialNote = session.query(
      createMidiNoteByIdQuery({
        sourceId: parseMidiSourceId('source-non-loop'),
        noteId: parseNoteId('__proto__'),
      }),
    ).note
    const projected = createProjectFileDTO(session.getSnapshot())
    const projectedParameters = projected.devices['device-instrument']!.parameters

    expect(specialNote?.id).toBe('__proto__')
    expect(Object.hasOwn(projected.midiSources['source-non-loop']!.notes, '__proto__')).toBe(true)
    expect(Object.hasOwn(projectedParameters, '__proto__')).toBe(true)
    expect(projectedParameters.__proto__).toEqual({ constructor: true })
  })
})

describe('Project File V2 Sustain Pedal Event loading', () => {
  it('loads raw CC64 facts into Source-owned Snapshot partitions', () => {
    const session = createProjectSessionFromProjectFile(projectFileV2Golden as unknown)
    const sourceId = parseMidiSourceId('source-non-loop')
    const partition = session
      .getSnapshot()
      .midiSustainPedalEventPartitions.find((candidate) => candidate.sourceId === sourceId)

    expect(partition?.events).toEqual([
      {
        id: 'sustain-non-loop-down',
        tick: 360,
        value: 127,
        channel: 0,
      },
      {
        id: 'sustain-non-loop-up',
        tick: 900,
        value: 0,
        channel: 0,
      },
    ])
    expect(createProjectFileDTO(session.getSnapshot())).toEqual(projectFileV2Golden)
  })

  it('reports invalid raw values at the V2 Event path', () => {
    const input = createMutableV2Golden()
    const source = getEntity(input, 'midiSources', 'source-non-loop')
    getEntity(source, 'sustainPedalEvents', 'sustain-non-loop-down').value = 128

    expect(captureLoadFailure(input)).toMatchObject({
      code: 'invalid-domain-value',
      path: [
        'midiSources',
        'source-non-loop',
        'sustainPedalEvents',
        'sustain-non-loop-down',
        'value',
      ],
      failureCause: expect.any(DomainValueError),
    })
  })

  it('rejects out-of-range, duplicate-ID, and duplicate-position Event graphs', () => {
    const outside = createMutableV2Golden()
    const outsideSource = getEntity(outside, 'midiSources', 'source-non-loop')
    getEntity(outsideSource, 'sustainPedalEvents', 'sustain-non-loop-down').tick = 1_921

    const duplicateId = createMutableV2Golden()
    const duplicateIdSources = requireDataObject(duplicateId.midiSources)
    const duplicateIdLooping = getEntity(duplicateId, 'midiSources', 'source-looping')
    const duplicateIdEvents = requireDataObject(duplicateIdLooping.sustainPedalEvents)
    const nonLoopSource = requireDataObject(duplicateIdSources['source-non-loop'])
    const nonLoopEvents = requireDataObject(nonLoopSource.sustainPedalEvents)
    duplicateIdEvents['sustain-non-loop-down'] = {
      ...requireDataObject(nonLoopEvents['sustain-non-loop-down']),
      tick: 1_200,
      channel: 1,
    }

    const duplicatePosition = createMutableV2Golden()
    const duplicatePositionSource = getEntity(duplicatePosition, 'midiSources', 'source-non-loop')
    const duplicatePositionEvents = requireDataObject(duplicatePositionSource.sustainPedalEvents)
    duplicatePositionEvents['sustain-duplicate-position'] = {
      id: 'sustain-duplicate-position',
      tick: 360,
      value: 64,
      channel: 0,
    }

    const failures = [outside, duplicateId, duplicatePosition].map(
      captureLoadFailure,
    ) as ProjectFileLoadError[]
    const violationCodes = failures.map((error) =>
      error.failureCause instanceof ModelInvariantError
        ? error.failureCause.violations.map(({ code }) => code)
        : [],
    )

    expect(violationCodes).toEqual([
      expect.arrayContaining(['sustain-pedal-event-outside-midi-source']),
      expect.arrayContaining(['sustain-pedal-event-id-duplicate']),
      expect.arrayContaining(['sustain-pedal-event-duplicate-tick-channel']),
    ])
  })
})
