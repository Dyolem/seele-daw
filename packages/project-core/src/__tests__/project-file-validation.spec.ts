import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '~/index'
import {
  ProjectFileValidationError,
  createProjectFileDTO,
  decodeProjectFileDTO,
  type JsonValue,
  type ProjectFileDTO,
} from '~/index'
import projectFileV1Golden from './fixtures/project-files/v1/complete-project.json'
import { createFixtureProjectSession } from './support/project-session-test-support'

type MutableDataObject = Record<string, unknown>

function requireDataObject(value: unknown): MutableDataObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a test data object')
  }

  return value as MutableDataObject
}

function requireDataArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected a test data array')
  return value
}

function createMutableProjectFileInput(): {
  readonly input: MutableDataObject
  readonly projected: ProjectFileDTO
} {
  const { session } = createFixtureProjectSession()
  const projected = createProjectFileDTO(session.getSnapshot())
  const parsed: unknown = JSON.parse(JSON.stringify(projected))

  return { input: requireDataObject(parsed), projected }
}

function getEntity(
  input: MutableDataObject,
  tableName: string,
  entityId: string,
): MutableDataObject {
  const table = requireDataObject(input[tableName])
  return requireDataObject(table[entityId])
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return

  expect(Object.isFrozen(value)).toBe(true)

  for (const child of Object.values(value)) expectDeeplyFrozen(child)
}

describe('ProjectFileDTO V1 input decoding', () => {
  it('keeps the executable V1 protocol and current writer aligned with the static golden file', () => {
    const { projected } = createMutableProjectFileInput()
    const decodedGolden = decodeProjectFileDTO(projectFileV1Golden as unknown)

    expect(decodedGolden).toEqual(projectFileV1Golden)
    expect(projected).toEqual(decodedGolden)
    expect(decodedGolden).not.toBe(projectFileV1Golden)
    expectDeeplyFrozen(decodedGolden)
  })

  it('exports a runtime decoder that accepts projector and JSON-decoded values', () => {
    const { input, projected } = createMutableProjectFileInput()
    const direct = decodeProjectFileDTO(projected)
    const decoded = decodeProjectFileDTO(input)

    expect(projectCore.decodeProjectFileDTO).toBe(decodeProjectFileDTO)
    expectTypeOf(decoded).toEqualTypeOf<ProjectFileDTO>()
    expect(direct).toEqual(projected)
    expect(decoded).toEqual(projected)
    expect(decoded).not.toBe(input)
    expectDeeplyFrozen(direct)
    expectDeeplyFrozen(decoded)
    expect('createProjectSessionFromFileDTO' in projectCore).toBe(false)
    expect('migrateProjectFileDTO' in projectCore).toBe(false)
  })

  it('detaches every composite value from mutable input and canonicalizes JsonObject keys', () => {
    const { fixture } = createFixtureProjectSession()
    const { input, projected } = createMutableProjectFileInput()
    const deviceId = fixture.records.instrumentDevice.id
    const sourceId = fixture.records.nonLoopSource.id
    const noteId = fixture.records.nonLoopNote.id
    const inputDevice = getEntity(input, 'devices', deviceId)
    const inputParameters = requireDataObject(inputDevice.parameters)
    const reorderedParameters: MutableDataObject = {}

    for (const key of Object.keys(inputParameters).sort().reverse()) {
      reorderedParameters[key] = inputParameters[key]
    }

    reorderedParameters.zeta = { right: 2, left: 1 }
    reorderedParameters.alpha = [true, null]
    inputDevice.parameters = reorderedParameters

    const decoded = decodeProjectFileDTO(input)
    const decodedNote = decoded.midiSources[sourceId]!.notes[noteId]!
    const decodedParameters = decoded.devices[deviceId]!.parameters

    expect(Object.keys(decodedParameters)).toEqual(Object.keys(decodedParameters).sort())
    expect(Object.keys(requireDataObject(decodedParameters.zeta))).toEqual(['left', 'right'])
    expect(decoded).not.toBe(input)
    expect(decoded.trackOrder).not.toBe(input.trackOrder)
    expect(decoded.devices).not.toBe(input.devices)
    expect(decodedParameters).not.toBe(reorderedParameters)

    input.projectId = 'changed-after-decode'
    requireDataArray(input.trackOrder).length = 0
    getEntity(requireDataObject(getEntity(input, 'midiSources', sourceId)), 'notes', noteId).pitch =
      1
    reorderedParameters.zeta = 'changed-after-decode'

    expect(decoded.projectId).toBe(projected.projectId)
    expect(decoded.trackOrder).toEqual(projected.trackOrder)
    expect(decodedNote.pitch).toBe(fixture.records.nonLoopNote.pitch)
    expect(decodedParameters.zeta).toEqual({ left: 1, right: 2 })
    expectDeeplyFrozen(decoded)
  })

  it('reports deterministic paths for missing and unexpected V1 fields', () => {
    const missing = createMutableProjectFileInput().input
    delete missing.name

    expect(() => decodeProjectFileDTO(missing)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'missing-property',
        path: ['name'],
      }),
    )

    const unexpected = createMutableProjectFileInput().input
    unexpected.futureMetadata = {}

    expect(() => decodeProjectFileDTO(unexpected)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'unexpected-property',
        path: ['futureMetadata'],
      }),
    )
  })

  it('rejects unsupported versions before interpreting version-specific fields', () => {
    const futureInput = { formatVersion: 2, futureRoot: true }

    expect(() => decodeProjectFileDTO(futureInput)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'unsupported-format-version',
        path: ['formatVersion'],
        expected: '1',
        actual: '2',
      }),
    )
  })

  it('rejects duplicate, unknown, and empty required feature IDs independently', () => {
    const duplicate = createMutableProjectFileInput().input
    duplicate.requiredFeatures = ['future.feature', 'future.feature']

    expect(() => decodeProjectFileDTO(duplicate)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'duplicate-required-feature',
        path: ['requiredFeatures', 1],
        featureId: 'future.feature',
      }),
    )

    const unsupported = createMutableProjectFileInput().input
    unsupported.requiredFeatures = ['future.feature']

    expect(() => decodeProjectFileDTO(unsupported)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'unsupported-required-feature',
        path: ['requiredFeatures', 0],
        featureId: 'future.feature',
      }),
    )

    const empty = createMutableProjectFileInput().input
    empty.requiredFeatures = ['']

    expect(() => decodeProjectFileDTO(empty)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-value',
        path: ['requiredFeatures', 0],
      }),
    )
  })

  it('validates scalar JSON shape without taking over later domain range rules', () => {
    const { fixture } = createFixtureProjectSession()
    const fractionalPitch = createMutableProjectFileInput().input
    const sourceId = fixture.records.nonLoopSource.id
    const noteId = fixture.records.nonLoopNote.id
    getEntity(
      requireDataObject(getEntity(fractionalPitch, 'midiSources', sourceId)),
      'notes',
      noteId,
    ).pitch = 60.5

    expect(() => decodeProjectFileDTO(fractionalPitch)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-integer',
        path: ['midiSources', sourceId, 'notes', noteId, 'pitch'],
      }),
    )

    const infiniteGain = createMutableProjectFileInput().input
    requireDataObject(infiniteGain.master).gain = Number.POSITIVE_INFINITY

    expect(() => decodeProjectFileDTO(infiniteGain)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-number',
        path: ['master', 'gain'],
      }),
    )

    const domainInvalidButStructurallyValid = createMutableProjectFileInput().input
    getEntity(
      requireDataObject(getEntity(domainInvalidButStructurallyValid, 'midiSources', sourceId)),
      'notes',
      noteId,
    ).pitch = 999

    expect(() => decodeProjectFileDTO(domainInvalidButStructurallyValid)).not.toThrow()
  })

  it('rejects unsupported discriminators and branch-specific extra fields', () => {
    const { fixture } = createFixtureProjectSession()
    const unsupportedKind = createMutableProjectFileInput().input
    getEntity(unsupportedKind, 'tracks', fixture.records.instrumentTrack.id).kind = 'group'

    expect(() => decodeProjectFileDTO(unsupportedKind)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-literal',
        path: ['tracks', fixture.records.instrumentTrack.id, 'kind'],
      }),
    )

    const wrongBranch = createMutableProjectFileInput().input
    getEntity(wrongBranch, 'tracks', fixture.records.audioTrack.id).midiEffectIds = []

    expect(() => decodeProjectFileDTO(wrongBranch)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'unexpected-property',
        path: ['tracks', fixture.records.audioTrack.id, 'midiEffectIds'],
      }),
    )
  })

  it('rejects entity table keys that do not match their embedded IDs', () => {
    const { fixture } = createFixtureProjectSession()
    const input = createMutableProjectFileInput().input
    const trackId = fixture.records.instrumentTrack.id
    getEntity(input, 'tracks', trackId).id = 'different-track-id'

    expect(() => decodeProjectFileDTO(input)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'entity-key-id-mismatch',
        path: ['tracks', trackId, 'id'],
        tableKey: trackId,
        entityId: 'different-track-id',
      }),
    )
  })

  it('rejects invalid Device JSON, sparse arrays, and cyclic references at exact paths', () => {
    const { fixture } = createFixtureProjectSession()
    const deviceId = fixture.records.instrumentDevice.id
    const invalidParameters = createMutableProjectFileInput().input
    getEntity(invalidParameters, 'devices', deviceId).parameters = []

    expect(() => decodeProjectFileDTO(invalidParameters)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-json-value',
        path: ['devices', deviceId, 'parameters'],
      }),
    )

    const sparseState = createMutableProjectFileInput().input
    const sparse: JsonValue[] = []
    sparse.length = 2
    sparse[1] = true
    getEntity(sparseState, 'devices', deviceId).opaqueState = sparse

    expect(() => decodeProjectFileDTO(sparseState)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-json-value',
        path: ['devices', deviceId, 'opaqueState', 0],
      }),
    )

    const symbolicState = createMutableProjectFileInput().input
    const symbolicObject: MutableDataObject = {}
    Object.defineProperty(symbolicObject, Symbol('not-json'), {
      enumerable: true,
      value: true,
    })
    getEntity(symbolicState, 'devices', deviceId).opaqueState = symbolicObject

    expect(() => decodeProjectFileDTO(symbolicState)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-json-value',
        path: ['devices', deviceId, 'opaqueState'],
      }),
    )

    const cyclicState = createMutableProjectFileInput().input
    const cycle: MutableDataObject = {}
    cycle.self = cycle
    getEntity(cyclicState, 'devices', deviceId).opaqueState = cycle

    expect(() => decodeProjectFileDTO(cyclicState)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'cyclic-value',
        path: ['devices', deviceId, 'opaqueState', 'self'],
      }),
    )
  })

  it('does not invoke accessors while rejecting executable protocol or JsonObject properties', () => {
    const protocolAccessor = createMutableProjectFileInput().input
    let protocolGetterCalled = false
    Object.defineProperty(protocolAccessor, 'name', {
      enumerable: true,
      get() {
        protocolGetterCalled = true
        return 'unsafe'
      },
    })

    expect(() => decodeProjectFileDTO(protocolAccessor)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-object-property',
        path: ['name'],
      }),
    )
    expect(protocolGetterCalled).toBe(false)

    const { fixture } = createFixtureProjectSession()
    const jsonAccessor = createMutableProjectFileInput().input
    const parameters: MutableDataObject = {}
    let jsonGetterCalled = false
    Object.defineProperty(parameters, 'unsafe', {
      enumerable: true,
      get() {
        jsonGetterCalled = true
        return 1
      },
    })
    getEntity(jsonAccessor, 'devices', fixture.records.instrumentDevice.id).parameters = parameters

    expect(() => decodeProjectFileDTO(jsonAccessor)).toThrowError(
      expect.objectContaining<Partial<ProjectFileValidationError>>({
        code: 'invalid-json-value',
        path: ['devices', fixture.records.instrumentDevice.id, 'parameters', 'unsafe'],
      }),
    )
    expect(jsonGetterCalled).toBe(false)
  })

  it('preserves __proto__ entity IDs and JsonObject keys as safe own properties', () => {
    const { fixture } = createFixtureProjectSession()
    const input = createMutableProjectFileInput().input
    const sourceId = fixture.records.nonLoopSource.id
    const source = getEntity(input, 'midiSources', sourceId)
    const notes = requireDataObject(source.notes)
    const existing = requireDataObject(notes[fixture.records.nonLoopNote.id])
    Object.defineProperty(notes, '__proto__', {
      configurable: true,
      enumerable: true,
      value: { ...existing, id: '__proto__' },
      writable: true,
    })

    const device = getEntity(input, 'devices', fixture.records.instrumentDevice.id)
    const parameters = requireDataObject(device.parameters)
    Object.defineProperty(parameters, '__proto__', {
      configurable: true,
      enumerable: true,
      value: { constructor: true },
      writable: true,
    })

    const decoded = decodeProjectFileDTO(input)
    const decodedNotes = decoded.midiSources[sourceId]!.notes
    const decodedParameters = decoded.devices[fixture.records.instrumentDevice.id]!.parameters

    expect(Object.getPrototypeOf(decodedNotes)).toBe(Object.prototype)
    expect(Object.hasOwn(decodedNotes, '__proto__')).toBe(true)
    expect(decodedNotes.__proto__?.id).toBe('__proto__')
    expect(Object.getPrototypeOf(decodedParameters)).toBe(Object.prototype)
    expect(Object.hasOwn(decodedParameters, '__proto__')).toBe(true)
    expect(decodedParameters.__proto__).toEqual({ constructor: true })
    expect(JSON.parse(JSON.stringify(decoded))).toEqual(decoded)
    expectDeeplyFrozen(decoded)
  })
})
