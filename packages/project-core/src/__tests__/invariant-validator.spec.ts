import { describe, expect, it } from 'vitest'

import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAudioTrackRecord,
  createDeviceDescriptor,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiSourceId,
  parseNoteId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureEventId,
  parseTimeSignatureNumerator,
  parseTrackId,
  type DeviceDescriptor,
  type DeviceId,
} from '#internal/index'
import {
  createCompleteProjectFixture,
  type CompleteProjectFixture,
} from './support/complete-project-fixture'
import {
  assertModelInvariants,
  ModelInvariantError,
  validateModelInvariants,
  type ModelInvariantCode,
} from '#internal/model/invariant-validator'
import { ModelStore, type ModelStoreReader, type ModelStoreSeed } from '#internal/model/model-store'

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

function validateSeed(seed: ModelStoreSeed) {
  return validateModelInvariants(new ModelStore(seed))
}

function codesFor(seed: ModelStoreSeed): readonly ModelInvariantCode[] {
  return validateSeed(seed).map(({ code }) => code)
}

function replaceNonLoopClip(
  fixture: CompleteProjectFixture,
  changes: Partial<Parameters<typeof createMidiClipRecord>[0]>,
): void {
  const replacement = createMidiClipRecord({
    ...fixture.records.nonLoopClip,
    ...changes,
  })

  fixture.containers.clips.set(replacement.id, replacement)
}

describe('validateModelInvariants valid model', () => {
  it('accepts a complete model containing all currently supported topology positions', () => {
    const store = new ModelStore(createCompleteProjectFixture().seed)

    expect(validateModelInvariants(store)).toEqual([])
    expect(() => assertModelInvariants(store)).not.toThrow()
  })

  it('accepts a uniquely owned Descriptor whose Device Definition is unknown', () => {
    const fixture = createCompleteProjectFixture()
    const unknownDevice = createDevice(
      fixture.records.instrumentDevice.id,
      'third-party.future-synth',
    )

    fixture.containers.devices.set(unknownDevice.id, unknownDevice)

    expect(validateSeed(fixture.seed)).toEqual([])
  })
})

describe('Track topology invariants', () => {
  it('rejects duplicate Track IDs in trackOrder', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.trackOrder.push(fixture.records.instrumentTrack.id)

    expect(codesFor(fixture.seed)).toContain('track-order-duplicate')
  })

  it('rejects a trackOrder entry with no Track', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.trackOrder.push(parseTrackId('missing-track'))

    expect(codesFor(fixture.seed)).toContain('track-order-missing-track')
  })

  it('rejects a Track omitted from trackOrder', () => {
    const fixture = createCompleteProjectFixture()
    const trackIndex = fixture.containers.trackOrder.indexOf(fixture.records.instrumentTrack.id)

    fixture.containers.trackOrder.splice(trackIndex, 1)

    expect(codesFor(fixture.seed)).toContain('track-missing-from-order')
  })
})

describe('normalized table key invariants', () => {
  const cases: readonly [string, (fixture: CompleteProjectFixture) => void][] = [
    [
      'Track',
      (fixture) => {
        fixture.containers.tracks.delete(fixture.records.instrumentTrack.id)
        fixture.containers.tracks.set(
          parseTrackId('wrong-track-key'),
          fixture.records.instrumentTrack,
        )
      },
    ],
    [
      'Clip',
      (fixture) => {
        fixture.containers.clips.delete(fixture.records.nonLoopClip.id)
        fixture.containers.clips.set(parseClipId('wrong-clip-key'), fixture.records.nonLoopClip)
      },
    ],
    [
      'MIDI Source',
      (fixture) => {
        fixture.containers.midiSources.delete(fixture.records.nonLoopSource.id)
        fixture.containers.midiSources.set(
          parseMidiSourceId('wrong-source-key'),
          fixture.records.nonLoopSource,
        )
      },
    ],
    [
      'MIDI Note',
      (fixture) => {
        fixture.containers.nonLoopNotePartition.delete(fixture.records.nonLoopNote.id)
        fixture.containers.nonLoopNotePartition.set(
          parseNoteId('wrong-note-key'),
          fixture.records.nonLoopNote,
        )
      },
    ],
    [
      'Tempo Event',
      (fixture) => {
        fixture.containers.tempoEvents.delete(fixture.records.initialTempoEvent.id)
        fixture.containers.tempoEvents.set(
          parseTempoEventId('wrong-tempo-key'),
          fixture.records.initialTempoEvent,
        )
      },
    ],
    [
      'Time Signature Event',
      (fixture) => {
        fixture.containers.timeSignatureEvents.delete(fixture.records.initialTimeSignatureEvent.id)
        fixture.containers.timeSignatureEvents.set(
          parseTimeSignatureEventId('wrong-signature-key'),
          fixture.records.initialTimeSignatureEvent,
        )
      },
    ],
    [
      'Device',
      (fixture) => {
        fixture.containers.devices.delete(fixture.records.instrumentDevice.id)
        fixture.containers.devices.set(
          parseDeviceId('wrong-device-key'),
          fixture.records.instrumentDevice,
        )
      },
    ],
  ]

  it.each(cases)('rejects a %s table key that differs from its Record ID', (_name, mutate) => {
    const fixture = createCompleteProjectFixture()

    mutate(fixture)

    expect(codesFor(fixture.seed)).toContain('table-key-id-mismatch')
  })
})

describe('Clip, Track, and MIDI Source invariants', () => {
  it('rejects a Clip that references a missing Track', () => {
    const fixture = createCompleteProjectFixture()

    replaceNonLoopClip(fixture, { trackId: parseTrackId('missing-track') })

    expect(codesFor(fixture.seed)).toContain('clip-missing-track')
  })

  it('rejects a MIDI Clip placed on an Audio Track', () => {
    const fixture = createCompleteProjectFixture()
    const instrumentTrackAsAudio = createAudioTrackRecord({
      id: fixture.records.instrumentTrack.id,
      name: 'Audio',
      color: null,
      channel: fixture.records.instrumentTrack.channel,
      // Retain every Descriptor owner so this corruption isolates the Track kind rule.
      audioEffectIds: [
        fixture.records.midiEffectDevice.id,
        fixture.records.instrumentDevice.id,
        fixture.records.instrumentAudioEffectDevice.id,
      ],
    })

    fixture.containers.tracks.set(instrumentTrackAsAudio.id, instrumentTrackAsAudio)

    expect(codesFor(fixture.seed)).toContain('clip-track-kind-mismatch')
  })

  it('rejects a Clip that references a missing MIDI Source', () => {
    const fixture = createCompleteProjectFixture()

    replaceNonLoopClip(fixture, { sourceId: parseMidiSourceId('missing-source') })

    expect(codesFor(fixture.seed)).toContain('clip-missing-midi-source')
  })

  it('rejects an unowned MIDI Source', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.clips.delete(fixture.records.nonLoopClip.id)

    expect(codesFor(fixture.seed)).toContain('midi-source-ownership')
  })

  it('rejects a MIDI Source shared by multiple Clips', () => {
    const fixture = createCompleteProjectFixture()
    const secondClip = createMidiClipRecord({
      ...fixture.records.nonLoopClip,
      id: parseClipId('clip-shared-source'),
      startTick: parseTick(5_760),
    })

    fixture.containers.clips.set(secondClip.id, secondClip)

    expect(codesFor(fixture.seed)).toContain('midi-source-ownership')
  })

  it('rejects a non-looping Clip window beyond its MIDI Source', () => {
    const fixture = createCompleteProjectFixture()
    const shortSource = createMidiSourceRecord({
      id: fixture.records.nonLoopSource.id,
      lengthTick: parseTick(960),
    })

    fixture.containers.midiSources.set(shortSource.id, shortSource)

    expect(codesFor(fixture.seed)).toContain('clip-outside-midi-source')
  })

  it('rejects a loop region beyond its MIDI Source', () => {
    const fixture = createCompleteProjectFixture()
    const replacement = createMidiClipRecord({
      ...fixture.records.loopingClip,
      sourceOffsetTick: parseTick(1_200),
      loop: {
        sourceStartTick: parseTick(1_200),
        sourceSpanTick: parseTick(960),
      },
    })

    fixture.containers.clips.set(replacement.id, replacement)

    expect(codesFor(fixture.seed)).toContain('clip-outside-midi-source')
  })
})

describe('MIDI Note partition invariants', () => {
  it('rejects a MIDI Source without a Note partition', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.midiNotesBySource.delete(fixture.records.nonLoopSource.id)

    expect(codesFor(fixture.seed)).toContain('midi-source-missing-note-partition')
  })

  it('rejects a Note partition without a MIDI Source', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.midiNotesBySource.set(parseMidiSourceId('missing-source'), new Map())

    expect(codesFor(fixture.seed)).toContain('note-partition-missing-midi-source')
  })

  it('rejects a MIDI Note that ends beyond its Source', () => {
    const fixture = createCompleteProjectFixture()
    const note = createMidiNoteRecord({
      ...fixture.records.nonLoopNote,
      startTick: parseTick(1_500),
      durationTick: parseTick(500),
    })

    fixture.containers.nonLoopNotePartition.set(note.id, note)

    expect(codesFor(fixture.seed)).toContain('note-outside-midi-source')
  })

  it('requires NoteId values to be unique across Source partitions', () => {
    const fixture = createCompleteProjectFixture()
    const duplicateNote = createMidiNoteRecord({
      ...fixture.records.nonLoopNote,
      startTick: parseTick(240),
    })

    fixture.containers.loopingNotePartition.set(duplicateNote.id, duplicateNote)

    expect(codesFor(fixture.seed)).toContain('note-id-duplicate')
  })
})

describe('Timeline invariants', () => {
  it('requires exactly one Tempo Event at Tick 0', () => {
    const fixture = createCompleteProjectFixture()
    const movedInitialTempo = createTempoEventRecord({
      ...fixture.records.initialTempoEvent,
      tick: parseTick(480),
    })

    fixture.containers.tempoEvents.set(movedInitialTempo.id, movedInitialTempo)

    expect(codesFor(fixture.seed)).toContain('tempo-initial-event-count')
  })

  it('rejects multiple Tempo Events at the same Tick', () => {
    const fixture = createCompleteProjectFixture()

    for (const id of ['tempo-duplicate-a', 'tempo-duplicate-b']) {
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
    const fixture = createCompleteProjectFixture()
    const movedInitialSignature = createTimeSignatureEventRecord({
      ...fixture.records.initialTimeSignatureEvent,
      tick: parseTick(480),
    })

    fixture.containers.timeSignatureEvents.set(movedInitialSignature.id, movedInitialSignature)

    expect(codesFor(fixture.seed)).toContain('time-signature-initial-event-count')
  })

  it('rejects multiple Time Signature Events at the same Tick', () => {
    const fixture = createCompleteProjectFixture()

    for (const id of ['time-signature-duplicate-a', 'time-signature-duplicate-b']) {
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
    const fixture = createCompleteProjectFixture()

    fixture.containers.devices.delete(fixture.records.instrumentDevice.id)

    expect(codesFor(fixture.seed)).toContain('device-missing')
  })

  it('rejects an orphan Device Descriptor', () => {
    const fixture = createCompleteProjectFixture()
    const orphanDevice = createDevice(parseDeviceId('orphan-device'))

    fixture.containers.devices.set(orphanDevice.id, orphanDevice)

    expect(codesFor(fixture.seed)).toContain('device-ownership')
  })

  it('rejects a Device shared by two Tracks', () => {
    const fixture = createCompleteProjectFixture()
    const audioTrack = createAudioTrackRecord({
      ...fixture.records.audioTrack,
      audioEffectIds: [
        ...fixture.records.audioTrack.audioEffectIds,
        fixture.records.instrumentDevice.id,
      ],
    })

    fixture.containers.tracks.set(audioTrack.id, audioTrack)

    expect(codesFor(fixture.seed)).toContain('device-ownership')
  })

  it('rejects a Device shared by a Track and Master', () => {
    const fixture = createCompleteProjectFixture()
    const seed = {
      ...fixture.seed,
      master: createMasterChannelRecord({
        gain: parseLinearGain(1),
        muted: false,
        audioEffectIds: [
          fixture.records.masterAudioEffectDevice.id,
          fixture.records.instrumentDevice.id,
        ],
      }),
    } satisfies ModelStoreSeed

    expect(codesFor(seed)).toContain('device-ownership')
  })
})

describe('Invariant diagnostics', () => {
  it('collects multiple independent violations in one validation pass', () => {
    const fixture = createCompleteProjectFixture()

    fixture.containers.trackOrder.push(fixture.records.instrumentTrack.id)
    fixture.containers.devices.delete(fixture.records.instrumentDevice.id)
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
      const fixture = createCompleteProjectFixture()
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
    const fixture = createCompleteProjectFixture()

    fixture.containers.trackOrder.push(fixture.records.instrumentTrack.id)
    fixture.containers.devices.delete(fixture.records.instrumentDevice.id)

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
    const store: ModelStoreReader = new ModelStore(createCompleteProjectFixture().seed)
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
