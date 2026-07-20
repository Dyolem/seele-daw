import { describe, expect, it } from 'vitest'

import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { validateModelInvariants } from '@/model/invariant-validator'
import { ModelStore, type ModelStoreReader } from '@/model/model-store'

describe('complete project fixture contract', () => {
  it('always creates a complete cross-entity-valid model', () => {
    const fixture = createCompleteProjectFixture()

    expect(validateModelInvariants(new ModelStore(fixture.seed))).toEqual([])
  })

  it('returns fresh records, arrays, Maps, and nested Note partitions', () => {
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
    expect(first.containers.midiNotesBySource).not.toBe(second.containers.midiNotesBySource)
    expect(first.containers.nonLoopNotePartition).not.toBe(second.containers.nonLoopNotePartition)
    expect(first.containers.loopingNotePartition).not.toBe(second.containers.loopingNotePartition)
    expect(first.containers.tempoEvents).not.toBe(second.containers.tempoEvents)
    expect(first.containers.timeSignatureEvents).not.toBe(second.containers.timeSignatureEvents)
    expect(first.containers.devices).not.toBe(second.containers.devices)

    first.containers.trackOrder.length = 0
    first.containers.nonLoopNotePartition.clear()
    first.containers.devices.clear()

    expect(second.containers.trackOrder).toHaveLength(2)
    expect(second.containers.nonLoopNotePartition).toHaveLength(2)
    expect(second.containers.devices).toHaveLength(5)
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
    const tempoEvents = [...reader.tempoEventEntries()].map(([, event]) => event)
    const timeSignatureEvents = [...reader.timeSignatureEventEntries()].map(([, event]) => event)
    const devices = [...reader.deviceEntries()].map(([, device]) => device)
    const instrumentTrack = reader.getTrack(fixture.records.instrumentTrack.id)
    const audioTrack = reader.getTrack(fixture.records.audioTrack.id)

    expect(tracks).toHaveLength(2)
    expect(tracks.map(({ kind }) => kind)).toEqual(['instrument', 'audio'])
    expect(instrumentTrack).toBe(fixture.records.instrumentTrack)
    expect(audioTrack).toBe(fixture.records.audioTrack)

    expect(clips).toHaveLength(2)
    expect(clips.every(({ trackId }) => trackId === fixture.records.instrumentTrack.id)).toBe(true)
    expect(clips.map(({ loop }) => loop === null)).toEqual([true, false])
    expect(clips.some(({ trackId }) => trackId === fixture.records.audioTrack.id)).toBe(false)

    expect(sources).toHaveLength(2)
    expect(partitionIds).toEqual([
      fixture.records.nonLoopSource.id,
      fixture.records.loopingSource.id,
    ])
    expect(notes).toHaveLength(4)
    expect(new Set(notes.map(({ id }) => id))).toHaveLength(4)

    expect(tempoEvents).toHaveLength(2)
    expect(tempoEvents.map(({ tick }) => tick)).toEqual([0, 3_840])
    expect(timeSignatureEvents).toHaveLength(2)
    expect(timeSignatureEvents.map(({ tick }) => tick)).toEqual([0, 7_680])

    expect(devices).toHaveLength(5)

    if (instrumentTrack?.kind !== 'instrument' || audioTrack?.kind !== 'audio') {
      throw new Error('Fixture Track kinds do not match their named records')
    }

    const referencedDeviceIds = [
      ...instrumentTrack.midiEffectIds,
      instrumentTrack.instrumentDeviceId,
      ...instrumentTrack.audioEffectIds,
      ...audioTrack.audioEffectIds,
      ...reader.master.audioEffectIds,
    ]

    expect(referencedDeviceIds).toHaveLength(5)
    expect(new Set(referencedDeviceIds)).toHaveLength(5)
    expect(new Set(referencedDeviceIds)).toEqual(new Set(devices.map(({ id }) => id)))
  })
})
