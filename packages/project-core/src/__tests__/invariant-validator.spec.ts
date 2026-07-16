import { describe, expect, it } from 'vitest'

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
  type ClipId,
  type ClipRecord,
  type DeviceDescriptor,
  type DeviceId,
  type MidiNoteRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type NoteId,
  type TempoEventId,
  type TempoEventRecord,
  type TimeSignatureEventId,
  type TimeSignatureEventRecord,
  type TrackId,
  type TrackRecord,
} from '..'
import {
  assertModelInvariants,
  ModelInvariantError,
  validateModelInvariants,
  type ModelInvariantCode,
} from '../model/invariant-validator'
import { ModelStore, type ModelStoreReader, type ModelStoreSeed } from '../model/model-store'

function createChannelInput() {
  return {
    gain: parseLinearGain(1),
    pan: parseBipolarValue(0),
    muted: false,
    soloed: false,
  }
}

function createDevice(id: DeviceId, typeId = 'vendor.unknown-device'): DeviceDescriptor {
  return createDeviceDescriptor({
    id,
    typeId: parseDeviceTypeId(typeId),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    parameters: {},
    opaqueState: null,
  })
}

function createValidFixture() {
  const project = createProjectRecord({
    id: parseProjectId('project-1'),
    name: 'Invariant Validator Test',
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
  const device = createDevice(instrumentDeviceId)
  const master = createMasterChannelRecord({
    gain: parseLinearGain(1),
    muted: false,
    audioEffectIds: [],
  })

  const trackOrder = [track.id]
  const tracks = new Map<TrackId, TrackRecord>([[track.id, track]])
  const clips = new Map<ClipId, ClipRecord>([[clip.id, clip]])
  const midiSources = new Map<MidiSourceId, MidiSourceRecord>([[source.id, source]])
  const notePartition = new Map<NoteId, MidiNoteRecord>([[note.id, note]])
  const midiNotesBySource = new Map<MidiSourceId, ReadonlyMap<NoteId, MidiNoteRecord>>([
    [source.id, notePartition],
  ])
  const tempoEvents = new Map<TempoEventId, TempoEventRecord>([[tempoEvent.id, tempoEvent]])
  const timeSignatureEvents = new Map<TimeSignatureEventId, TimeSignatureEventRecord>([
    [timeSignatureEvent.id, timeSignatureEvent],
  ])
  const devices = new Map<DeviceId, DeviceDescriptor>([[device.id, device]])

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
      track,
      clip,
      source,
      note,
      tempoEvent,
      timeSignatureEvent,
      device,
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

type ValidFixture = ReturnType<typeof createValidFixture>

function validateSeed(seed: ModelStoreSeed) {
  return validateModelInvariants(new ModelStore(seed))
}

function codesFor(seed: ModelStoreSeed): readonly ModelInvariantCode[] {
  return validateSeed(seed).map(({ code }) => code)
}

function replaceClip(
  fixture: ValidFixture,
  changes: Partial<Parameters<typeof createMidiClipRecord>[0]>,
): void {
  const replacement = createMidiClipRecord({
    ...fixture.records.clip,
    ...changes,
  })

  fixture.containers.clips.set(replacement.id, replacement)
}

describe('validateModelInvariants valid model', () => {
  it('accepts a complete local 120 BPM and 4/4 model', () => {
    const store = new ModelStore(createValidFixture().seed)

    expect(validateModelInvariants(store)).toEqual([])
    expect(() => assertModelInvariants(store)).not.toThrow()
  })

  it('accepts a uniquely owned Descriptor whose Device Definition is unknown', () => {
    const fixture = createValidFixture()
    const unknownDevice = createDevice(fixture.records.device.id, 'third-party.future-synth')

    fixture.containers.devices.set(unknownDevice.id, unknownDevice)

    expect(validateSeed(fixture.seed)).toEqual([])
  })
})

describe('Track topology invariants', () => {
  it('rejects duplicate Track IDs in trackOrder', () => {
    const fixture = createValidFixture()

    fixture.containers.trackOrder.push(fixture.records.track.id)

    expect(codesFor(fixture.seed)).toContain('track-order-duplicate')
  })

  it('rejects a trackOrder entry with no Track', () => {
    const fixture = createValidFixture()

    fixture.containers.trackOrder.push(parseTrackId('missing-track'))

    expect(codesFor(fixture.seed)).toContain('track-order-missing-track')
  })

  it('rejects a Track omitted from trackOrder', () => {
    const fixture = createValidFixture()

    fixture.containers.trackOrder.length = 0

    expect(codesFor(fixture.seed)).toContain('track-missing-from-order')
  })
})

describe('normalized table key invariants', () => {
  const cases: readonly [string, (fixture: ValidFixture) => void][] = [
    [
      'Track',
      (fixture) => {
        fixture.containers.tracks.delete(fixture.records.track.id)
        fixture.containers.tracks.set(parseTrackId('wrong-track-key'), fixture.records.track)
      },
    ],
    [
      'Clip',
      (fixture) => {
        fixture.containers.clips.delete(fixture.records.clip.id)
        fixture.containers.clips.set(parseClipId('wrong-clip-key'), fixture.records.clip)
      },
    ],
    [
      'MIDI Source',
      (fixture) => {
        fixture.containers.midiSources.delete(fixture.records.source.id)
        fixture.containers.midiSources.set(
          parseMidiSourceId('wrong-source-key'),
          fixture.records.source,
        )
      },
    ],
    [
      'MIDI Note',
      (fixture) => {
        fixture.containers.notePartition.delete(fixture.records.note.id)
        fixture.containers.notePartition.set(parseNoteId('wrong-note-key'), fixture.records.note)
      },
    ],
    [
      'Tempo Event',
      (fixture) => {
        fixture.containers.tempoEvents.delete(fixture.records.tempoEvent.id)
        fixture.containers.tempoEvents.set(
          parseTempoEventId('wrong-tempo-key'),
          fixture.records.tempoEvent,
        )
      },
    ],
    [
      'Time Signature Event',
      (fixture) => {
        fixture.containers.timeSignatureEvents.delete(fixture.records.timeSignatureEvent.id)
        fixture.containers.timeSignatureEvents.set(
          parseTimeSignatureEventId('wrong-signature-key'),
          fixture.records.timeSignatureEvent,
        )
      },
    ],
    [
      'Device',
      (fixture) => {
        fixture.containers.devices.delete(fixture.records.device.id)
        fixture.containers.devices.set(parseDeviceId('wrong-device-key'), fixture.records.device)
      },
    ],
  ]

  it.each(cases)('rejects a %s table key that differs from its Record ID', (_name, mutate) => {
    const fixture = createValidFixture()

    mutate(fixture)

    expect(codesFor(fixture.seed)).toContain('table-key-id-mismatch')
  })
})

describe('Clip, Track, and MIDI Source invariants', () => {
  it('rejects a Clip that references a missing Track', () => {
    const fixture = createValidFixture()

    replaceClip(fixture, { trackId: parseTrackId('missing-track') })

    expect(codesFor(fixture.seed)).toContain('clip-missing-track')
  })

  it('rejects a MIDI Clip placed on an Audio Track', () => {
    const fixture = createValidFixture()
    const audioTrack = createAudioTrackRecord({
      id: fixture.records.track.id,
      name: 'Audio',
      color: null,
      channel: createChannelInput(),
      audioEffectIds: [],
    })

    fixture.containers.tracks.set(audioTrack.id, audioTrack)

    expect(codesFor(fixture.seed)).toContain('clip-track-kind-mismatch')
  })

  it('rejects a Clip that references a missing MIDI Source', () => {
    const fixture = createValidFixture()

    replaceClip(fixture, { sourceId: parseMidiSourceId('missing-source') })

    expect(codesFor(fixture.seed)).toContain('clip-missing-midi-source')
  })

  it('rejects an unowned MIDI Source', () => {
    const fixture = createValidFixture()

    fixture.containers.clips.clear()

    expect(codesFor(fixture.seed)).toContain('midi-source-ownership')
  })

  it('rejects a MIDI Source shared by multiple Clips', () => {
    const fixture = createValidFixture()
    const secondClip = createMidiClipRecord({
      ...fixture.records.clip,
      id: parseClipId('clip-2'),
      startTick: parseTick(1_920),
    })

    fixture.containers.clips.set(secondClip.id, secondClip)

    expect(codesFor(fixture.seed)).toContain('midi-source-ownership')
  })

  it('rejects a non-looping Clip window beyond its MIDI Source', () => {
    const fixture = createValidFixture()
    const shortSource = createMidiSourceRecord({
      id: fixture.records.source.id,
      lengthTick: parseTick(960),
    })

    fixture.containers.midiSources.set(shortSource.id, shortSource)

    expect(codesFor(fixture.seed)).toContain('clip-outside-midi-source')
  })

  it('rejects a loop region beyond its MIDI Source', () => {
    const fixture = createValidFixture()

    replaceClip(fixture, {
      sourceOffsetTick: parseTick(1_000),
      loop: {
        sourceStartTick: parseTick(1_000),
        sourceSpanTick: parseTick(1_000),
      },
    })

    expect(codesFor(fixture.seed)).toContain('clip-outside-midi-source')
  })
})

describe('MIDI Note partition invariants', () => {
  it('rejects a MIDI Source without a Note partition', () => {
    const fixture = createValidFixture()

    fixture.containers.midiNotesBySource.delete(fixture.records.source.id)

    expect(codesFor(fixture.seed)).toContain('midi-source-missing-note-partition')
  })

  it('rejects a Note partition without a MIDI Source', () => {
    const fixture = createValidFixture()

    fixture.containers.midiNotesBySource.set(parseMidiSourceId('missing-source'), new Map())

    expect(codesFor(fixture.seed)).toContain('note-partition-missing-midi-source')
  })

  it('rejects a MIDI Note that ends beyond its Source', () => {
    const fixture = createValidFixture()
    const note = createMidiNoteRecord({
      ...fixture.records.note,
      startTick: parseTick(1_500),
      durationTick: parseTick(500),
    })

    fixture.containers.notePartition.set(note.id, note)

    expect(codesFor(fixture.seed)).toContain('note-outside-midi-source')
  })

  it('requires NoteId values to be unique across Source partitions', () => {
    const fixture = createValidFixture()
    const source = createMidiSourceRecord({
      id: parseMidiSourceId('source-2'),
      lengthTick: parseTick(960),
    })
    const clip = createMidiClipRecord({
      ...fixture.records.clip,
      id: parseClipId('clip-2'),
      sourceId: source.id,
      spanTick: parseTick(960),
    })
    const duplicateNote = createMidiNoteRecord({
      ...fixture.records.note,
      startTick: parseTick(240),
    })

    fixture.containers.midiSources.set(source.id, source)
    fixture.containers.clips.set(clip.id, clip)
    fixture.containers.midiNotesBySource.set(
      source.id,
      new Map([[duplicateNote.id, duplicateNote]]),
    )

    expect(codesFor(fixture.seed)).toContain('note-id-duplicate')
  })
})

describe('Timeline invariants', () => {
  it('requires exactly one Tempo Event at Tick 0', () => {
    const fixture = createValidFixture()
    const laterTempo = createTempoEventRecord({
      ...fixture.records.tempoEvent,
      tick: parseTick(480),
    })

    fixture.containers.tempoEvents.set(laterTempo.id, laterTempo)

    expect(codesFor(fixture.seed)).toContain('tempo-initial-event-count')
  })

  it('rejects multiple Tempo Events at the same Tick', () => {
    const fixture = createValidFixture()

    for (const id of ['tempo-2', 'tempo-3']) {
      const event = createTempoEventRecord({
        id: parseTempoEventId(id),
        tick: parseTick(480),
        bpm: parseTempoBpm(128),
      })
      fixture.containers.tempoEvents.set(event.id, event)
    }

    expect(codesFor(fixture.seed)).toContain('tempo-duplicate-tick')
  })

  it('requires exactly one Time Signature Event at Tick 0', () => {
    const fixture = createValidFixture()
    const laterSignature = createTimeSignatureEventRecord({
      ...fixture.records.timeSignatureEvent,
      tick: parseTick(480),
    })

    fixture.containers.timeSignatureEvents.set(laterSignature.id, laterSignature)

    expect(codesFor(fixture.seed)).toContain('time-signature-initial-event-count')
  })

  it('rejects multiple Time Signature Events at the same Tick', () => {
    const fixture = createValidFixture()

    for (const id of ['time-signature-2', 'time-signature-3']) {
      const event = createTimeSignatureEventRecord({
        id: parseTimeSignatureEventId(id),
        tick: parseTick(480),
        numerator: parseTimeSignatureNumerator(3),
        denominator: parseTimeSignatureDenominator(4),
      })
      fixture.containers.timeSignatureEvents.set(event.id, event)
    }

    expect(codesFor(fixture.seed)).toContain('time-signature-duplicate-tick')
  })
})

describe('Device topology invariants', () => {
  it('rejects a topology reference with no Device Descriptor', () => {
    const fixture = createValidFixture()

    fixture.containers.devices.delete(fixture.records.device.id)

    expect(codesFor(fixture.seed)).toContain('device-missing')
  })

  it('rejects an orphan Device Descriptor', () => {
    const fixture = createValidFixture()
    const orphanDevice = createDevice(parseDeviceId('orphan-device'))

    fixture.containers.devices.set(orphanDevice.id, orphanDevice)

    expect(codesFor(fixture.seed)).toContain('device-ownership')
  })

  it('rejects a Device shared by two Tracks', () => {
    const fixture = createValidFixture()
    const audioTrack = createAudioTrackRecord({
      id: parseTrackId('track-2'),
      name: 'Audio',
      color: null,
      channel: createChannelInput(),
      audioEffectIds: [fixture.records.device.id],
    })

    fixture.containers.tracks.set(audioTrack.id, audioTrack)
    fixture.containers.trackOrder.push(audioTrack.id)

    expect(codesFor(fixture.seed)).toContain('device-ownership')
  })

  it('rejects a Device shared by a Track and Master', () => {
    const fixture = createValidFixture()
    const seed = {
      ...fixture.seed,
      master: createMasterChannelRecord({
        gain: parseLinearGain(1),
        muted: false,
        audioEffectIds: [fixture.records.device.id],
      }),
    } satisfies ModelStoreSeed

    expect(codesFor(seed)).toContain('device-ownership')
  })
})

describe('Invariant diagnostics', () => {
  it('collects multiple independent violations in one validation pass', () => {
    const fixture = createValidFixture()

    fixture.containers.trackOrder.push(fixture.records.track.id)
    fixture.containers.devices.delete(fixture.records.device.id)
    fixture.containers.tempoEvents.clear()

    expect(codesFor(fixture.seed)).toEqual(
      expect.arrayContaining([
        'device-missing',
        'tempo-initial-event-count',
        'track-order-duplicate',
      ]),
    )
  })

  it('returns the same sorted diagnostics regardless of Map insertion order', () => {
    function createSeedWithOrphans(reverse: boolean): ModelStoreSeed {
      const fixture = createValidFixture()
      const devices = [
        createDevice(parseDeviceId('orphan-a')),
        createDevice(parseDeviceId('orphan-b')),
      ]

      if (reverse) {
        devices.reverse()
      }

      for (const device of devices) {
        fixture.containers.devices.set(device.id, device)
      }

      return fixture.seed
    }

    const forward = validateSeed(createSeedWithOrphans(false))
    const reverse = validateSeed(createSeedWithOrphans(true))

    expect(reverse).toEqual(forward)
    expect(forward.map(({ code }) => code)).toEqual(['device-ownership', 'device-ownership'])
  })

  it('exposes the complete sorted violation list through ModelInvariantError', () => {
    const fixture = createValidFixture()

    fixture.containers.trackOrder.push(fixture.records.track.id)
    fixture.containers.devices.delete(fixture.records.device.id)

    const store = new ModelStore(fixture.seed)
    const expectedViolations = validateModelInvariants(store)
    let caughtError: unknown

    try {
      assertModelInvariants(store)
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(ModelInvariantError)

    const invariantError = caughtError as ModelInvariantError

    expect(invariantError.violations).toEqual(expectedViolations)
    expect(invariantError.message).toBe(
      `Model contains ${expectedViolations.length} invariant violations`,
    )
  })

  it('does not modify the ModelStore while validating it', () => {
    const store: ModelStoreReader = new ModelStore(createValidFixture().seed)
    const before = {
      revision: store.modelRevision,
      trackOrder: [...store.orderedTrackIds()],
      tracks: [...store.trackEntries()],
      clips: [...store.clipEntries()],
      sources: [...store.midiSourceEntries()],
      notePartitionIds: [...store.midiNotePartitionIds()],
      notes: [...store.midiNotePartitionIds()].map((sourceId) => [
        sourceId,
        [...store.midiNoteEntries(sourceId)],
      ]),
      tempoEvents: [...store.tempoEventEntries()],
      timeSignatureEvents: [...store.timeSignatureEventEntries()],
      devices: [...store.deviceEntries()],
    }

    expect(validateModelInvariants(store)).toEqual([])
    assertModelInvariants(store)

    expect({
      revision: store.modelRevision,
      trackOrder: [...store.orderedTrackIds()],
      tracks: [...store.trackEntries()],
      clips: [...store.clipEntries()],
      sources: [...store.midiSourceEntries()],
      notePartitionIds: [...store.midiNotePartitionIds()],
      notes: [...store.midiNotePartitionIds()].map((sourceId) => [
        sourceId,
        [...store.midiNoteEntries(sourceId)],
      ]),
      tempoEvents: [...store.tempoEventEntries()],
      timeSignatureEvents: [...store.timeSignatureEventEntries()],
      devices: [...store.deviceEntries()],
    }).toEqual(before)
  })
})
