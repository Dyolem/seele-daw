import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  createInstrumentTrackRecord,
  parseClipId,
  parseDeviceId,
  parseMidiSourceId,
  parseNoteId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
} from '#internal/index'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { INITIAL_MODEL_REVISION, type ModelRevision } from '#internal/model/model-revision'
import { ModelStore, type ModelStoreReader } from '#internal/model/model-store'

describe('ModelStore ownership boundary', () => {
  it('starts at revision zero and retains the root records by reference', () => {
    const { seed, records } = createCompleteProjectFixture()
    const store = new ModelStore(seed)

    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
    expect(store.modelRevision).toBe(0)
    expect(store.project).toBe(records.project)
    expect(store.master).toBe(records.master)
    expectTypeOf(store.modelRevision).toEqualTypeOf<ModelRevision>()
    expectTypeOf(store).toMatchTypeOf<ModelStoreReader>()
  })

  it('copies every input container while retaining readonly record identity', () => {
    const { seed, records, containers } = createCompleteProjectFixture()
    const store = new ModelStore(seed)

    containers.trackOrder.splice(0, containers.trackOrder.length, parseTrackId('external-track'))
    containers.tracks.clear()
    containers.clips.clear()
    containers.midiSources.clear()
    containers.nonLoopNotePartition.clear()
    containers.loopingNotePartition.clear()
    containers.midiNotesBySource.clear()
    containers.tempoEvents.clear()
    containers.timeSignatureEvents.clear()
    containers.devices.clear()

    expect([...store.orderedTrackIds()]).toEqual([
      records.instrumentTrack.id,
      records.audioTrack.id,
    ])
    expect(store.getTrack(records.instrumentTrack.id)).toBe(records.instrumentTrack)
    expect(store.getTrack(records.audioTrack.id)).toBe(records.audioTrack)
    expect(store.getClip(records.nonLoopClip.id)).toBe(records.nonLoopClip)
    expect(store.getClip(records.loopingClip.id)).toBe(records.loopingClip)
    expect(store.getMidiSource(records.nonLoopSource.id)).toBe(records.nonLoopSource)
    expect(store.getMidiSource(records.loopingSource.id)).toBe(records.loopingSource)
    expect(store.getMidiNote(records.nonLoopSource.id, records.nonLoopNote.id)).toBe(
      records.nonLoopNote,
    )
    expect(store.getMidiNote(records.loopingSource.id, records.loopingNote.id)).toBe(
      records.loopingNote,
    )
    expect(store.getTempoEvent(records.initialTempoEvent.id)).toBe(records.initialTempoEvent)
    expect(store.getTempoEvent(records.laterTempoEvent.id)).toBe(records.laterTempoEvent)
    expect(store.getTimeSignatureEvent(records.initialTimeSignatureEvent.id)).toBe(
      records.initialTimeSignatureEvent,
    )
    expect(store.getTimeSignatureEvent(records.laterTimeSignatureEvent.id)).toBe(
      records.laterTimeSignatureEvent,
    )
    expect(store.getDevice(records.instrumentDevice.id)).toBe(records.instrumentDevice)
    expect(store.getDevice(records.masterAudioEffectDevice.id)).toBe(
      records.masterAudioEffectDevice,
    )
  })

  it('does not expose its mutable containers or mutation methods', () => {
    const store = new ModelStore(createCompleteProjectFixture().seed)

    for (const propertyName of [
      'trackOrder',
      'tracks',
      'clips',
      'midiSources',
      'midiNotesBySource',
      'tempoEvents',
      'timeSignatureEvents',
      'devices',
      '#trackOrder',
      '#tracks',
      '#clips',
      '#midiSources',
      '#midiNotesBySource',
      '#tempoEvents',
      '#timeSignatureEvents',
      '#devices',
      'setTrack',
      'deleteTrack',
      'incrementRevision',
    ]) {
      expect(store).not.toHaveProperty(propertyName)
    }
  })
})

describe('ModelStoreReader', () => {
  it('queries and traverses every normalized entity table', () => {
    const fixture = createCompleteProjectFixture()
    const { records, containers } = fixture
    const reader: ModelStoreReader = new ModelStore(fixture.seed)

    expect(reader.getTrack(records.instrumentTrack.id)).toBe(records.instrumentTrack)
    expect(reader.getTrack(records.audioTrack.id)).toBe(records.audioTrack)
    expect([...reader.trackEntries()]).toEqual([...containers.tracks])

    expect(reader.getClip(records.nonLoopClip.id)).toBe(records.nonLoopClip)
    expect(reader.getClip(records.loopingClip.id)).toBe(records.loopingClip)
    expect([...reader.clipEntries()]).toEqual([...containers.clips])

    expect(reader.getMidiSource(records.nonLoopSource.id)).toBe(records.nonLoopSource)
    expect(reader.getMidiSource(records.loopingSource.id)).toBe(records.loopingSource)
    expect([...reader.midiSourceEntries()]).toEqual([...containers.midiSources])

    expect(reader.hasMidiNotePartition(records.nonLoopSource.id)).toBe(true)
    expect(reader.hasMidiNotePartition(records.loopingSource.id)).toBe(true)
    expect([...reader.midiNotePartitionIds()]).toEqual([
      records.nonLoopSource.id,
      records.loopingSource.id,
    ])
    expect(reader.getMidiNote(records.nonLoopSource.id, records.nonLoopNote.id)).toBe(
      records.nonLoopNote,
    )
    expect([...reader.midiNoteEntries(records.nonLoopSource.id)]).toEqual([
      ...containers.nonLoopNotePartition,
    ])
    expect(reader.getMidiNote(records.loopingSource.id, records.loopingNote.id)).toBe(
      records.loopingNote,
    )
    expect([...reader.midiNoteEntries(records.loopingSource.id)]).toEqual([
      ...containers.loopingNotePartition,
    ])

    expect(reader.getTempoEvent(records.initialTempoEvent.id)).toBe(records.initialTempoEvent)
    expect(reader.getTempoEvent(records.laterTempoEvent.id)).toBe(records.laterTempoEvent)
    expect([...reader.tempoEventEntries()]).toEqual([...containers.tempoEvents])

    expect(reader.getTimeSignatureEvent(records.initialTimeSignatureEvent.id)).toBe(
      records.initialTimeSignatureEvent,
    )
    expect(reader.getTimeSignatureEvent(records.laterTimeSignatureEvent.id)).toBe(
      records.laterTimeSignatureEvent,
    )
    expect([...reader.timeSignatureEventEntries()]).toEqual([...containers.timeSignatureEvents])

    expect(reader.getDevice(records.midiEffectDevice.id)).toBe(records.midiEffectDevice)
    expect(reader.getDevice(records.instrumentDevice.id)).toBe(records.instrumentDevice)
    expect(reader.getDevice(records.masterAudioEffectDevice.id)).toBe(
      records.masterAudioEffectDevice,
    )
    expect([...reader.deviceEntries()]).toEqual([...containers.devices])
  })

  it('returns undefined or an empty iterator for missing entities and partitions', () => {
    const reader: ModelStoreReader = new ModelStore(createCompleteProjectFixture().seed)
    const missingTrackId = parseTrackId('missing-track')
    const missingClipId = parseClipId('missing-clip')
    const missingSourceId = parseMidiSourceId('missing-source')
    const missingNoteId = parseNoteId('missing-note')
    const missingTempoId = parseTempoEventId('missing-tempo')
    const missingTimeSignatureId = parseTimeSignatureEventId('missing-time-signature')
    const missingDeviceId = parseDeviceId('missing-device')

    expect(reader.getTrack(missingTrackId)).toBeUndefined()
    expect(reader.getClip(missingClipId)).toBeUndefined()
    expect(reader.getMidiSource(missingSourceId)).toBeUndefined()
    expect(reader.getMidiNote(missingSourceId, missingNoteId)).toBeUndefined()
    expect(reader.getTempoEvent(missingTempoId)).toBeUndefined()
    expect(reader.getTimeSignatureEvent(missingTimeSignatureId)).toBeUndefined()
    expect(reader.getDevice(missingDeviceId)).toBeUndefined()
    expect(reader.hasMidiNotePartition(missingSourceId)).toBe(false)
    expect([...reader.midiNoteEntries(missingSourceId)]).toEqual([])
  })

  it('distinguishes an existing empty note partition from a missing partition', () => {
    const { seed } = createCompleteProjectFixture()
    const emptySourceId = parseMidiSourceId('empty-source')
    seed.midiNotesBySource.set(emptySourceId, new Map())

    const reader: ModelStoreReader = new ModelStore(seed)

    expect(reader.hasMidiNotePartition(emptySourceId)).toBe(true)
    expect([...reader.midiNotePartitionIds()]).toContain(emptySourceId)
    expect([...reader.midiNoteEntries(emptySourceId)]).toEqual([])

    const missingSourceId = parseMidiSourceId('missing-source')
    expect(reader.hasMidiNotePartition(missingSourceId)).toBe(false)
    expect([...reader.midiNotePartitionIds()]).not.toContain(missingSourceId)
    expect([...reader.midiNoteEntries(missingSourceId)]).toEqual([])
  })

  it('keeps explicit track order separate from table insertion and timeline traversal order', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.trackOrder.splice(
      0,
      fixture.containers.trackOrder.length,
      fixture.records.audioTrack.id,
      fixture.records.instrumentTrack.id,
    )
    fixture.containers.tempoEvents.clear()
    fixture.containers.tempoEvents.set(
      fixture.records.laterTempoEvent.id,
      fixture.records.laterTempoEvent,
    )
    fixture.containers.tempoEvents.set(
      fixture.records.initialTempoEvent.id,
      fixture.records.initialTempoEvent,
    )

    const reader: ModelStoreReader = new ModelStore(fixture.seed)

    expect([...reader.orderedTrackIds()]).toEqual([
      fixture.records.audioTrack.id,
      fixture.records.instrumentTrack.id,
    ])
    expect([...reader.trackEntries()].map(([id]) => id)).toEqual([
      fixture.records.instrumentTrack.id,
      fixture.records.audioTrack.id,
    ])
    expect([...reader.tempoEventEntries()].map(([id]) => id)).toEqual([
      fixture.records.laterTempoEvent.id,
      fixture.records.initialTempoEvent.id,
    ])
  })
})

describe('ModelStore module boundary', () => {
  it('is not exported from the package root', () => {
    expect(projectCore).not.toHaveProperty('ModelStore')
    expect(projectCore).not.toHaveProperty('INITIAL_MODEL_REVISION')
  })

  it('copies structurally invalid seeds without performing cross-entity validation', () => {
    const { seed, records } = createCompleteProjectFixture()
    const mismatchedTrackKey = parseTrackId('mismatched-table-key')
    const danglingTrackId = parseTrackId('dangling-track-order-entry')
    const danglingDeviceId = parseDeviceId('dangling-instrument')
    const structurallyValidButUnresolvedTrack = createInstrumentTrackRecord({
      id: records.instrumentTrack.id,
      name: records.instrumentTrack.name,
      color: records.instrumentTrack.color,
      channel: records.instrumentTrack.channel,
      midiEffectIds: [],
      instrumentDeviceId: danglingDeviceId,
      audioEffectIds: [],
    })

    seed.trackOrder.splice(0, seed.trackOrder.length, danglingTrackId)
    seed.tracks.clear()
    seed.tracks.set(mismatchedTrackKey, structurallyValidButUnresolvedTrack)
    seed.devices.clear()
    seed.tempoEvents.clear()
    seed.timeSignatureEvents.clear()

    expect(() => new ModelStore(seed)).not.toThrow()

    const store = new ModelStore(seed)
    expect([...store.orderedTrackIds()]).toEqual([danglingTrackId])
    expect(store.getTrack(mismatchedTrackKey)).toBe(structurallyValidButUnresolvedTrack)
    expect(store.getDevice(danglingDeviceId)).toBeUndefined()
    expect([...store.tempoEventEntries()]).toEqual([])
    expect([...store.timeSignatureEventEntries()]).toEqual([])
  })
})
