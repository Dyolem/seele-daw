import { describe, expect, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  DomainValueError,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
} from '#internal/index'
import { assertModelInvariants, validateModelInvariants } from '#internal/model/invariant-validator'
import { INITIAL_MODEL_REVISION } from '#internal/model/model-revision'
import {
  createInitialModelStore,
  type CreateInitialModelStoreInput,
} from '#internal/model/project-initializer'

function createInput(): CreateInitialModelStoreInput {
  return {
    projectId: parseProjectId('project-initial'),
    projectName: 'New Project',
    tempoEventId: parseTempoEventId('tempo-initial'),
    timeSignatureEventId: parseTimeSignatureEventId('time-signature-initial'),
  }
}

describe('createInitialModelStore', () => {
  it('preserves the caller-provided Project identity, name, and timeline event IDs', () => {
    const input = createInput()
    const store = createInitialModelStore(input)
    const tempoEvents = [...store.tempoEventEntries()]
    const timeSignatureEvents = [...store.timeSignatureEventEntries()]

    expect(store.project).toEqual({
      id: input.projectId,
      name: input.projectName,
    })
    expect(tempoEvents).toHaveLength(1)
    expect(tempoEvents[0]?.[0]).toBe(input.tempoEventId)
    expect(tempoEvents[0]?.[1].id).toBe(input.tempoEventId)
    expect(timeSignatureEvents).toHaveLength(1)
    expect(timeSignatureEvents[0]?.[0]).toBe(input.timeSignatureEventId)
    expect(timeSignatureEvents[0]?.[1].id).toBe(input.timeSignatureEventId)
  })

  it('creates the minimal structural defaults at revision zero', () => {
    const store = createInitialModelStore(createInput())
    const tempoEvent = [...store.tempoEventEntries()][0]?.[1]
    const timeSignatureEvent = [...store.timeSignatureEventEntries()][0]?.[1]

    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
    expect(store.modelRevision).toBe(0)
    expect(tempoEvent).toMatchObject({ tick: 0, bpm: 120 })
    expect(timeSignatureEvent).toMatchObject({
      tick: 0,
      numerator: 4,
      denominator: 4,
    })
    expect(store.master).toEqual({
      gain: 1,
      muted: false,
      audioEffectIds: [],
    })
    expect([...store.orderedTrackIds()]).toEqual([])
    expect([...store.trackEntries()]).toEqual([])
    expect([...store.clipEntries()]).toEqual([])
    expect([...store.midiSourceEntries()]).toEqual([])
    expect([...store.midiNotePartitionIds()]).toEqual([])
    expect([...store.deviceEntries()]).toEqual([])
  })

  it('returns a model accepted by both invariant validation APIs', () => {
    const store = createInitialModelStore(createInput())

    expect(validateModelInvariants(store)).toEqual([])
    expect(() => assertModelInvariants(store)).not.toThrow()
  })

  it('delegates invalid local values to the existing parsers and record factories', () => {
    const input = createInput()

    expect(() =>
      createInitialModelStore({
        ...input,
        projectName: '   ',
      }),
    ).toThrow(DomainValueError)
    expect(() => parseProjectId(' invalid-id ')).toThrow(DomainValueError)
    expect(() => parseTempoEventId('')).toThrow(DomainValueError)
    expect(() => parseTimeSignatureEventId('\ninvalid')).toThrow(DomainValueError)
  })

  it('does not mutate its input and produces deterministic independent stores', () => {
    const input = Object.freeze(createInput())
    const before = { ...input }
    const first = createInitialModelStore(input)
    const second = createInitialModelStore(input)

    expect(input).toEqual(before)
    expect(first).not.toBe(second)
    expect(first.project).not.toBe(second.project)
    expect(first.project).toEqual(second.project)
    expect([...first.tempoEventEntries()]).toEqual([...second.tempoEventEntries()])
    expect([...first.timeSignatureEventEntries()]).toEqual([...second.timeSignatureEventEntries()])
  })
})

describe('project initializer module boundary', () => {
  it('keeps the initializer and ModelStore out of the package root API', () => {
    expect(projectCore).not.toHaveProperty('createInitialModelStore')
    expect(projectCore).not.toHaveProperty('ModelStore')
  })
})
