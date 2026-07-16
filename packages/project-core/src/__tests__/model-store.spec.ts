import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '..'
import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAudioTrackRecord,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureEventId,
  parseTimeSignatureNumerator,
  parseTrackId,
  type TrackId,
  type TrackRecord,
} from '..'
import { ModelStore, type ModelStoreReader, type ModelStoreSeed } from '../model/model-store'
import { INITIAL_MODEL_REVISION, type ModelRevision } from '../model/model-revision'

function createChannelInput() {
  return {
    gain: parseLinearGain(1),
    pan: parseBipolarValue(0),
    muted: false,
    soloed: false,
  }
}

function createFixture() {
  const project = createProjectRecord({
    id: parseProjectId('project-1'),
    name: 'Model Store Test',
  })
  const instrumentDeviceId = parseDeviceId('instrument-1')
  const track = createInstrumentTrackRecord({
    id: parseTrackId('track-1'),
    name: 'Lead',
    color: null,
    channel: createChannelInput(),
    midiEffectIds: [],
    instrumentDeviceId,
    audioEffectIds: [],
  })
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('source-1'),
    lengthTick: parseTick(1_920),
  })
  const note = createMidiNoteRecord({
    id: parseNoteId('note-1'),
    startTick: parseTick(0),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(60),
    velocity: parseMidiVelocity(100),
    channel: parseMidiChannel(1),
  })
  const clip = createMidiClipRecord({
    id: parseClipId('clip-1'),
    trackId: track.id,
    name: 'Verse',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parseTick(1_920),
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
    loop: null,
  })
  const tempoEvent = createTempoEventRecord({
    id: parseTempoEventId('tempo-1'),
    tick: parseTick(0),
    bpm: parseTempoBpm(120),
  })
  const timeSignatureEvent = createTimeSignatureEventRecord({
    id: parseTimeSignatureEventId('time-signature-1'),
    tick: parseTick(0),
    numerator: parseTimeSignatureNumerator(4),
    denominator: parseTimeSignatureDenominator(4),
  })
  const device = createDeviceDescriptor({
    id: instrumentDeviceId,
    typeId: parseDeviceTypeId('seele.basic-synth'),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    parameters: {},
    opaqueState: null,
  })
  const master = createMasterChannelRecord({
    gain: parseLinearGain(1),
    muted: false,
    audioEffectIds: [],
  })

  const trackOrder = [track.id]
  const tracks = new Map<TrackId, TrackRecord>([[track.id, track]])
  const clips = new Map([[clip.id, clip]])
  const midiSources = new Map([[source.id, source]])
  const notePartition = new Map([[note.id, note]])
  const midiNotesBySource = new Map([[source.id, notePartition]])
  const tempoEvents = new Map([[tempoEvent.id, tempoEvent]])
  const timeSignatureEvents = new Map([[timeSignatureEvent.id, timeSignatureEvent]])
  const devices = new Map([[device.id, device]])

  const seed = {
    project,
    trackOrder,
    tracks,
    clips,
    midiSources,
    midiNotesBySource,
    tempoEvents,
    timeSignatureEvents,
    devices,
    master,
  } satisfies ModelStoreSeed

  return {
    seed,
    records: {
      project,
      track,
      clip,
      source,
      note,
      tempoEvent,
      timeSignatureEvent,
      device,
      master,
    },
    containers: {
      trackOrder,
      tracks,
      clips,
      midiSources,
      notePartition,
      midiNotesBySource,
      tempoEvents,
      timeSignatureEvents,
      devices,
    },
  }
}

describe('ModelStore ownership boundary', () => {
  it('starts at revision zero and retains the root records by reference', () => {
    const { seed, records } = createFixture()
    const store = new ModelStore(seed)

    expect(store.modelRevision).toBe(INITIAL_MODEL_REVISION)
    expect(store.modelRevision).toBe(0)
    expect(store.project).toBe(records.project)
    expect(store.master).toBe(records.master)
    expectTypeOf(store.modelRevision).toEqualTypeOf<ModelRevision>()
    expectTypeOf(store).toMatchTypeOf<ModelStoreReader>()
  })

  it('copies every input container while retaining readonly record identity', () => {
    const { seed, records, containers } = createFixture()
    const store = new ModelStore(seed)

    containers.trackOrder.splice(0, containers.trackOrder.length, parseTrackId('external-track'))
    containers.tracks.clear()
    containers.clips.clear()
    containers.midiSources.clear()
    containers.notePartition.clear()
    containers.midiNotesBySource.clear()
    containers.tempoEvents.clear()
    containers.timeSignatureEvents.clear()
    containers.devices.clear()

    expect([...store.orderedTrackIds()]).toEqual([records.track.id])
    expect(store.getTrack(records.track.id)).toBe(records.track)
    expect(store.getClip(records.clip.id)).toBe(records.clip)
    expect(store.getMidiSource(records.source.id)).toBe(records.source)
    expect(store.getMidiNote(records.source.id, records.note.id)).toBe(records.note)
    expect(store.getTempoEvent(records.tempoEvent.id)).toBe(records.tempoEvent)
    expect(store.getTimeSignatureEvent(records.timeSignatureEvent.id)).toBe(
      records.timeSignatureEvent,
    )
    expect(store.getDevice(records.device.id)).toBe(records.device)
  })

  it('does not expose its mutable containers or mutation methods', () => {
    const store = new ModelStore(createFixture().seed)

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
    const { seed, records } = createFixture()
    const reader: ModelStoreReader = new ModelStore(seed)

    expect(reader.getTrack(records.track.id)).toBe(records.track)
    expect([...reader.trackEntries()]).toEqual([[records.track.id, records.track]])
    expect(reader.getClip(records.clip.id)).toBe(records.clip)
    expect([...reader.clipEntries()]).toEqual([[records.clip.id, records.clip]])
    expect(reader.getMidiSource(records.source.id)).toBe(records.source)
    expect([...reader.midiSourceEntries()]).toEqual([[records.source.id, records.source]])
    expect(reader.getTempoEvent(records.tempoEvent.id)).toBe(records.tempoEvent)
    expect([...reader.tempoEventEntries()]).toEqual([[records.tempoEvent.id, records.tempoEvent]])
    expect(reader.getTimeSignatureEvent(records.timeSignatureEvent.id)).toBe(
      records.timeSignatureEvent,
    )
    expect([...reader.timeSignatureEventEntries()]).toEqual([
      [records.timeSignatureEvent.id, records.timeSignatureEvent],
    ])
    expect(reader.getDevice(records.device.id)).toBe(records.device)
    expect([...reader.deviceEntries()]).toEqual([[records.device.id, records.device]])

    expect(reader.hasMidiNotePartition(records.source.id)).toBe(true)
    expect([...reader.midiNotePartitionIds()]).toEqual([records.source.id])
    expect(reader.getMidiNote(records.source.id, records.note.id)).toBe(records.note)
    expect([...reader.midiNoteEntries(records.source.id)]).toEqual([
      [records.note.id, records.note],
    ])
  })

  it('returns undefined or an empty iterator for missing entities and partitions', () => {
    const reader: ModelStoreReader = new ModelStore(createFixture().seed)
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
    const { seed } = createFixture()
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
    const fixture = createFixture()
    const secondTrack = createAudioTrackRecord({
      id: parseTrackId('track-2'),
      name: 'Vocal',
      color: null,
      channel: createChannelInput(),
      audioEffectIds: [],
    })
    const laterTempo = createTempoEventRecord({
      id: parseTempoEventId('tempo-later'),
      tick: parseTick(1_920),
      bpm: parseTempoBpm(140),
    })

    fixture.seed.tracks.set(secondTrack.id, secondTrack)
    fixture.seed.trackOrder.splice(
      0,
      fixture.seed.trackOrder.length,
      secondTrack.id,
      fixture.records.track.id,
    )
    fixture.seed.tempoEvents.clear()
    fixture.seed.tempoEvents.set(laterTempo.id, laterTempo)
    fixture.seed.tempoEvents.set(fixture.records.tempoEvent.id, fixture.records.tempoEvent)

    const reader: ModelStoreReader = new ModelStore(fixture.seed)

    expect([...reader.orderedTrackIds()]).toEqual([secondTrack.id, fixture.records.track.id])
    expect([...reader.trackEntries()].map(([id]) => id)).toEqual([
      fixture.records.track.id,
      secondTrack.id,
    ])
    expect([...reader.tempoEventEntries()].map(([id]) => id)).toEqual([
      laterTempo.id,
      fixture.records.tempoEvent.id,
    ])
  })
})

describe('ModelStore module boundary', () => {
  it('is not exported from the package root', () => {
    expect(projectCore).not.toHaveProperty('ModelStore')
    expect(projectCore).not.toHaveProperty('INITIAL_MODEL_REVISION')
  })

  it('copies structurally invalid seeds without performing cross-entity validation', () => {
    const { seed, records } = createFixture()
    const mismatchedTrackKey = parseTrackId('mismatched-table-key')
    const danglingTrackId = parseTrackId('dangling-track-order-entry')
    const danglingDeviceId = parseDeviceId('dangling-instrument')
    const structurallyValidButUnresolvedTrack = createInstrumentTrackRecord({
      id: records.track.id,
      name: records.track.name,
      color: records.track.color,
      channel: records.track.channel,
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
