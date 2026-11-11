import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  createInstrumentTrackRecord,
  parseClipId,
  parseDeviceId,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
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
    containers.verseNotePartition.clear()
    containers.chorusNotePartition.clear()
    containers.midiNotes.clear()
    containers.verseSustainPedalEventPartition.clear()
    containers.chorusSustainPedalEventPartition.clear()
    containers.midiSustainPedalEvents.clear()
    containers.tempoEvents.clear()
    containers.timeSignatureEvents.clear()
    containers.devices.clear()

    expect([...store.orderedTrackIds()]).toEqual([records.instrumentTrack.id, records.bassTrack.id])
    expect(store.getTrack(records.instrumentTrack.id)).toBe(records.instrumentTrack)
    expect(store.getTrack(records.bassTrack.id)).toBe(records.bassTrack)
    expect(store.getClip(records.verseClip.id)).toBe(records.verseClip)
    expect(store.getClip(records.chorusClip.id)).toBe(records.chorusClip)
    expect(store.getMidiSource(records.verseSource.id)).toBe(records.verseSource)
    expect(store.getMidiSource(records.chorusSource.id)).toBe(records.chorusSource)
    expect(store.getMidiNote(records.verseSource.id, records.verseNote.id)).toBe(records.verseNote)
    expect(store.getMidiNote(records.chorusSource.id, records.chorusNote.id)).toBe(
      records.chorusNote,
    )
    expect(store.getMidiSustainPedalEvent(records.verseSource.id, records.versePedalDown.id)).toBe(
      records.versePedalDown,
    )
    expect(store.getMidiSustainPedalEvent(records.chorusSource.id, records.chorusPedalUp.id)).toBe(
      records.chorusPedalUp,
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
    expect(store.getDevice(records.bassDevice.id)).toBe(records.bassDevice)
  })

  it('does not expose its mutable containers or mutation methods', () => {
    const store = new ModelStore(createCompleteProjectFixture().seed)

    for (const propertyName of [
      'trackOrder',
      'tracks',
      'clips',
      'midiSources',
      'midiNotes',
      'midiSustainPedalEvents',
      'tempoEvents',
      'timeSignatureEvents',
      'devices',
      '#trackOrder',
      '#tracks',
      '#clips',
      '#midiSources',
      '#midiNotes',
      '#midiSustainPedalEvents',
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

  it('hands out frozen read-only table views rather than its containers', () => {
    const store = new ModelStore(createCompleteProjectFixture().seed)

    for (const view of [store.recordTable('tracks'), store.partitionedTable('midiNotes')]) {
      expect(view).not.toBeInstanceOf(Map)
      expect(view).not.toHaveProperty('set')
      expect(view).not.toHaveProperty('delete')
      expect(Object.isFrozen(view)).toBe(true)
    }
  })
})

describe('ModelStoreReader', () => {
  it('queries and traverses every normalized entity table', () => {
    const fixture = createCompleteProjectFixture()
    const { records, containers } = fixture
    const reader: ModelStoreReader = new ModelStore(fixture.seed)

    expect(reader.getTrack(records.instrumentTrack.id)).toBe(records.instrumentTrack)
    expect(reader.getTrack(records.bassTrack.id)).toBe(records.bassTrack)
    expect([...reader.trackEntries()]).toEqual([...containers.tracks])

    expect(reader.getClip(records.verseClip.id)).toBe(records.verseClip)
    expect(reader.getClip(records.chorusClip.id)).toBe(records.chorusClip)
    expect([...reader.clipEntries()]).toEqual([...containers.clips])

    expect(reader.getMidiSource(records.verseSource.id)).toBe(records.verseSource)
    expect(reader.getMidiSource(records.chorusSource.id)).toBe(records.chorusSource)
    expect([...reader.midiSourceEntries()]).toEqual([...containers.midiSources])

    expect(reader.hasMidiNotePartition(records.verseSource.id)).toBe(true)
    expect(reader.hasMidiNotePartition(records.chorusSource.id)).toBe(true)
    expect([...reader.midiNotePartitionIds()]).toEqual([
      records.verseSource.id,
      records.chorusSource.id,
    ])
    expect(reader.getMidiNote(records.verseSource.id, records.verseNote.id)).toBe(records.verseNote)
    expect([...reader.midiNoteEntries(records.verseSource.id)]).toEqual([
      ...containers.verseNotePartition,
    ])
    expect(reader.getMidiNote(records.chorusSource.id, records.chorusNote.id)).toBe(
      records.chorusNote,
    )
    expect([...reader.midiNoteEntries(records.chorusSource.id)]).toEqual([
      ...containers.chorusNotePartition,
    ])

    expect(reader.hasMidiSustainPedalEventPartition(records.verseSource.id)).toBe(true)
    expect(reader.hasMidiSustainPedalEventPartition(records.chorusSource.id)).toBe(true)
    expect([...reader.midiSustainPedalEventPartitionIds()]).toEqual([
      records.verseSource.id,
      records.chorusSource.id,
    ])
    expect(reader.getMidiSustainPedalEvent(records.verseSource.id, records.versePedalDown.id)).toBe(
      records.versePedalDown,
    )
    expect([...reader.midiSustainPedalEventEntries(records.verseSource.id)]).toEqual([
      ...containers.verseSustainPedalEventPartition,
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

    expect(reader.getDevice(records.instrumentDevice.id)).toBe(records.instrumentDevice)
    expect(reader.getDevice(records.bassDevice.id)).toBe(records.bassDevice)
    expect([...reader.deviceEntries()]).toEqual([...containers.devices])
  })

  it('returns undefined or an empty iterator for missing entities and partitions', () => {
    const reader: ModelStoreReader = new ModelStore(createCompleteProjectFixture().seed)
    const missingTrackId = parseTrackId('missing-track')
    const missingClipId = parseClipId('missing-clip')
    const missingSourceId = parseMidiSourceId('missing-source')
    const missingNoteId = parseNoteId('missing-note')
    const missingSustainPedalEventId = parseMidiSustainPedalEventId('missing-sustain-pedal-event')
    const missingTempoId = parseTempoEventId('missing-tempo')
    const missingTimeSignatureId = parseTimeSignatureEventId('missing-time-signature')
    const missingDeviceId = parseDeviceId('missing-device')

    expect(reader.getTrack(missingTrackId)).toBeUndefined()
    expect(reader.getClip(missingClipId)).toBeUndefined()
    expect(reader.getMidiSource(missingSourceId)).toBeUndefined()
    expect(reader.getMidiNote(missingSourceId, missingNoteId)).toBeUndefined()
    expect(
      reader.getMidiSustainPedalEvent(missingSourceId, missingSustainPedalEventId),
    ).toBeUndefined()
    expect(reader.getTempoEvent(missingTempoId)).toBeUndefined()
    expect(reader.getTimeSignatureEvent(missingTimeSignatureId)).toBeUndefined()
    expect(reader.getDevice(missingDeviceId)).toBeUndefined()
    expect(reader.hasMidiNotePartition(missingSourceId)).toBe(false)
    expect([...reader.midiNoteEntries(missingSourceId)]).toEqual([])
    expect(reader.hasMidiSustainPedalEventPartition(missingSourceId)).toBe(false)
    expect([...reader.midiSustainPedalEventEntries(missingSourceId)]).toEqual([])
  })

  it('distinguishes an existing empty note partition from a missing partition', () => {
    const { seed } = createCompleteProjectFixture()
    const emptySourceId = parseMidiSourceId('empty-source')
    seed.midiNotes.set(emptySourceId, new Map())

    const reader: ModelStoreReader = new ModelStore(seed)

    expect(reader.hasMidiNotePartition(emptySourceId)).toBe(true)
    expect([...reader.midiNotePartitionIds()]).toContain(emptySourceId)
    expect([...reader.midiNoteEntries(emptySourceId)]).toEqual([])

    const missingSourceId = parseMidiSourceId('missing-source')
    expect(reader.hasMidiNotePartition(missingSourceId)).toBe(false)
    expect([...reader.midiNotePartitionIds()]).not.toContain(missingSourceId)
    expect([...reader.midiNoteEntries(missingSourceId)]).toEqual([])
  })

  it('distinguishes an existing empty Sustain Pedal Event partition from a missing one', () => {
    const { seed } = createCompleteProjectFixture()
    const emptySourceId = parseMidiSourceId('empty-sustain-pedal-source')
    seed.midiSustainPedalEvents.set(emptySourceId, new Map())

    const reader: ModelStoreReader = new ModelStore(seed)

    expect(reader.hasMidiSustainPedalEventPartition(emptySourceId)).toBe(true)
    expect([...reader.midiSustainPedalEventPartitionIds()]).toContain(emptySourceId)
    expect([...reader.midiSustainPedalEventEntries(emptySourceId)]).toEqual([])

    const missingSourceId = parseMidiSourceId('missing-sustain-pedal-source')
    expect(reader.hasMidiSustainPedalEventPartition(missingSourceId)).toBe(false)
    expect([...reader.midiSustainPedalEventPartitionIds()]).not.toContain(missingSourceId)
    expect([...reader.midiSustainPedalEventEntries(missingSourceId)]).toEqual([])
  })

  it('keeps explicit track order separate from table insertion and timeline traversal order', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.trackOrder.splice(
      0,
      fixture.containers.trackOrder.length,
      fixture.records.bassTrack.id,
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
      fixture.records.bassTrack.id,
      fixture.records.instrumentTrack.id,
    ])
    expect([...reader.trackEntries()].map(([id]) => id)).toEqual([
      fixture.records.instrumentTrack.id,
      fixture.records.bassTrack.id,
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
      instrumentDeviceId: danglingDeviceId,
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
