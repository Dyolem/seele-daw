import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '~/index'
import {
  PROJECT_FILE_FORMAT_VERSION,
  ProjectFileProjectionError,
  createAddNoteCommand,
  createDeviceDescriptor,
  createMidiNoteRecord,
  createProjectFileDTO,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type DeviceDescriptor,
  type JsonObject,
  type JsonValue,
  type MidiNoteDTO,
  type ProjectFileDTO,
  type ProjectSnapshot,
  type TrackDTO,
} from '~/index'
import { ModelStore, type ModelStoreSeed } from '@/model/model-store'
import { createProjectSession } from '@/session/project-session'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createJsonObject(entries: readonly (readonly [string, JsonValue])[]): JsonObject {
  const output: Record<string, JsonValue> = {}

  for (const [key, value] of entries) {
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  return output
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return

  expect(Object.isFrozen(value)).toBe(true)

  for (const child of Object.values(value)) expectDeeplyFrozen(child)
}

function snapshotWithDevice(seed: ModelStoreSeed, device: DeviceDescriptor): ProjectSnapshot {
  const devices = new Map(seed.devices)
  devices.set(device.id, device)
  return createProjectSession(new ModelStore({ ...seed, devices })).getSnapshot()
}

describe('ProjectFileDTO V1 public contract', () => {
  it('exports the V1 format and projector without exposing persistence internals', () => {
    const { session } = createFixtureProjectSession()
    const dto = createProjectFileDTO(session.getSnapshot())

    expect(PROJECT_FILE_FORMAT_VERSION).toBe(1)
    expect(dto.formatVersion).toBe(PROJECT_FILE_FORMAT_VERSION)
    expect(dto.requiredFeatures).toEqual([])
    expectTypeOf(dto).toEqualTypeOf<ProjectFileDTO>()
    expectTypeOf(Object.values(dto.tracks)).toEqualTypeOf<TrackDTO[]>()
    expectTypeOf(Object.values(Object.values(dto.midiSources)[0]!.notes)).toEqualTypeOf<
      MidiNoteDTO[]
    >()
    expect('modelRevision' in dto).toBe(false)
    expect('parseProjectFileDTO' in projectCore).toBe(false)
    expect('normalizeProjectFileDTO' in projectCore).toBe(false)
    expect('migrateProjectFileDTO' in projectCore).toBe(false)
  })

  it('projects every current project fact into explicit JSON-friendly V1 fields', () => {
    const { fixture, session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const dto = createProjectFileDTO(snapshot)
    const instrumentTrack = dto.tracks[fixture.records.instrumentTrack.id]!
    const audioTrack = dto.tracks[fixture.records.audioTrack.id]!
    const loopingClip = dto.clips[fixture.records.loopingClip.id]!
    const nonLoopSource = dto.midiSources[fixture.records.nonLoopSource.id]!
    const device = dto.devices[fixture.records.instrumentDevice.id]!

    expect(dto).toMatchObject({
      formatVersion: 1,
      requiredFeatures: [],
      projectId: fixture.records.project.id,
      name: fixture.records.project.name,
      trackOrder: fixture.seed.trackOrder,
      master: {
        gain: fixture.records.master.gain,
        muted: fixture.records.master.muted,
        audioEffectIds: fixture.records.master.audioEffectIds,
      },
    })
    expect(Object.keys(dto.tracks)).toEqual(snapshot.tracks.map((track) => track.id))
    expect(Object.keys(dto.clips)).toEqual(snapshot.clips.map((clip) => clip.id))
    expect(Object.keys(dto.midiSources)).toEqual(snapshot.midiSources.map((source) => source.id))
    expect(Object.keys(dto.tempoEvents)).toEqual(snapshot.tempoEvents.map((event) => event.id))
    expect(Object.keys(dto.timeSignatureEvents)).toEqual(
      snapshot.timeSignatureEvents.map((event) => event.id),
    )
    expect(Object.keys(dto.devices)).toEqual(snapshot.devices.map((item) => item.id))
    expect(instrumentTrack).toEqual({
      id: fixture.records.instrumentTrack.id,
      kind: 'instrument',
      name: fixture.records.instrumentTrack.name,
      color: fixture.records.instrumentTrack.color,
      channel: fixture.records.instrumentTrack.channel,
      audioEffectIds: fixture.records.instrumentTrack.audioEffectIds,
      midiEffectIds: fixture.records.instrumentTrack.midiEffectIds,
      instrumentDeviceId: fixture.records.instrumentTrack.instrumentDeviceId,
    })
    expect(audioTrack.kind).toBe('audio')
    expect(loopingClip.loop).toEqual(fixture.records.loopingClip.loop)
    expect(nonLoopSource).toMatchObject({
      id: fixture.records.nonLoopSource.id,
      lengthTick: fixture.records.nonLoopSource.lengthTick,
    })
    expect(Object.values(nonLoopSource.notes)).toEqual(
      snapshot.midiNotePartitions.find(
        (partition) => partition.sourceId === fixture.records.nonLoopSource.id,
      )!.notes,
    )
    expect(dto.tempoEvents[fixture.records.initialTempoEvent.id]).toEqual(
      fixture.records.initialTempoEvent,
    )
    expect(dto.timeSignatureEvents[fixture.records.initialTimeSignatureEvent.id]).toEqual(
      fixture.records.initialTimeSignatureEvent,
    )
    expect(device).toEqual(fixture.records.instrumentDevice)
  })

  it('round-trips losslessly through native JSON text without Maps or runtime revision', () => {
    const { session } = createFixtureProjectSession()
    const dto = createProjectFileDTO(session.getSnapshot())
    const json = JSON.stringify(dto)
    const parsed: unknown = JSON.parse(json)

    expect(parsed).toEqual(dto)
    expect(json).not.toContain('modelRevision')
    expect(json).not.toContain('[object Map]')
  })

  it('deeply owns and freezes DTO objects instead of sharing Snapshot composites', () => {
    const { fixture, session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const dto = createProjectFileDTO(snapshot)
    const trackDTO = dto.tracks[fixture.records.instrumentTrack.id]!
    const sourceDTO = dto.midiSources[fixture.records.nonLoopSource.id]!
    const noteDTO = sourceDTO.notes[fixture.records.nonLoopNote.id]!
    const deviceDTO = dto.devices[fixture.records.instrumentDevice.id]!

    expectDeeplyFrozen(dto)
    expect(trackDTO).not.toBe(fixture.records.instrumentTrack)
    expect(trackDTO.channel).not.toBe(fixture.records.instrumentTrack.channel)
    expect(trackDTO.audioEffectIds).not.toBe(fixture.records.instrumentTrack.audioEffectIds)
    expect(sourceDTO).not.toBe(fixture.records.nonLoopSource)
    expect(noteDTO).not.toBe(fixture.records.nonLoopNote)
    expect(deviceDTO).not.toBe(fixture.records.instrumentDevice)
    expect(deviceDTO.parameters).not.toBe(fixture.records.instrumentDevice.parameters)
  })

  it('canonicalizes nested Device JSON independently of object insertion order', () => {
    const fixture = createCompleteProjectFixture()
    const before = fixture.records.instrumentDevice
    const parametersForward = createJsonObject([
      [
        'zeta',
        createJsonObject([
          ['right', 2],
          ['left', 1],
        ]),
      ],
      [
        'alpha',
        [
          createJsonObject([
            ['b', true],
            ['a', null],
          ]),
        ],
      ],
    ])
    const parametersReverse = createJsonObject([
      [
        'alpha',
        [
          createJsonObject([
            ['a', null],
            ['b', true],
          ]),
        ],
      ],
      [
        'zeta',
        createJsonObject([
          ['left', 1],
          ['right', 2],
        ]),
      ],
    ])
    const createReplacement = (parameters: JsonObject): DeviceDescriptor =>
      createDeviceDescriptor({
        id: before.id,
        typeId: before.typeId,
        definitionVersion: before.definitionVersion,
        enabled: before.enabled,
        parameters: parameters as DeviceDescriptor['parameters'],
        opaqueState: createJsonObject([
          [
            'z',
            createJsonObject([
              ['b', 2],
              ['a', 1],
            ]),
          ],
          ['a', [true, null]],
        ]),
      })
    const forward = createProjectFileDTO(
      snapshotWithDevice(fixture.seed, createReplacement(parametersForward)),
    )
    const reverse = createProjectFileDTO(
      snapshotWithDevice(fixture.seed, createReplacement(parametersReverse)),
    )

    expect(reverse).toEqual(forward)
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward))
    expect(Object.keys(reverse.devices[before.id]!.parameters)).toEqual(['alpha', 'zeta'])
    expectDeeplyFrozen(reverse)
  })

  it('preserves __proto__ opaque IDs as safe own JSON object properties', () => {
    const { fixture, session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const sourceId = fixture.records.nonLoopSource.id
    const specialId = parseNoteId('__proto__')
    const specialNote = createMidiNoteRecord({
      id: specialId,
      startTick: parseTick(1_200),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    const specialSnapshot: ProjectSnapshot = {
      ...snapshot,
      midiNotePartitions: snapshot.midiNotePartitions.map((partition) =>
        partition.sourceId === sourceId
          ? { ...partition, notes: [...partition.notes, specialNote] }
          : partition,
      ),
    }
    const dto = createProjectFileDTO(specialSnapshot)
    const notes = dto.midiSources[sourceId]!.notes

    expect(Object.getPrototypeOf(notes)).toBe(Object.prototype)
    expect(Object.hasOwn(notes, specialId)).toBe(true)
    expect(notes[specialId]).toEqual(specialNote)
    expect(JSON.parse(JSON.stringify(notes))).toHaveProperty(specialId)
  })
})

describe('ProjectFileDTO projection safeguards', () => {
  it('rejects duplicate entity IDs before content can be overwritten', () => {
    const { session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const duplicated: ProjectSnapshot = {
      ...snapshot,
      tracks: [snapshot.tracks[0]!, snapshot.tracks[0]!],
    }

    expect(() => createProjectFileDTO(duplicated)).toThrowError(
      expect.objectContaining<Partial<ProjectFileProjectionError>>({
        code: 'duplicate-entity-id',
        entityKind: 'track',
        entityId: snapshot.tracks[0]!.id,
      }),
    )
  })

  it('rejects a structurally supplied Device parameters value that is not a JSON object', () => {
    const { session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const device = snapshot.devices[0]!
    const invalid: ProjectSnapshot = {
      ...snapshot,
      devices: [
        {
          ...device,
          parameters: [] as unknown as DeviceDescriptor['parameters'],
        },
        ...snapshot.devices.slice(1),
      ],
    }

    expect(() => createProjectFileDTO(invalid)).toThrowError(
      expect.objectContaining<Partial<ProjectFileProjectionError>>({
        code: 'invalid-device-json',
      }),
    )
  })

  it('rejects duplicate, missing, and orphan MIDI Note partitions', () => {
    const { session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const partition = snapshot.midiNotePartitions[0]!
    const missing: ProjectSnapshot = {
      ...snapshot,
      midiNotePartitions: snapshot.midiNotePartitions.slice(1),
    }
    const duplicate: ProjectSnapshot = {
      ...snapshot,
      midiNotePartitions: [...snapshot.midiNotePartitions, partition],
    }
    const orphanSourceId = parseMidiSourceId('source-file-dto-orphan')
    const orphan: ProjectSnapshot = {
      ...snapshot,
      midiNotePartitions: [...snapshot.midiNotePartitions, { sourceId: orphanSourceId, notes: [] }],
    }

    expect(() => createProjectFileDTO(missing)).toThrowError(
      expect.objectContaining<Partial<ProjectFileProjectionError>>({
        code: 'midi-note-partition-missing',
        sourceId: partition.sourceId,
      }),
    )
    expect(() => createProjectFileDTO(duplicate)).toThrowError(
      expect.objectContaining<Partial<ProjectFileProjectionError>>({
        code: 'duplicate-midi-note-partition',
        sourceId: partition.sourceId,
      }),
    )
    expect(() => createProjectFileDTO(orphan)).toThrowError(
      expect.objectContaining<Partial<ProjectFileProjectionError>>({
        code: 'orphan-midi-note-partition',
        sourceId: orphanSourceId,
      }),
    )
  })

  it('keeps a projected file value unchanged after later project commits', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
    const noteId = parseNoteId('note-file-dto-version-isolation')
    const before = createProjectFileDTO(session.getSnapshot())
    const beforeJson = JSON.stringify(before)

    session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId,
        startTick: parseTick(1_200),
        durationTick: parseTick(120),
        pitch: parseMidiPitch(72),
        velocity: parseMidiVelocity(100),
        channel: parseMidiChannel(0),
      }),
    )
    const after = createProjectFileDTO(session.getSnapshot())

    expect(Object.hasOwn(before.midiSources[sourceId]!.notes, noteId)).toBe(false)
    expect(Object.hasOwn(after.midiSources[sourceId]!.notes, noteId)).toBe(true)
    expect(JSON.stringify(before)).toBe(beforeJson)
    expect('modelRevision' in before).toBe(false)
    expect('modelRevision' in after).toBe(false)
  })
})
