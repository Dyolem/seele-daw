import { describe, expect, it } from 'vitest'

import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { validateModelInvariants } from '#internal/model/invariant-validator'
import { ModelStore, type ModelStoreReader } from '#internal/model/model-store'

describe('complete project fixture contract', () => {
  it('always creates a complete cross-entity-valid model', () => {
    const fixture = createCompleteProjectFixture()

    expect(validateModelInvariants(new ModelStore(fixture.seed))).toEqual([])
  })

  it('returns fresh records, arrays, Maps, and nested MIDI content partitions', () => {
    const first = createCompleteProjectFixture()
    const second = createCompleteProjectFixture()

    expect(first.seed).not.toBe(second.seed)
    expect(first.records.project).not.toBe(second.records.project)
    expect(first.records.instrumentTrack).not.toBe(second.records.instrumentTrack)
    expect(first.records.master).not.toBe(second.records.master)
    expect(first.containers.trackOrder).not.toBe(second.containers.trackOrder)
    expect(first.containers.tracks).not.toBe(second.containers.tracks)
    expect(first.containers.clips).not.toBe(second.containers.clips)
    expect(first.containers.midiSources).not.toBe(second.containers.midiSources)
    expect(first.containers.midiNotes).not.toBe(second.containers.midiNotes)
    expect(first.containers.verseNotePartition).not.toBe(second.containers.verseNotePartition)
    expect(first.containers.chorusNotePartition).not.toBe(second.containers.chorusNotePartition)
    expect(first.containers.midiSustainPedalEvents).not.toBe(
      second.containers.midiSustainPedalEvents,
    )
    expect(first.containers.verseSustainPedalEventPartition).not.toBe(
      second.containers.verseSustainPedalEventPartition,
    )
    expect(first.containers.chorusSustainPedalEventPartition).not.toBe(
      second.containers.chorusSustainPedalEventPartition,
    )
    expect(first.containers.tempoEvents).not.toBe(second.containers.tempoEvents)
    expect(first.containers.timeSignatureEvents).not.toBe(second.containers.timeSignatureEvents)
    expect(first.containers.devices).not.toBe(second.containers.devices)

    first.containers.trackOrder.length = 0
    first.containers.verseNotePartition.clear()
    first.containers.verseSustainPedalEventPartition.clear()
    first.containers.devices.clear()

    expect(second.containers.trackOrder).toHaveLength(2)
    expect(second.containers.verseNotePartition).toHaveLength(2)
    expect(second.containers.verseSustainPedalEventPartition).toHaveLength(2)
    expect(second.containers.devices).toHaveLength(2)
  })

  it('exposes every current entity and topology position through ModelStoreReader', () => {
    const fixture = createCompleteProjectFixture()
    const reader: ModelStoreReader = new ModelStore(fixture.seed)
    const tracks = [...reader.trackEntries()].map(([, track]) => track)
    const clips = [...reader.clipEntries()].map(([, clip]) => clip)
    const sources = [...reader.midiSourceEntries()].map(([, source]) => source)
    const partitionIds = [...reader.midiNotePartitionIds()]
    const notes = partitionIds.flatMap((sourceId) =>
      [...reader.midiNoteEntries(sourceId)].map(([, note]) => note),
    )
    const sustainPedalEventPartitionIds = [...reader.midiSustainPedalEventPartitionIds()]
    const sustainPedalEvents = sustainPedalEventPartitionIds.flatMap((sourceId) =>
      [...reader.midiSustainPedalEventEntries(sourceId)].map(([, event]) => event),
    )
    const tempoEvents = [...reader.tempoEventEntries()].map(([, event]) => event)
    const timeSignatureEvents = [...reader.timeSignatureEventEntries()].map(([, event]) => event)
    const devices = [...reader.deviceEntries()].map(([, device]) => device)
    const instrumentTrack = reader.getTrack(fixture.records.instrumentTrack.id)
    const bassTrack = reader.getTrack(fixture.records.bassTrack.id)

    expect(tracks).toHaveLength(2)
    expect(instrumentTrack).toBe(fixture.records.instrumentTrack)
    expect(bassTrack).toBe(fixture.records.bassTrack)

    expect(clips).toHaveLength(2)
    expect(clips.every(({ trackId }) => trackId === fixture.records.instrumentTrack.id)).toBe(true)
    expect(clips.some(({ trackId }) => trackId === fixture.records.bassTrack.id)).toBe(false)

    expect(sources).toHaveLength(2)
    expect(partitionIds).toEqual([fixture.records.verseSource.id, fixture.records.chorusSource.id])
    expect(notes).toHaveLength(4)
    expect(new Set(notes.map(({ id }) => id))).toHaveLength(4)
    expect(sustainPedalEventPartitionIds).toEqual(partitionIds)
    expect(sustainPedalEvents).toHaveLength(4)
    expect(new Set(sustainPedalEvents.map(({ id }) => id))).toHaveLength(4)

    expect(tempoEvents).toHaveLength(2)
    expect(tempoEvents.map(({ tick }) => tick)).toEqual([0, 3_840])
    expect(timeSignatureEvents).toHaveLength(2)
    expect(timeSignatureEvents.map(({ tick }) => tick)).toEqual([0, 7_680])

    expect(devices).toHaveLength(2)

    const referencedDeviceIds = tracks.map(({ instrumentDeviceId }) => instrumentDeviceId)

    expect(new Set(referencedDeviceIds)).toHaveLength(2)
    expect(new Set(referencedDeviceIds)).toEqual(new Set(devices.map(({ id }) => id)))
  })
})
